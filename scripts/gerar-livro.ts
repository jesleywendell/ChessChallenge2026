/**
 * Gerador offline do livro de aberturas (rodar antes do torneio, nunca durante a partida).
 *
 *   npx tsx scripts/gerar-livro.ts <caminho-do-stockfish> [segundos-por-posicao]
 *
 * Para cada posição em que é a nossa vez, o Stockfish analisa com MultiPV 3. Entre os
 * lances a até BOOK_MARGIN_CP do melhor, escolhemos o que deixa a posição mais
 * desequilibrada (mais peças, estrutura de peões assimétrica, roques opostos, bispo x
 * cavalo) e, no empate, o que NÃO é o primeiro do Stockfish: assim o adversário, que
 * também usa Stockfish, sai do livro dele mais cedo.
 *
 * Nas posições do adversário, ramificamos nas respostas mais prováveis dele (os melhores
 * lances do Stockfish), com mais ramos no começo e uma única resposta depois.
 *
 * O resultado vai para src/engine/generated-book.json e o cache das análises para
 * scripts/.book-cache.json, então dá para interromper e retomar.
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { Chess } from "chess.js";

type Line = { multipv: number; scoreCp: number; pv: string[] };
type Analysis = { depth: number; lines: Line[] };
type GeneratedBook = Record<"white" | "black", Record<string, string>>;

const [binaryPath, secondsArg] = process.argv.slice(2);
if (!binaryPath) {
  console.error("uso: npx tsx scripts/gerar-livro.ts <stockfish> [segundos]");
  process.exit(1);
}
const OUR_MS = Math.round(Number(secondsArg ?? 30) * 1000);
const OPPONENT_MS = Math.max(3000, Math.round(OUR_MS / 4));
const THREADS = Number(process.env.BOOK_THREADS ?? 2);
const HASH_MB = Number(process.env.BOOK_HASH_MB ?? 1024);

const OUR_MOVES_DEPTH = 12;
const BOOK_MARGIN_CP = 15;
/** Avaliação mínima aceitável para um lance de livro que não seja o melhor (nosso ponto de vista). */
const SCORE_FLOOR_CP = { white: 5, black: -45 } as const;
const OFF_BOOK_BONUS = 0.75;
const OPPONENT_MARGIN_CP = 40;
const MATE_CP = 10_000;
const BOOK_PATH = "src/engine/generated-book.json";
const CACHE_PATH = "scripts/.book-cache.json";

/** Quantas respostas do adversário seguimos, pelo número do lance dele. */
const opponentBranching = (fullmoveNumber: number): number => (fullmoveNumber <= 3 ? 2 : 1);

const ROOTS: { color: "white" | "black"; moves: string[] }[] = [
  { color: "white", moves: [] },
  { color: "black", moves: ["e2e4"] },
  { color: "black", moves: ["d2d4"] },
  { color: "black", moves: ["c2c4"] },
  { color: "black", moves: ["g1f3"] },
];

const positionKey = (fen: string): string => fen.split(" ").slice(0, 4).join(" ");

const readJson = <T>(path: string, fallback: T): T =>
  existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as T) : fallback;

const cache = readJson<Record<string, Analysis>>(CACHE_PATH, {});
const book = readJson<GeneratedBook>(BOOK_PATH, { white: {}, black: {} });
if (process.argv.includes("--refazer-escolhas")) {
  book.white = {};
  book.black = {};
}
const saveAll = () => {
  writeFileSync(CACHE_PATH, JSON.stringify(cache));
  writeFileSync(BOOK_PATH, `${JSON.stringify(book, null, 1)}\n`);
};

// ---------- UCI mínimo ----------
const engine = spawn(binaryPath, [], { stdio: ["pipe", "pipe", "inherit"] });
const send = (command: string) => engine.stdin.write(`${command}\n`);
let onLine: (line: string) => void = () => undefined;
createInterface({ input: engine.stdout }).on("line", (line) => onLine(line));
const waitFor = (prefix: string) =>
  new Promise<void>((resolve) => {
    onLine = (line) => {
      if (line.startsWith(prefix)) resolve();
    };
  });

const analyse = async (fen: string, movetimeMs: number): Promise<Analysis> => {
  const cacheKey = `${fen}|${movetimeMs}`;
  const cached = cache[cacheKey];
  if (cached) return cached;

  const byIndex = new Map<number, Line & { depth: number }>();
  const done = new Promise<void>((resolve) => {
    onLine = (line) => {
      if (line.startsWith("bestmove")) return resolve();
      if (!line.startsWith("info") || !line.includes(" pv ")) return;
      const tokens = line.split(" ");
      if (tokens.includes("lowerbound") || tokens.includes("upperbound")) return;
      const at = (key: string) => tokens[tokens.indexOf(key) + 1] ?? "0";
      const scoreKind = at("score");
      const scoreValue = Number(tokens[tokens.indexOf("score") + 2]);
      const scoreCp =
        scoreKind === "mate" ? Math.sign(scoreValue) * (MATE_CP - Math.abs(scoreValue)) : scoreValue;
      byIndex.set(Number(at("multipv")), {
        multipv: Number(at("multipv")),
        depth: Number(at("depth")),
        scoreCp,
        pv: tokens.slice(tokens.indexOf("pv") + 1),
      });
    };
  });
  send(`position fen ${fen}`);
  send(`go movetime ${movetimeMs}`);
  await done;

  const lines = [...byIndex.values()].sort((a, b) => a.multipv - b.multipv);
  const analysis: Analysis = {
    depth: lines[0]?.depth ?? 0,
    lines: lines.map(({ multipv, scoreCp, pv }) => ({ multipv, scoreCp, pv })),
  };
  cache[cacheKey] = analysis;
  return analysis;
};

