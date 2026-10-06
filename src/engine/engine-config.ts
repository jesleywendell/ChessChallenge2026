import { existsSync } from "node:fs";
import { availableParallelism, totalmem } from "node:os";
import { delimiter, join } from "node:path";

export type EngineConfig = {
  binaryPath: string;
  threads: number;
  hashMb: number;
  syzygyPath: string | null;
};

const BINARY_NAMES = ["stockfish", "stockfish.exe"];
const KNOWN_DIRECTORIES = ["/opt/homebrew/bin", "/usr/local/bin", "/usr/games", "/usr/bin"];
const BYTES_PER_MB = 1024 * 1024;
const HASH_SHARE_OF_RAM = 1 / 8;
const MIN_HASH_MB = 64;
const MAX_HASH_MB = 8192;

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

export const resolveHashMb = (totalMemoryBytes: number): number =>
  Math.min(
    MAX_HASH_MB,
    Math.max(
      MIN_HASH_MB,
      largestPowerOfTwoAtMost((totalMemoryBytes / BYTES_PER_MB) * HASH_SHARE_OF_RAM),
    ),
  );

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
  };
};
