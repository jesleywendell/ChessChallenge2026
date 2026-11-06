import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";
import { chooseAntiDrawMove, positionKey } from "./anti-draw";
import type { SearchLine } from "./stockfish-engine";

const line = (multipv: number, scoreCp: number, pv: string[]): SearchLine => ({
  multipv,
  depth: 20,
  scoreCp,
  mateIn: null,
  principalVariation: pv,
});

const START = new Chess().fen();

describe("chooseAntiDrawMove", () => {
  it("keeps Stockfish's move when we are worse (a draw is welcome)", () => {
    const choice = chooseAntiDrawMove({
      fen: START,
      seenPositions: new Map(),
      lines: [line(1, -60, ["e2e4"]), line(2, -65, ["d2d4"])],
      marginCp: 15,
    });
    expect(choice).toBeNull();
  });

  it("refuses a repetition while the evaluation is still acceptable", () => {
    const afterE4 = new Chess();
    afterE4.move("e4");
    const choice = chooseAntiDrawMove({
      fen: START,
      seenPositions: new Map([[positionKey(afterE4.fen()), 2]]),
      lines: [line(1, 0, ["e2e4"]), line(2, -20, ["d2d4"]), line(3, -80, ["a2a3"])],
      marginCp: 15,
    });
    expect(choice).toMatchObject({
      reason: "avoid-repetition",
      line: { principalVariation: ["d2d4"] },
    });
  });

  it("accepts the repetition if every alternative is too bad", () => {
    const afterE4 = new Chess();
    afterE4.move("e4");
    const choice = chooseAntiDrawMove({
      fen: START,
      seenPositions: new Map([[positionKey(afterE4.fen()), 2]]),
      lines: [line(1, 0, ["e2e4"]), line(2, -90, ["a2a3"])],
      marginCp: 15,
    });
    expect(choice).toBeNull();
  });

  it("prefers a close alternative that avoids a simplifying trade", () => {
    // Brancas podem trocar damas (Qxd8+ Kxd8) ou manter a tensão (Nc3) com avaliação parecida.
    const fen = "rnbqkbnr/ppp2ppp/8/3p4/3Q4/8/PPP1PPPP/RNB1KBNR w KQkq - 0 3";
    const choice = chooseAntiDrawMove({
      fen,
      seenPositions: new Map(),
      lines: [line(1, 20, ["d4d5", "d8d5"]), line(2, 10, ["b1c3", "g8f6"])],
      marginCp: 15,
    });
    expect(choice).toMatchObject({
      reason: "keep-complexity",
      line: { principalVariation: ["b1c3", "g8f6"] },
    });
  });

  it("never gives up more than the margin", () => {
    const fen = "rnbqkbnr/ppp2ppp/8/3p4/3Q4/8/PPP1PPPP/RNB1KBNR w KQkq - 0 3";
    const choice = chooseAntiDrawMove({
      fen,
      seenPositions: new Map(),
      lines: [line(1, 40, ["d4d5", "d8d5"]), line(2, 10, ["b1c3", "g8f6"])],
      marginCp: 15,
    });
    expect(choice).toBeNull();
  });

  it("lets Stockfish simplify when we are clearly winning", () => {
    const fen = "rnbqkbnr/ppp2ppp/8/3p4/3Q4/8/PPP1PPPP/RNB1KBNR w KQkq - 0 3";
    const choice = chooseAntiDrawMove({
      fen,
      seenPositions: new Map(),
      lines: [line(1, 400, ["d4d5", "d8d5"]), line(2, 395, ["b1c3", "g8f6"])],
      marginCp: 15,
    });
    expect(choice).toBeNull();
  });

  it("does nothing with a mate on the board", () => {
    const choice = chooseAntiDrawMove({
      fen: START,
      seenPositions: new Map(),
      lines: [{ ...line(1, 0, ["e2e4"]), scoreCp: null, mateIn: 3 }, line(2, 500, ["d2d4"])],
      marginCp: 15,
    });
    expect(choice).toBeNull();
  });
});