// ---------- heurística de desequilíbrio ----------
const imbalanceScore = (fen: string, pv: string[]): number => {
  const chess = new Chess(fen);
  for (const uci of pv.slice(0, 8)) {
    try {
      chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    } catch {
      break;
    }
  }
  const board = chess.board().flat().filter((square) => square !== null);
  const count = (type: string, color: "w" | "b") =>
    board.filter((piece) => piece.type === type && piece.color === color).length;

  const pieces = board.filter((piece) => piece.type !== "p" && piece.type !== "k").length;

  let pawnAsymmetry = 0;
  for (const file of "abcdefgh") {
    const onFile = (color: "w" | "b") =>
      chess
        .board()
        .flat()
        .filter((sq) => sq?.type === "p" && sq.color === color && sq.square[0] === file).length;
    if (onFile("w") !== onFile("b")) pawnAsymmetry += 1;
  }

  const kingFile = (color: "w" | "b") =>
    board.find((piece) => piece.type === "k" && piece.color === color)?.square.charCodeAt(0) ?? 101;
  const [white, black] = [kingFile("w") - 97, kingFile("b") - 97];
  const oppositeCastling = (white <= 2 && black >= 6) || (black <= 2 && white >= 6) ? 1 : 0;

  const minorImbalance = count("b", "w") !== count("b", "b") ? 1 : 0;

  return pieces + 1.5 * pawnAsymmetry + 4 * oppositeCastling + 2 * minorImbalance;
};

const chooseOurMove = (
  color: "white" | "black",
  fen: string,
  analysis: Analysis,
): string | null => {
  const [best] = analysis.lines;
  if (!best) return null;
  const floor = Math.min(best.scoreCp, SCORE_FLOOR_CP[color]);
  const candidates = analysis.lines.filter(
    (line) =>
      line.pv[0] && line.scoreCp >= best.scoreCp - BOOK_MARGIN_CP && line.scoreCp >= floor,
  );
  const ranked = candidates
    .map((line) => ({
      move: line.pv[0] as string,
      value: imbalanceScore(fen, line.pv) + (line.multipv > 1 ? OFF_BOOK_BONUS : 0),
    }))
    .sort((a, b) => b.value - a.value);
  return ranked[0]?.move ?? best.pv[0] ?? null;
};

// ---------- percorre a árvore ----------
let analysed = 0;
const startedAt = Date.now();

const walk = async (color: "white" | "black", moves: string[], ourMovesSoFar: number) => {
  if (ourMovesSoFar >= OUR_MOVES_DEPTH) return;
  const chess = new Chess();
  for (const uci of moves) {
    chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
  }
  if (chess.isGameOver()) return;
  const fen = chess.fen();
  const ourTurn = (chess.turn() === "w") === (color === "white");

  if (ourTurn) {
    const key = positionKey(fen);
    let move = book[color][key] ?? null;
    if (!move) {
      const analysis = await analyse(fen, OUR_MS);
      move = chooseOurMove(color, fen, analysis);
      if (!move) return;
      book[color][key] = move;
      analysed += 1;
      saveAll();
      const minutes = ((Date.now() - startedAt) / 60000).toFixed(1);
      console.log(
        `[${minutes} min] ${color} #${analysed} ${moves.length} plies -> ${move} (d${analysis.depth}, ${analysis.lines[0]?.scoreCp}cp)`,
      );
    }
    await walk(color, [...moves, move], ourMovesSoFar + 1);
    return;
  }

  const analysis = await analyse(fen, OPPONENT_MS);
  saveAll();
  const [best] = analysis.lines;
  if (!best) return;
  const replies = analysis.lines
    .filter((line) => line.pv[0] && line.scoreCp >= best.scoreCp - OPPONENT_MARGIN_CP)
    .slice(0, opponentBranching(chess.moveNumber()))
    .map((line) => line.pv[0] as string);
  for (const reply of replies) await walk(color, [...moves, reply], ourMovesSoFar);
};

const main = async () => {
  send("uci");
  await waitFor("uciok");
  send(`setoption name Threads value ${THREADS}`);
  send(`setoption name Hash value ${HASH_MB}`);
  send("setoption name MultiPV value 3");
  send("isready");
  await waitFor("readyok");
  console.log(`livro: ${OUR_MS / 1000}s por posição nossa, ${OPPONENT_MS / 1000}s do adversário`);
  for (const root of ROOTS) await walk(root.color, root.moves, 0);
  saveAll();
  console.log(`concluído: ${Object.keys(book.white).length} posições de brancas, ${Object.keys(book.black).length} de pretas`);
  send("quit");
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
