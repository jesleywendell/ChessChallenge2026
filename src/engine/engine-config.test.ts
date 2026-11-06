import { describe, expect, it } from "vitest";
import {
  largestPowerOfTwoAtMost,
  resolveEngineConfig,
  resolveHashMb,
  StockfishNotFoundError,
} from "./engine-config";

const GIGABYTE = 1024 ** 3;

describe("resolveHashMb", () => {
  it("uses an eighth of the RAM rounded down to a power of two, between 1 and 4 GB", () => {
    expect(resolveHashMb(8 * GIGABYTE)).toBe(1024);
    expect(resolveHashMb(16 * GIGABYTE)).toBe(2048);
    expect(resolveHashMb(24 * GIGABYTE)).toBe(2048);
    expect(resolveHashMb(64 * GIGABYTE)).toBe(4096);
    expect(resolveHashMb(512 * GIGABYTE)).toBe(4096);
  });

  it("never takes more than a quarter of a small machine's RAM", () => {
    expect(resolveHashMb(2 * GIGABYTE)).toBe(512);
    expect(resolveHashMb(GIGABYTE / 8)).toBe(64);
  });
});

describe("largestPowerOfTwoAtMost", () => {
  it("rounds down", () => {
    expect(largestPowerOfTwoAtMost(1000)).toBe(512);
    expect(largestPowerOfTwoAtMost(1024)).toBe(1024);
  });
});

describe("resolveEngineConfig", () => {
  it("fails with an actionable error when Stockfish is missing", () => {
    expect(() =>
      resolveEngineConfig({ PATH: "/nonexistent", STOCKFISH_PATH: "/nonexistent/stockfish" }),
    ).toThrow(StockfishNotFoundError);
  });

  it("honors thread and hash overrides", () => {
    const config = resolveEngineConfig({
      STOCKFISH_PATH: process.execPath,
      ENGINE_THREADS: "3",
      ENGINE_HASH_MB: "256",
    });

    expect(config).toMatchObject({ threads: 3, hashMb: 256, syzygyPath: null });
  });
});
