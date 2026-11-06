import { Chess } from "chess.js";
import { pino } from "pino";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type EngineConfig, resolveEngineConfig, StockfishNotFoundError } from "./engine-config";
import { StockfishEngine } from "./stockfish-engine";

const findEngineConfig = (): EngineConfig | null => {
  try {
    return { ...resolveEngineConfig(), threads: 2, hashMb: 64 };
  } catch (error) {
    if (error instanceof StockfishNotFoundError) return null;
    throw error;
  }
};

const engineConfig = findEngineConfig();
const TEST_TIMEOUT_MS = 20_000;

describe.skipIf(!engineConfig)("StockfishEngine with a real Stockfish binary", () => {
  const engine = new StockfishEngine(
    engineConfig ?? { binaryPath: "", threads: 1, hashMb: 16, syzygyPath: null, multiPv: 1 },
    pino({ level: "silent" }),
  );

  beforeAll(async () => {
    await engine.start();
  }, TEST_TIMEOUT_MS);

  afterAll(() => engine.dispose());

  it(
    "returns a legal move within the hard limit",
    async () => {
      const { result } = engine.search(
        { moves: [] },
        { kind: "adaptive", softMs: 300, hardMs: 600 },
      );

      const outcome = await result;

      expect(new Chess().moves({ verbose: true }).map((m) => `${m.from}${m.to}`)).toContain(
        outcome.bestMove,
      );
      expect(outcome.depth).toBeGreaterThanOrEqual(8);
      expect(outcome.elapsedMs).toBeLessThan(1_500);
      expect(outcome.principalVariation.length).toBeGreaterThan(0);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "stops early once a mate is fully searched",
    async () => {
      const fastMateMoves = ["f2f3", "e7e5", "g2g4"];

      const { result } = engine.search(
        { moves: fastMateMoves },
        { kind: "adaptive", softMs: 8_000, hardMs: 15_000 },
      );
      const outcome = await result;

      expect(outcome.bestMove).toBe("d8h4");
      expect(outcome.mateIn).toBe(1);
      expect(outcome.stopReason).toBe("mate-found");
      expect(outcome.elapsedMs).toBeLessThan(2_000);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "keeps searching an open-ended search until stopped and offers a ponder move",
    async () => {
      const handle = engine.search({ moves: ["e2e4"] }, { kind: "infinite" });
      await new Promise((resolve) => setTimeout(resolve, 700));

      handle.stop();
      const outcome = await handle.result;

      expect(outcome.bestMove).not.toBeNull();
      expect(outcome.ponderMove).not.toBeNull();
      expect(outcome.stopReason).toBe("requested");
      expect(outcome.elapsedMs).toBeGreaterThanOrEqual(600);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "supersedes a running search when a new one is requested",
    async () => {
      const ponder = engine.search({ moves: ["e2e4"] }, { kind: "infinite" });
      await new Promise((resolve) => setTimeout(resolve, 200));

      const next = engine.search(
        { moves: ["d2d4"] },
        { kind: "adaptive", softMs: 300, hardMs: 600 },
      );
      const [ponderOutcome, nextOutcome] = await Promise.all([ponder.result, next.result]);

      expect(ponderOutcome.stopReason).toBe("superseded");
      expect(nextOutcome.bestMove).not.toBeNull();
      expect(nextOutcome.stopReason).not.toBe("superseded");
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "cancels a queued search that was superseded before it started",
    async () => {
      const first = engine.search({ moves: [] }, { kind: "infinite" });
      const queued = engine.search({ moves: ["e2e4"] }, { kind: "infinite" });
      const last = engine.search(
        { moves: ["d2d4"] },
        { kind: "adaptive", softMs: 200, hardMs: 400 },
      );

      const [, queuedOutcome, lastOutcome] = await Promise.all([
        first.result,
        queued.result,
        last.result,
      ]);

      expect(queuedOutcome.stopReason).toBe("superseded");
      expect(lastOutcome.bestMove).not.toBeNull();
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "recovers by restarting after the process is killed",
    async () => {
      await engine.restart();

      const { result } = engine.search(
        { moves: [] },
        { kind: "adaptive", softMs: 200, hardMs: 400 },
      );

      expect((await result).bestMove).not.toBeNull();
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "reports progress while searching",
    async () => {
      const depths: number[] = [];

      const { result } = engine.search(
        { moves: [] },
        { kind: "adaptive", softMs: 400, hardMs: 800 },
        (progress) => depths.push(progress.depth),
      );
      await result;

      expect(depths.length).toBeGreaterThan(3);
      expect(depths).toEqual([...depths].sort((a, b) => a - b));
    },
    TEST_TIMEOUT_MS,
  );
});
