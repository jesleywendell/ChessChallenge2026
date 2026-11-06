import { existsSync } from "node:fs";
import { availableParallelism, totalmem } from "node:os";
import { delimiter, join } from "node:path";

export type EngineConfig = {
  binaryPath: string;
  threads: number;
  hashMb: number;
  syzygyPath: string | null;
  /** Linhas pedidas ao Stockfish (MultiPV). >1 alimenta o anti-empate. */
  multiPv: number;
};

const BINARY_NAMES = ["stockfish", "stockfish.exe"];
const KNOWN_DIRECTORIES = ["/opt/homebrew/bin", "/usr/local/bin", "/usr/games", "/usr/bin"];
const BYTES_PER_MB = 1024 * 1024;
const HASH_SHARE_OF_RAM = 1 / 8;
const MAX_HASH_SHARE_OF_RAM = 1 / 4;
const MIN_HASH_MB = 1024;
const MAX_HASH_MB = 4096;
const FALLBACK_HASH_MB = 64;
const DEFAULT_MULTI_PV = 3;

export class StockfishNotFoundError extends Error {
  constructor() {
    super(
      "Stockfish não encontrado. Instale (macOS: `brew install stockfish`) ou defina STOCKFISH_PATH.",
    );
    this.name = "StockfishNotFoundError";
  }
}

const findBinaryInDirectories = (directories: readonly string[]): string | null => {
  for (const directory of directories) {
    for (const name of BINARY_NAMES) {
      const candidate = join(directory, name);
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
};

export const largestPowerOfTwoAtMost = (value: number): number =>
  2 ** Math.floor(Math.log2(Math.max(1, value)));

/** 1/8 da RAM, entre 1 e 4 GB, mas nunca mais que 1/4 da RAM (máquinas pequenas). */
export const resolveHashMb = (totalMemoryBytes: number): number => {
  const totalMb = totalMemoryBytes / BYTES_PER_MB;
  const preferred = Math.min(
    MAX_HASH_MB,
    Math.max(MIN_HASH_MB, largestPowerOfTwoAtMost(totalMb * HASH_SHARE_OF_RAM)),
  );
  const ceiling = largestPowerOfTwoAtMost(totalMb * MAX_HASH_SHARE_OF_RAM);
  return Math.max(FALLBACK_HASH_MB, Math.min(preferred, ceiling));
};

const readPositiveInteger = (value: string | undefined): number | null => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

export const resolveEngineConfig = (env: NodeJS.ProcessEnv = process.env): EngineConfig => {
  const binaryPath =
    env.STOCKFISH_PATH ??
    findBinaryInDirectories((env.PATH ?? "").split(delimiter).filter(Boolean)) ??
    findBinaryInDirectories(KNOWN_DIRECTORIES);

  if (!binaryPath || !existsSync(binaryPath)) throw new StockfishNotFoundError();

  return {
    binaryPath,
    threads: readPositiveInteger(env.ENGINE_THREADS) ?? availableParallelism(),
    hashMb: readPositiveInteger(env.ENGINE_HASH_MB) ?? resolveHashMb(totalmem()),
    syzygyPath: env.SYZYGY_PATH ?? null,
    multiPv: readPositiveInteger(env.ENGINE_MULTIPV) ?? DEFAULT_MULTI_PV,
  };
};
