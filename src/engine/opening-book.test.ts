import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";
import type { Color } from "../shared/protocol";
import { loadGeneratedBook } from "./generated-book-loader";
import { buildOpeningBook, pickBookMove, withGeneratedBook } from "./opening-book";
import { OPENING_LINES } from "./opening-lines";

const START_FEN = new Chess().fen();

const fenAfter = (...sanMoves: string[]): string => {
  const chess = new Chess();
  for (const san of sanMoves) chess.move(san);
  return chess.fen();
};

describe("OPENING_LINES", () => {
  it.each(["white", "black"] satisfies Color[])("plays only legal moves for %s", (color) => {
    expect(() => buildOpeningBook(OPENING_LINES[color], color)).not.toThrow();
  });

  it("starts every white line with the repertoire first move", () => {
    const firstMoves = new Set(OPENING_LINES.white.map((line) => line.split(" ")[0]));

    expect(firstMoves).toEqual(new Set(["e4"]));
  });
});

describe("pickBookMove", () => {
  const whiteBook = buildOpeningBook(OPENING_LINES.white, "white");
  const blackBook = buildOpeningBook(OPENING_LINES.black, "black");

  it("opens with 1.e4 as white", () => {
    expect(pickBookMove(whiteBook, START_FEN)).toBe("e2e4");
  });

  it("answers 1.e4 with ...e5 as black", () => {
    expect(pickBookMove(blackBook, fenAfter("e4"))).toBe("e7e5");
  });

  it("answers 1.d4 with ...d5 as black", () => {
    expect(pickBookMove(blackBook, fenAfter("d4"))).toBe("d7d5");
  });

  it("leaves the book when the opponent deviates", () => {
    expect(pickBookMove(blackBook, fenAfter("a3"))).toBeNull();
    expect(pickBookMove(whiteBook, fenAfter("e4", "a6"))).toBeNull();
  });

  it("ignores positions where the opponent is the one to move", () => {
    expect(pickBookMove(whiteBook, fenAfter("e4"))).toBeNull();
  });

  it("finds the same position through a transposition", () => {
    const direct = fenAfter("d4", "d5", "c4", "e6", "Nc3");
    const transposed = fenAfter("d4", "e6", "c4", "d5", "Nc3");

    expect(pickBookMove(blackBook, direct)).toBe("g8f6");
    expect(pickBookMove(blackBook, transposed)).toBe("g8f6");
  });

  it("chooses among repertoire replies proportionally to their weight", () => {
    const afterRuyLopezSetup = fenAfter("e4", "e5", "Nf3", "Nc6");

    const lowRoll = pickBookMove(whiteBook, afterRuyLopezSetup, () => 0);
    const highRoll = pickBookMove(whiteBook, afterRuyLopezSetup, () => 0.999);

    expect(lowRoll).toBe("f1b5");
    expect(highRoll).not.toBe(lowRoll);
  });
});

describe("withGeneratedBook", () => {
  it("lets the generated book override and extend the handwritten one", () => {
    const start = new Chess().fen().split(" ").slice(0, 4).join(" ");
    const book = withGeneratedBook(
      buildOpeningBook(["e4 e5"], "white"),
      { white: { [start]: "d2d4" } },
      "white",
    );
    expect(pickBookMove(book, new Chess().fen(), () => 0)).toBe("d2d4");
  });

  it("ignores the other color's entries", () => {
    const start = new Chess().fen().split(" ").slice(0, 4).join(" ");
    const book = withGeneratedBook(
      buildOpeningBook(["e4 e5"], "white"),
      { black: { [start]: "d2d4" } },
      "white",
    );
    expect(pickBookMove(book, new Chess().fen(), () => 0)).toBe("e2e4");
  });
});

describe("generated-book.json", () => {
  it("contains only legal moves", () => {
    const generated = loadGeneratedBook();
    for (const color of ["white", "black"] as const) {
      for (const [key, uci] of Object.entries(generated[color] ?? {})) {
        const chess = new Chess(`${key} 0 1`);
        const legal = chess
          .moves({ verbose: true })
          .map((m) => `${m.from}${m.to}${m.promotion ?? ""}`);
        expect(legal, `${color} ${key}`).toContain(uci);
      }
    }
  });
});
