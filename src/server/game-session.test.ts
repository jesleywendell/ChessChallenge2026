import { pino } from "pino";
import { describe, expect, it, vi } from "vitest";
import type { GameConfig } from "../shared/protocol";
import { FakeEngine, type FakeOutcome } from "./fake-engine";
import { GameSession } from "./game-session";
import type { GameStore, SavedGame } from "./game-store";

const silentLogger = pino({ level: "silent" });
const START_MS = 1_000_000;

const config = (overrides: Partial<GameConfig> = {}): GameConfig => ({
  ourColor: "black",
  initialClockMs: 25 * 60 * 1000,
  humanOverheadMs: 5_000,
  ...overrides,
});

const createMemoryStore = () => {
  const state: { saved: SavedGame | null } = { saved: null };
  const store: GameStore = {
    save: async (game) => {
      state.saved = structuredClone(game);
    },
    load: async () => state.saved,
    clear: async () => {
      state.saved = null;
    },
  };
  return { store, state };
};

const setup = (script: (moves: string[]) => FakeOutcome, store = createMemoryStore()) => {
  const engine = new FakeEngine((moves) => script(moves));
  let nowMs = START_MS;
  const session = new GameSession({
    engine,
    store: store.store,
    logger: silentLogger,
    nowMs: () => nowMs,
    random: () => 0,
  });
  return {
    engine,
    session,
    store,
    advanceTime: (ms: number) => {
      nowMs += ms;
    },
  };
};

const moveCount = (session: GameSession) => session.getSnapshot().moves.length;

