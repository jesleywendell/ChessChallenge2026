import { Chess, type Move, type PieceSymbol } from "chess.js";
import type { Color, GameResult } from "./protocol";

export const COLOR_BY_TURN = { w: "white", b: "black" } as const;

const UCI_MOVE_PATTERN = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/i;
const MAX_PRINCIPAL_VARIATION_MOVES = 6;

const PIECE_VALUES: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

export class IllegalMoveError extends Error {
  constructor(input: string) {
    super(`Lance ilegal nesta posição: "${input}"`);
    this.name = "IllegalMoveError";
  }
}

export const toUci = (move: Pick<Move, "from" | "to" | "promotion">): string =>
  `${move.from}${move.to}${move.promotion ?? ""}`;

type MoveInput = string | { from: string; to: string; promotion?: string };

const toMoveInput = (text: string): MoveInput => {
  const uci = UCI_MOVE_PATTERN.exec(text.trim());
  if (!uci) return text.trim();
  const [, from = "", to = "", promotion] = uci;
  return promotion
    ? { from: from.toLowerCase(), to: to.toLowerCase(), promotion: promotion.toLowerCase() }
    : { from: from.toLowerCase(), to: to.toLowerCase() };
};

/** Aceita lance em UCI ("e2e4", "e7e8q") ou SAN ("Nf3", "O-O"). */
export const playMove = (chess: Chess, text: string): Move => {
  try {
    return chess.move(toMoveInput(text));
  } catch {
    throw new IllegalMoveError(text);
  }
};

export const detectResult = (chess: Chess, lastMover: Color): GameResult | null => {
  if (chess.isCheckmate()) return { outcome: "checkmate", winner: lastMover };
  if (chess.isStalemate()) return { outcome: "stalemate", winner: null };
  if (chess.isInsufficientMaterial()) return { outcome: "insufficient-material", winner: null };
  if (chess.isThreefoldRepetition()) return { outcome: "threefold-repetition", winner: null };
  if (chess.isDraw()) return { outcome: "fifty-move-rule", winner: null };
  return null;
};

export const principalVariationToSan = (fen: string, uciMoves: readonly string[]): string[] => {
  const chess = new Chess(fen);
  const sanMoves: string[] = [];
  for (const uci of uciMoves.slice(0, MAX_PRINCIPAL_VARIATION_MOVES)) {
    try {
      sanMoves.push(playMove(chess, uci).san);
    } catch {
      break;
    }
  }
  return sanMoves;
};

/** Último recurso se o Stockfish falhar: xeque-mate em 1, melhor captura ou lance aleatório. */
export const pickEmergencyMove = (chess: Chess, random: () => number): string | null => {
  const legalMoves = chess.moves({ verbose: true });
  if (legalMoves.length === 0) return null;

  const mating = legalMoves.find((move) => move.san.endsWith("#"));
  if (mating) return toUci(mating);

  const captureValue = (move: Move): number =>
    move.captured ? PIECE_VALUES[move.captured] - PIECE_VALUES[move.piece] / 10 : -1;
  const bestCapture = legalMoves.reduce((best, move) =>
    captureValue(move) > captureValue(best) ? move : best,
  );
  if (captureValue(bestCapture) > 0) return toUci(bestCapture);

  const randomMove = legalMoves[Math.floor(random() * legalMoves.length)];
  return randomMove ? toUci(randomMove) : null;
};
