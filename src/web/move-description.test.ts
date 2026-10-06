import { describe, expect, it } from "vitest";
import type { MoveRecord } from "../shared/protocol";
import { describeMove } from "./move-description";

const record = (overrides: Partial<MoveRecord>): MoveRecord => ({
  ply: 1,
  color: "white",
  author: "engine",
  source: "search",
  piece: "n",
  san: "Nf3",
  uci: "g1f3",
  from: "g1",
  to: "f3",
  thinkMs: null,
  depth: null,
  scoreCp: null,
  mateIn: null,
  ...overrides,
});

describe("describeMove", () => {
  it("names the piece and the squares", () => {
    expect(describeMove(record({}))).toBe("Cavalo g1 → f3");
  });

  it("flags captures", () => {
    expect(describeMove(record({ piece: "b", san: "Bxf7+", from: "c4", to: "f7" }))).toBe(
      "Bispo c4 → f7 (captura)",
    );
  });

  it("describes castling by the king move", () => {
    expect(describeMove(record({ piece: "k", san: "O-O", from: "e1", to: "g1" }))).toBe(
      "Roque curto: Rei e1 → g1",
    );
    expect(describeMove(record({ piece: "k", san: "O-O-O+", from: "e8", to: "c8" }))).toBe(
      "Roque longo: Rei e8 → c8",
    );
  });

  it("describes promotion with the chosen piece", () => {
    expect(describeMove(record({ piece: "p", san: "exd8=Q+", from: "e7", to: "d8" }))).toBe(
      "Peão e7 → d8 (captura) e promove a Dama",
    );
  });
});
