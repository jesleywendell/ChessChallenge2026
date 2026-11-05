import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";
import {
  detectResult,
  IllegalMoveError,
  pickEmergencyMove,
  playMove,
  principalVariationToSan,
} from "./chess-utils";

describe("playMove", () => {
  it("accepts SAN and UCI", () => {
    const chess = new Chess();

    expect(playMove(chess, "e4").san).toBe("e4");
    expect(playMove(chess, "e7e5").san).toBe("e5");
    expect(playMove(chess, "Nf3").san).toBe("Nf3");
  });

  it("accepts castling and promotion in UCI", () => {
    const castling = new Chess("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
    const promotion = new Chess("8/P6k/8/8/8/8/8/K7 w - - 0 1");

    expect(playMove(castling, "e1g1").san).toBe("O-O");
    expect(playMove(promotion, "a7a8n").san).toBe("a8=N");
  });

  it("rejects a promotion without the piece", () => {
    const promotion = new Chess("8/P6k/8/8/8/8/8/K7 w - - 0 1");

    expect(() => playMove(promotion, "a7a8")).toThrow(IllegalMoveError);
  });

  it("rejects illegal moves", () => {
    expect(() => playMove(new Chess(), "e2e5")).toThrow(IllegalMoveError);
    expect(() => playMove(new Chess(), "Ke2")).toThrow(IllegalMoveError);
  });
});

describe("detectResult", () => {
  it("reports checkmate with the winner", () => {
    const chess = new Chess();
    for (const move of ["f3", "e5", "g4", "Qh4#"]) chess.move(move);

    expect(detectResult(chess, "black")).toEqual({ outcome: "checkmate", winner: "black" });
  });

  it("reports stalemate and insufficient material as draws", () => {
    expect(detectResult(new Chess("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1"), "white")).toEqual({
      outcome: "stalemate",
      winner: null,
    });
    expect(detectResult(new Chess("8/8/8/4k3/8/3K4/8/8 w - - 0 1"), "black")).toEqual({
      outcome: "insufficient-material",
      winner: null,
    });
  });

  it("returns null while the game continues", () => {
    expect(detectResult(new Chess(), "white")).toBeNull();
  });
});

describe("pickEmergencyMove", () => {
  it("plays mate in one when available", () => {
    const chess = new Chess("6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1");

    expect(pickEmergencyMove(chess, () => 0)).toBe("a1a8");
  });

  it("prefers capturing the most valuable piece", () => {
    const chess = new Chess("4k3/8/8/3q1p2/4P3/8/8/4K3 w - - 0 1");

    expect(pickEmergencyMove(chess, () => 0)).toBe("e4d5");
  });

  it("falls back to a legal move", () => {
    const chess = new Chess();

    const uci = pickEmergencyMove(chess, () => 0.5);

    expect(uci).not.toBeNull();
    expect(() => playMove(chess, uci ?? "")).not.toThrow();
  });

  it("returns null when there are no legal moves", () => {
    expect(pickEmergencyMove(new Chess("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1"), () => 0)).toBeNull();
  });
});

describe("principalVariationToSan", () => {
  it("converts a UCI line into SAN from the root position", () => {
    const fen = new Chess().fen();

    expect(principalVariationToSan(fen, ["e2e4", "e7e5", "g1f3"])).toEqual(["e4", "e5", "Nf3"]);
  });

  it("stops at the first illegal move", () => {
    const fen = new Chess().fen();

    expect(principalVariationToSan(fen, ["e2e4", "e2e4", "g1f3"])).toEqual(["e4"]);
  });
});

describe("castling input", () => {
  it.each(["O-O", "0-0", "o-o", "oo", "e1g1", "e1h1"])("accepts %s as short castling", (input) => {
    const chess = new Chess("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
    expect(playMove(chess, input).san).toBe("O-O");
  });

  it.each(["O-O-O", "0-0-0", "o-o-o", "e1c1", "e1a1"])("accepts %s as long castling", (input) => {
    const chess = new Chess("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
    expect(playMove(chess, input).san).toBe("O-O-O");
  });
});
