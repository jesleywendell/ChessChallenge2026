import { describe, expect, it } from "vitest";
import type { GameSnapshot, MoveRecord } from "../shared/protocol";
import { buildPgn } from "./pgn";

const record = (ply: number, uci: string, san: string): MoveRecord => ({
  ply,
  color: ply % 2 === 1 ? "white" : "black",
  author: ply % 2 === 1 ? "engine" : "opponent",
  source: "search",
  piece: "p",
  san,
  uci,
  from: uci.slice(0, 2),
  to: uci.slice(2, 4),
  thinkMs: null,
  depth: null,
  scoreCp: null,
  mateIn: null,
});

const snapshot = (overrides: Partial<GameSnapshot>): GameSnapshot => ({
  phase: "playing",
  config: { ourColor: "white", initialClockMs: 1_500_000, humanOverheadMs: 5_000 },
  fen: "",
  turn: "white",
  inCheck: false,
  moves: [record(1, "e2e4", "e4"), record(2, "e7e5", "e5")],
  clock: { whiteMs: 0, blackMs: 0, runningColor: null, paused: false },
  engine: { state: "ready", message: null },
  result: null,
  resumedFromDisk: false,
  ...overrides,
});

describe("buildPgn", () => {
  it("lists the moves and names the players by color", () => {
    const pgn = buildPgn(snapshot({}));

    expect(pgn).toContain('[White "IA (Stockfish)"]');
    expect(pgn).toContain('[Black "Adversário"]');
    expect(pgn).toContain("1. e4 e5");
    expect(pgn).toContain('[Result "*"]');
  });

  it("swaps the player names when the engine plays black", () => {
    const pgn = buildPgn(
      snapshot({
        config: { ourColor: "black", initialClockMs: 1_500_000, humanOverheadMs: 5_000 },
      }),
    );

    expect(pgn).toContain('[White "Adversário"]');
    expect(pgn).toContain('[Black "IA (Stockfish)"]');
  });

  it("records the final result", () => {
    const pgn = buildPgn(
      snapshot({ result: { outcome: "checkmate", winner: "white" }, phase: "finished" }),
    );

    expect(pgn).toContain('[Result "1-0"]');
  });
});
