import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pino from "pino";
import { describe, expect, it } from "vitest";
import { createFileGameStore, type SavedGame } from "./game-store";

const game = (plies: number): SavedGame => ({
  config: { ourColor: "white", initialClockMs: 1_500_000, humanOverheadMs: 5_000 },
  moves: Array.from({ length: plies }, (_, index) => ({
    ply: index + 1,
    color: index % 2 === 0 ? "white" : "black",
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
  })),
  remainingMsByColor: { white: 1_000, black: 1_000 },
});

describe("createFileGameStore", () => {
  it("keeps a valid snapshot when many saves overlap", async () => {
    const directory = await mkdtemp(join(tmpdir(), "store-"));
    const filePath = join(directory, "game.json");
    const store = createFileGameStore(filePath, pino({ level: "silent" }));

    await Promise.all(Array.from({ length: 30 }, (_, index) => store.save(game(30 - index))));

    const saved = JSON.parse(await readFile(filePath, "utf8"));
    expect(saved.moves).toHaveLength(1);
    expect(await store.load()).not.toBeNull();
  });
});
