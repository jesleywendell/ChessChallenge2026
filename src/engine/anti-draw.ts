import { Chess } from "chess.js";
import { playMove } from "../shared/chess-utils";
import type { SearchLine } from "./stockfish-engine";

/**
 * Anti-empate. Contra outro Stockfish quase tudo empata, e empate vale 1 ponto contra 3
 * da vitória. Com MultiPV, o Stockfish devolve as melhores linhas; aqui escolhemos entre
 * elas:
 *
 * - perdendo (avaliação < DRAW_ACCEPT_BELOW_CP) ou com mate na mesa: lance do Stockfish,
 *   sem mexer (o empate é bem-vindo quando estamos pior);
 * - se o melhor lance repete uma posição da partida: troca por uma alternativa que não
 *   repita, desde que ela não caia abaixo do limite;
 * - senão, com avaliação até COMPLEXITY_MAX_CP, entre os lances a até `marginCp` do
 *   melhor, prefere o que mantém mais peças no tabuleiro após a variante e evita trocas
 *   simplificadoras. Ganhando por mais que isso, deixamos o Stockfish converter.
 */
export const DRAW_ACCEPT_BELOW_CP = -30;
export const DEFAULT_MARGIN_CP = 15;
export const PRESSURE_MARGIN_CP = 25;
/** Acima disso já estamos ganhando: trocar peças ajuda a converter, então só evitamos repetição. */
export const COMPLEXITY_MAX_CP = 150;

const MATE_CP = 10_000;
const COMPLEXITY_PLIES = 4;
const TRADE_PENALTY = 3;

export type AntiDrawInput = {
  fen: string;
  /** Quantas vezes cada posição (chave FEN sem contadores) já apareceu na partida. */
  seenPositions: ReadonlyMap<string, number>;
  lines: readonly SearchLine[];
  marginCp: number;
};

export type AntiDrawChoice = {
  line: SearchLine;
  reason: "avoid-repetition" | "keep-complexity";
};

export const positionKey = (fen: string): string => fen.split(" ").slice(0, 4).join(" ");

const lineScore = (line: SearchLine): number => {
  if (line.mateIn !== null) return Math.sign(line.mateIn) * (MATE_CP - Math.abs(line.mateIn));
  return line.scoreCp ?? 0;
};

const playUci = (chess: Chess, uci: string): boolean => {
  try {
    playMove(chess, uci);
    return true;
  } catch {
    return false;
  }
};

type Features = { repeats: boolean; trade: boolean; complexity: number };

const describeLine = (fen: string, line: SearchLine, seen: ReadonlyMap<string, number>) => {
  const [first, reply] = line.principalVariation;
  const chess = new Chess(fen);
  if (!first || !playUci(chess, first)) return null;

  const firstMove = chess.history({ verbose: true }).at(-1);
  const repeats = (seen.get(positionKey(chess.fen())) ?? 0) > 0;
  const trade = Boolean(firstMove?.captured && reply && reply.slice(2, 4) === first.slice(2, 4));

  for (const uci of line.principalVariation.slice(1, COMPLEXITY_PLIES)) {
    if (!playUci(chess, uci)) break;
  }
  const pieces = chess
    .board()
    .flat()
    .filter((square) => square !== null && square.type !== "k").length;

  return { repeats, trade, complexity: pieces } satisfies Features;
};

export const chooseAntiDrawMove = ({
  fen,
  seenPositions,
  lines,
  marginCp,
}: AntiDrawInput): AntiDrawChoice | null => {
  const [best] = lines;
  if (!best || lines.length < 2) return null;
  if (best.mateIn !== null) return null;

  const bestScore = lineScore(best);
  if (bestScore < DRAW_ACCEPT_BELOW_CP) return null;

  const described = lines
    .map((line) => ({
      line,
      score: lineScore(line),
      features: describeLine(fen, line, seenPositions),
    }))
    .filter(
      (entry): entry is typeof entry & { features: Features } =>
        entry.features !== null &&
        (entry.line.mateIn === null || entry.line.mateIn > 0) &&
        entry.score >= DRAW_ACCEPT_BELOW_CP,
    );

  const bestEntry = described.find((entry) => entry.line === best);
  const nonRepeating = described.filter((entry) => !entry.features.repeats);

  if (bestEntry?.features.repeats) {
    const alternative = nonRepeating.sort((a, b) => b.score - a.score)[0];
    return alternative ? { line: alternative.line, reason: "avoid-repetition" } : null;
  }

  if (bestScore > COMPLEXITY_MAX_CP) return null;

  const value = (entry: (typeof described)[number]) =>
    entry.features.complexity - (entry.features.trade ? TRADE_PENALTY : 0) + entry.score / 50;
  const ranked = nonRepeating
    .filter((entry) => entry.score >= bestScore - marginCp)
    .sort((a, b) => value(b) - value(a));
  const chosen = ranked[0];
  if (!chosen || chosen.line === best) return null;
  return { line: chosen.line, reason: "keep-complexity" };
};
