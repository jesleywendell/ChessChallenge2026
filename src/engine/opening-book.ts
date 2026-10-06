import { Chess } from "chess.js";
import type { Color } from "../shared/protocol";

type BookEntry = { uci: string; weight: number };
export type OpeningBook = ReadonlyMap<string, readonly BookEntry[]>;

const COLOR_BY_TURN = { w: "white", b: "black" } as const;
const POSITION_KEY_FIELDS = 4;

const positionKey = (fen: string): string => fen.split(" ").slice(0, POSITION_KEY_FIELDS).join(" ");

const toUci = (move: { from: string; to: string; promotion?: string | undefined }): string =>
  `${move.from}${move.to}${move.promotion ?? ""}`;

export const buildOpeningBook = (lines: readonly string[], ourColor: Color): OpeningBook => {
  const weightsByPosition = new Map<string, Map<string, number>>();

  for (const line of lines) {
    const game = new Chess();
    for (const san of line.split(" ")) {
      const key = positionKey(game.fen());
      const turn = COLOR_BY_TURN[game.turn()];
      const move = game.move(san);
      if (turn !== ourColor) continue;

      const weights = weightsByPosition.get(key) ?? new Map<string, number>();
      const uci = toUci(move);
      weights.set(uci, (weights.get(uci) ?? 0) + 1);
      weightsByPosition.set(key, weights);
    }
  }

  return new Map(
    [...weightsByPosition].map(([key, weights]) => [
      key,
      [...weights].map(([uci, weight]) => ({ uci, weight })),
    ]),
  );
};

export const pickBookMove = (
  book: OpeningBook,
  fen: string,
  random: () => number = Math.random,
): string | null => {
  const entries = book.get(positionKey(fen));
  if (!entries) return null;

  const totalWeight = entries.reduce((sum, entry) => sum + entry.weight, 0);
  let threshold = random() * totalWeight;
  for (const entry of entries) {
    threshold -= entry.weight;
    if (threshold < 0) return entry.uci;
  }
  return entries.at(-1)?.uci ?? null;
};
