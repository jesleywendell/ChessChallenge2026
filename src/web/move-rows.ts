import type { MoveRecord } from "../shared/protocol";

export type MoveRow = {
  moveNumber: number;
  white: MoveRecord | null;
  black: MoveRecord | null;
};

export const groupMovesByNumber = (moves: readonly MoveRecord[]): MoveRow[] => {
  const rows: MoveRow[] = [];
  for (const move of moves) {
    const moveNumber = Math.ceil(move.ply / 2);
    const row = rows.at(-1)?.moveNumber === moveNumber ? rows.at(-1) : undefined;
    if (row) {
      row[move.color] = move;
      continue;
    }
    rows.push({
      moveNumber,
      white: move.color === "white" ? move : null,
      black: move.color === "black" ? move : null,
    });
  }
  return rows;
};
