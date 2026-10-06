import { Chess } from "chess.js";
import { pino } from "pino";
import { afterAll, describe, expect, it, vi } from "vitest";
import {
  type EngineConfig,
  resolveEngineConfig,
  StockfishNotFoundError,
} from "../engine/engine-config";
import { StockfishEngine } from "../engine/stockfish-engine";
import { playMove } from "../shared/chess-utils";
import { GameSession } from "./game-session";
import type { GameStore, SavedGame } from "./game-store";

const findEngineConfig = (): EngineConfig | null => {
  try {
    return { ...resolveEngineConfig(), threads: 2, hashMb: 64 };
  } catch (error) {
    if (error instanceof StockfishNotFoundError) return null;
    throw error;
  }
};

const engineConfig = findEngineConfig();
const TEST_TIMEOUT_MS = 30_000;

const memoryStore = (): GameStore => {
  let saved: SavedGame | null = null;
  return {
    save: async (game) => {
      saved = structuredClone(game);
    },
    load: async () => saved,
    clear: async () => {
      saved = null;
    },
  };
};

describe.skipIf(!engineConfig)("GameSession with a real Stockfish", () => {
  const logger = pino({ level: "silent" });
  const engine = new StockfishEngine(
    engineConfig ?? { binaryPath: "", threads: 1, hashMb: 16, syzygyPath: null },
    logger,
  );
  const session = new GameSession({ engine, store: memoryStore(), logger });

  afterAll(() => {
    session.dispose();
    engine.dispose();
  });

  it(
    "plays a legal, consistent game as black against scripted opponent moves",
    async () => {
      await engine.start();
      await session.startGame({
        ourColor: "black",
        initialClockMs: 60_000,
        humanOverheadMs: 1_000,
      });

      for (const opponentMove of ["a3", "h3", "Nc3"]) {
        const plyBefore = session.getSnapshot().moves.length;
        expect(session.applyOpponentMove(opponentMove)).toEqual({ ok: true });
        await vi.waitFor(() => expect(session.getSnapshot().moves.length).toBe(plyBefore + 2), {
          timeout: 15_000,
        });
      }

      const snapshot = session.getSnapshot();
      const replay = new Chess();
      for (const move of snapshot.moves) playMove(replay, move.uci);
      expect(replay.fen()).toBe(snapshot.fen);

      const engineMoves = snapshot.moves.filter((move) => move.author === "engine");
      expect(engineMoves).toHaveLength(3);
      expect(engineMoves.every((move) => move.depth !== null && move.depth >= 6)).toBe(true);
      expect(snapshot.clock.blackMs).toBeLessThan(60_000 - 3 * 1_000);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "ponders while waiting for the opponent",
    async () => {
      await vi.waitFor(() => expect(session.getSnapshot().engine.state).toBe("pondering"), {
        timeout: 5_000,
      });
    },
    TEST_TIMEOUT_MS,
  );
});