describe("GameSession", () => {
  describe("opening as white", () => {
    it("plays the first book move without searching", async () => {
      const { session, engine } = setup(() => ({ hang: true }));

      await session.startGame(config({ ourColor: "white" }));

      await vi.waitFor(() => expect(moveCount(session)).toBe(1));
      expect(session.getSnapshot().moves[0]).toMatchObject({
        san: "e4",
        author: "engine",
        source: "book",
      });
      expect(engine.calls).toHaveLength(0);
      expect(engine.newGames).toBe(1);
    });

    it("hands the clock to the opponent after the engine moves", async () => {
      const { session } = setup(() => ({ hang: true }));

      await session.startGame(config({ ourColor: "white" }));

      await vi.waitFor(() => expect(session.getSnapshot().clock.runningColor).toBe("black"));
    });
  });

  describe("opponent moves", () => {
    it("rejects moves while the engine is thinking", async () => {
      const { session } = setup(() => ({ hang: true }));
      await session.startGame(config());
      expect(session.applyOpponentMove("a3")).toEqual({ ok: true });

      const result = session.applyOpponentMove("a6");

      expect(result).toEqual({ ok: false, message: "Aguarde: é a vez da IA." });
    });

    it("rejects illegal moves with feedback and keeps the position", async () => {
      const { session } = setup(() => ({ hang: true }));
      await session.startGame(config());

      const result = session.applyOpponentMove("e2e5");

      expect(result).toMatchObject({ ok: false });
      expect(moveCount(session)).toBe(0);
    });

    it("accepts both SAN and UCI notation", async () => {
      const { session } = setup((moves) =>
        moves.length === 1 ? { bestMove: "e7e5" } : { bestMove: "g8f6" },
      );
      await session.startGame(config());

      expect(session.applyOpponentMove("a2a3")).toEqual({ ok: true });
      await vi.waitFor(() => expect(moveCount(session)).toBe(2));

      expect(session.applyOpponentMove("Nc3")).toEqual({ ok: true });
      expect(session.getSnapshot().moves[2]).toMatchObject({ san: "Nc3", uci: "b1c3" });
    });

    it("refuses moves when no game is running", () => {
      const { session } = setup(() => ({ hang: true }));

      expect(session.applyOpponentMove("e4")).toEqual({
        ok: false,
        message: "Não há partida em andamento.",
      });
    });
  });

  describe("engine replies", () => {
    it("searches with the time budget and records the analysis", async () => {
      const { session, engine } = setup(() => ({ bestMove: "e7e5", depth: 31, scoreCp: 42 }));
      await session.startGame(config());

      session.applyOpponentMove("a3");
      await vi.waitFor(() => expect(moveCount(session)).toBe(2));

      const [searchCall] = engine.calls;
      expect(searchCall?.moves).toEqual(["a2a3"]);
      expect(searchCall?.limits.kind).toBe("adaptive");
      expect(session.getSnapshot().moves[1]).toMatchObject({
        san: "e5",
        author: "engine",
        source: "search",
        depth: 31,
        scoreCp: 42,
      });
    });

    it("charges the human overhead to the engine clock", async () => {
      const { session, advanceTime } = setup(() => ({ bestMove: "e7e5" }));
      await session.startGame(config({ humanOverheadMs: 5_000 }));
      advanceTime(2_000);
      session.applyOpponentMove("a3");
      advanceTime(3_000);
      await vi.waitFor(() => expect(moveCount(session)).toBe(2));

      const { clock } = session.getSnapshot();

      expect(clock.blackMs).toBe(25 * 60 * 1000 - 3_000 - 5_000);
    });

    it("plays an only legal move without searching", async () => {
      const { session, engine } = setup((moves) =>
        moves.length === 3 ? { bestMove: "b8c6" } : { hang: true },
      );
      await session.startGame(config());
      session.applyOpponentMove("e4");
      await vi.waitFor(() => expect(moveCount(session)).toBe(2));
      session.applyOpponentMove("Qh5");
      await vi.waitFor(() => expect(moveCount(session)).toBe(4));
      const searchesBeforeSacrifice = engine.calls.length;

      session.applyOpponentMove("Qxf7+");
      await vi.waitFor(() => expect(moveCount(session)).toBe(6));

      expect(session.getSnapshot().moves[5]).toMatchObject({ san: "Kxf7", source: "forced" });
      expect(engine.calls).toHaveLength(searchesBeforeSacrifice);
    });
  });

  describe("pondering", () => {
    const script = (moves: string[]): FakeOutcome => {
      if (moves.length === 1) return { bestMove: "e7e5", ponderMove: "b1c3" };
      if (moves.join(" ") === "a2a3 e7e5 b1c3") return { bestMove: "g8f6" };
      return { bestMove: "d7d5" };
    };

    it("starts an open-ended search on the predicted reply after moving", async () => {
      const { session, engine } = setup(script);
      await session.startGame(config());

      session.applyOpponentMove("a3");
      await vi.waitFor(() => expect(engine.calls).toHaveLength(2));

      expect(engine.calls[1]).toMatchObject({
        moves: ["a2a3", "e7e5", "b1c3"],
        limits: { kind: "infinite" },
      });
      await vi.waitFor(() => expect(session.getSnapshot().engine.state).toBe("pondering"));
    });

    it("credits the pondered time when the opponent plays the predicted move", async () => {
      const { session, engine } = setup(script);
      engine.ponderElapsedMs = 90_000;
      await session.startGame(config());
      session.applyOpponentMove("a3");
      await vi.waitFor(() => expect(engine.calls).toHaveLength(2));

      session.applyOpponentMove("Nc3");
      await vi.waitFor(() => expect(moveCount(session)).toBe(4));

      expect(engine.calls[1]?.stopped).toBe(true);
      expect(session.getSnapshot().moves[3]).toMatchObject({ san: "Nf6", source: "ponder-hit" });
      expect(engine.calls[2]?.limits).toMatchObject({ kind: "adaptive", softMs: 500 });
    });

    it("discards the ponder search and uses the full budget on a miss", async () => {
      const { session, engine } = setup(script);
      await session.startGame(config());
      session.applyOpponentMove("a3");
      await vi.waitFor(() => expect(engine.calls).toHaveLength(2));

      session.applyOpponentMove("h3");
      await vi.waitFor(() => expect(moveCount(session)).toBe(4));

      expect(engine.calls[1]?.stopped).toBe(true);
      expect(session.getSnapshot().moves[3]).toMatchObject({ source: "search" });
      const missLimits = engine.calls[2]?.limits;
      expect(missLimits?.kind === "adaptive" && missLimits.softMs).toBeGreaterThan(5_000);
    });
  });

  describe("takeback", () => {
    it("cancels the ponder search and recomputes the engine move", async () => {
      const { session, engine } = setup((moves) =>
        moves.length === 1 ? { bestMove: "e7e5", ponderMove: "b1c3" } : { bestMove: "e7e5" },
      );
      await session.startGame(config());
      session.applyOpponentMove("a3");
      await vi.waitFor(() => expect(engine.calls).toHaveLength(2));

      expect(session.takeback()).toEqual({ ok: true });

      expect(engine.calls[1]?.stopped).toBe(true);
      await vi.waitFor(() => expect(moveCount(session)).toBe(2));
      const searches = engine.calls.filter((call) => call.limits.kind === "adaptive");
      expect(searches.map((call) => call.moves)).toEqual([["a2a3"], ["a2a3"]]);
    });

    it("discards a pending engine answer when the opponent move is undone", async () => {
      const { session } = setup(() => ({ hang: true }));
      await session.startGame(config());
      session.applyOpponentMove("a3");

      session.takeback();

      expect(moveCount(session)).toBe(0);
      expect(session.getSnapshot().turn).toBe("white");
      expect(session.applyOpponentMove("d4")).toEqual({ ok: true });
    });

    it("refuses to undo on an empty game", async () => {
      const { session } = setup(() => ({ hang: true }));
      await session.startGame(config());

      expect(session.takeback()).toEqual({ ok: false, message: "Não há lance para desfazer." });
    });
  });

  describe("engine failure", () => {
    it("restarts the engine and plays an emergency move after repeated failures", async () => {
      const { session, engine } = setup(() => ({ error: new Error("crash") }));
      await session.startGame(config());

      session.applyOpponentMove("a3");
      await vi.waitFor(() => expect(moveCount(session)).toBe(2));

      expect(engine.restarts).toBeGreaterThanOrEqual(1);
      expect(session.getSnapshot().moves[1]).toMatchObject({ source: "emergency" });
      expect(session.getSnapshot().engine.state).toBe("error");
    });

    it("retries with less power and less time after each failure", async () => {
      let failures = 0;
      const { session, engine } = setup(() => {
        failures += 1;
        return failures <= 2 ? { error: new Error("crash") } : { bestMove: "e7e5" };
      });
      await session.startGame(config());

      session.applyOpponentMove("a3");
      await vi.waitFor(() => expect(moveCount(session)).toBe(2));

      expect(engine.restartLevels).toEqual([1, 2]);
      const softLimits = engine.calls.map((call) =>
        call.limits.kind === "adaptive" ? call.limits.softMs : 0,
      );
      expect(softLimits[1]).toBeLessThan(softLimits[0] ?? 0);
      expect(softLimits[2]).toBeLessThan(softLimits[1] ?? 0);
      expect(session.getSnapshot().moves[1]).toMatchObject({ san: "e5", source: "search" });
    });

    it("recovers after a single failure by retrying the search", async () => {
      let failures = 0;
      const { session } = setup(() => {
        failures += 1;
        return failures === 1 ? { error: new Error("crash") } : { bestMove: "e7e5" };
      });
      await session.startGame(config());

      session.applyOpponentMove("a3");
      await vi.waitFor(() => expect(moveCount(session)).toBe(2));

      expect(session.getSnapshot().moves[1]).toMatchObject({ san: "e5", source: "search" });
      expect(session.getSnapshot().engine.state).toBe("ready");
    });

    it("rejects an illegal engine move and retries", async () => {
      let attempts = 0;
      const { session } = setup(() => {
        attempts += 1;
        return attempts === 1 ? { bestMove: "e2e4" } : { bestMove: "e7e5" };
      });
      await session.startGame(config());

      session.applyOpponentMove("a3");
      await vi.waitFor(() => expect(moveCount(session)).toBe(2));

      expect(session.getSnapshot().moves[1]).toMatchObject({ san: "e5" });
    });
  });

  describe("game end", () => {
    it("finishes the game on checkmate and stops the clock", async () => {
      const { session } = setup((moves) =>
        moves.length === 1 ? { bestMove: "e7e5" } : { bestMove: "d8h4" },
      );
      await session.startGame(config());
      session.applyOpponentMove("f3");
      await vi.waitFor(() => expect(moveCount(session)).toBe(2));

      session.applyOpponentMove("g4");
      await vi.waitFor(() => expect(session.getSnapshot().phase).toBe("finished"));

      const snapshot = session.getSnapshot();
      expect(snapshot.result).toEqual({ outcome: "checkmate", winner: "black" });
      expect(snapshot.clock.runningColor).toBeNull();
      expect(session.applyOpponentMove("a3")).toMatchObject({ ok: false });
    });

    it("lets the operator undo a move after the game ended", async () => {
      const { session } = setup((moves) =>
        moves.length === 1 ? { bestMove: "e7e5" } : { bestMove: "d8h4" },
      );
      await session.startGame(config());
      session.applyOpponentMove("f3");
      await vi.waitFor(() => expect(moveCount(session)).toBe(2));
      session.applyOpponentMove("g4");
      await vi.waitFor(() => expect(session.getSnapshot().phase).toBe("finished"));

      session.takeback();

      expect(session.getSnapshot().phase).toBe("playing");
      expect(session.getSnapshot().result).toBeNull();
    });
  });

  describe("persistence", () => {
    it("saves the game after each move and resumes it paused", async () => {
      const memory = createMemoryStore();
      const first = setup(() => ({ bestMove: "e7e5" }), memory);
      await first.session.startGame(config());
      first.session.applyOpponentMove("a3");
      await vi.waitFor(() => expect(moveCount(first.session)).toBe(2));
      await vi.waitFor(() => expect(memory.state.saved?.moves).toHaveLength(2));

      const second = setup(() => ({ hang: true }), memory);
      const restored = await second.session.restoreFromDisk();

      expect(restored).toBe(true);
      const snapshot = second.session.getSnapshot();
      expect(snapshot.moves.map((move) => move.san)).toEqual(["a3", "e5"]);
      expect(snapshot.clock.paused).toBe(true);
      expect(snapshot.resumedFromDisk).toBe(true);
      expect(snapshot.config).toEqual(config());
    });

    it("ignores a saved game with inconsistent moves", async () => {
      const memory = createMemoryStore();
      const first = setup(() => ({ bestMove: "e7e5" }), memory);
      await first.session.startGame(config());
      first.session.applyOpponentMove("a3");
      await vi.waitFor(() => expect(memory.state.saved?.moves).toHaveLength(2));
      const corrupted = memory.state.saved;
      if (corrupted?.moves[1]) corrupted.moves[1] = { ...corrupted.moves[1], uci: "e7e4" };

      const second = setup(() => ({ hang: true }), memory);

      expect(await second.session.restoreFromDisk()).toBe(false);
      expect(second.session.getSnapshot().phase).toBe("setup");
    });

    it("clears the saved game when resetting", async () => {
      const memory = createMemoryStore();
      const { session } = setup(() => ({ hang: true }), memory);
      await session.startGame(config());

      await session.resetGame();

      expect(memory.state.saved).toBeNull();
      expect(session.getSnapshot().phase).toBe("setup");
    });
  });

  describe("clock controls", () => {
    it("lets the operator sync a clock with the physical one", async () => {
      const { session } = setup(() => ({ hang: true }));
      await session.startGame(config());

      session.setClock("black", 600_000);

      expect(session.getSnapshot().clock.blackMs).toBe(600_000);
    });

    it("pauses and resumes the clock", async () => {
      const { session, advanceTime } = setup(() => ({ hang: true }));
      await session.startGame(config());

      session.setPaused(true);
      advanceTime(30_000);

      expect(session.getSnapshot().clock).toMatchObject({ paused: true, whiteMs: 25 * 60 * 1000 });
    });
  });
});
