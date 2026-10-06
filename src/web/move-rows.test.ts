import { describe, expect, it } from "vitest";
import type { MoveRecord } from "../shared/protocol";
import { groupMovesByNumber } from "./move-rows";

const move = (ply: number): MoveRecord => ({
  ply,
  color: ply % 2 === 1 ? "white" : "black",
  author: "engine",
  source: "search",
  piece: "p",
  san: `m${ply}`,
  uci: "a2a3",
  from: "a2",
  to: "a3",
  thinkMs: null,
  depth: null,
  scoreCp: null,
  mateIn: null,
});

describe("groupMovesByNumber", () => {
  it("pairs white and black moves under the same number", () => {
    const rows = groupMovesByNumber([move(1), move(2), move(3), move(4)]);

    expect(rows.map((row) => [row.moveNumber, row.white?.san, row.black?.san])).toEqual([
      [1, "m1", "m2"],
      [2, "m3", "m4"],
    ]);
  });

  it("leaves the black slot empty while black has not moved", () => {
    const rows = groupMovesByNumber([move(1), move(2), move(3)]);

    expect(rows.at(-1)).toMatchObject({ moveNumber: 2, black: null });
  });

  it("returns no rows for an empty game", () => {
    expect(groupMovesByNumber([])).toEqual([]);
  });
});
