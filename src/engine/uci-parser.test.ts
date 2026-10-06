import { describe, expect, it } from "vitest";
import { parseUciLine } from "./uci-parser";

describe("parseUciLine", () => {
  it("parses handshake acknowledgements", () => {
    expect(parseUciLine("uciok")).toEqual({ kind: "uciok" });
    expect(parseUciLine("readyok\r")).toEqual({ kind: "readyok" });
  });

  it("parses an exact centipawn info line", () => {
    const message = parseUciLine(
      "info depth 20 seldepth 28 multipv 1 score cp 35 nodes 1234567 nps 5000000 hashfull 100 tbhits 0 time 246 pv e2e4 e7e5 g1f3",
    );

    expect(message).toEqual({
      kind: "info",
      info: {
        depth: 20,
        scoreCp: 35,
        mateIn: null,
        bound: "exact",
        nodes: 1234567,
        nodesPerSecond: 5000000,
        timeMs: 246,
        principalVariation: ["e2e4", "e7e5", "g1f3"],
      },
    });
  });

  it("parses mate scores with negative distance", () => {
    const message = parseUciLine("info depth 9 score mate -3 nodes 10 nps 1 time 1 pv a2a3");

    expect(message).toMatchObject({ kind: "info", info: { scoreCp: null, mateIn: -3 } });
  });

  it("flags aspiration window bounds", () => {
    const message = parseUciLine(
      "info depth 12 score cp 80 lowerbound nodes 1 nps 1 time 1 pv d2d4",
    );

    expect(message).toMatchObject({ kind: "info", info: { bound: "lowerbound", scoreCp: 80 } });
  });

  it("parses bestmove with and without ponder move", () => {
    expect(parseUciLine("bestmove e2e4 ponder e7e5")).toEqual({
      kind: "bestmove",
      move: "e2e4",
      ponderMove: "e7e5",
    });
    expect(parseUciLine("bestmove e2e4")).toEqual({
      kind: "bestmove",
      move: "e2e4",
      ponderMove: null,
    });
  });

  it("treats bestmove (none) as no move", () => {
    expect(parseUciLine("bestmove (none)")).toEqual({
      kind: "bestmove",
      move: null,
      ponderMove: null,
    });
  });

  it("ignores info lines without score and principal variation", () => {
    expect(parseUciLine("info depth 5 currmove e2e4 currmovenumber 1").kind).toBe("other");
    expect(parseUciLine("info string NNUE evaluation using nn-abc.nnue").kind).toBe("other");
  });
});
