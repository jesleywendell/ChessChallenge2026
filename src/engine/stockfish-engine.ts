import type { Logger } from "pino";
import type { EngineConfig } from "./engine-config";
import { createStopPolicy, type StopPolicy, type StopReason } from "./stop-policy";
import type { UciMessage } from "./uci-parser";
import { spawnUciProcess, type UciProcess, type UciProcessExit } from "./uci-process";

export type SearchPosition = { moves: readonly string[] };

export type SearchLimits =
  | { kind: "infinite" }
  | { kind: "adaptive"; softMs: number; hardMs: number };

export type SearchStopReason = StopReason | "requested" | "superseded";

export type SearchProgress = {
  depth: number;
  scoreCp: number | null;
  mateIn: number | null;
  nodesPerSecond: number;
  elapsedMs: number;
  principalVariation: string[];
};

export type SearchResult = SearchProgress & {
  bestMove: string | null;
  ponderMove: string | null;
  stopReason: SearchStopReason;
};

export type SearchHandle = {
  result: Promise<SearchResult>;
  stop: () => void;
};

export type EnginePort = {
  newGame: () => Promise<void>;
  search: (
    position: SearchPosition,
    limits: SearchLimits,
    onProgress?: (progress: SearchProgress) => void,
  ) => SearchHandle;
  /** Reinicia o processo. `level` > 0 usa menos threads e hash (modo degradado). */
  restart: (level?: PowerLevel) => Promise<void>;
  readonly powerLevel: PowerLevel;
};

/** 0 = potência total, 1 = metade das threads e 1/4 do hash, 2 = modo seguro (1 thread, 16 MB). */
export type PowerLevel = 0 | 1 | 2;

const SAFE_MODE_HASH_MB = 16;

export const resourcesForLevel = (
  config: Pick<EngineConfig, "threads" | "hashMb">,
  level: PowerLevel,
): { threads: number; hashMb: number } => {
  if (level === 0) return { threads: config.threads, hashMb: config.hashMb };
  if (level === 1) {
    return {
      threads: Math.max(1, Math.floor(config.threads / 2)),
      hashMb: Math.max(SAFE_MODE_HASH_MB, Math.floor(config.hashMb / 4)),
    };
  }
  return { threads: 1, hashMb: SAFE_MODE_HASH_MB };
};

export class EngineCrashedError extends Error {
  constructor(details: string) {
    super(`Stockfish encerrou inesperadamente (${details})`);
    this.name = "EngineCrashedError";
  }
}

export class EngineUnresponsiveError extends Error {
  constructor(waitingFor: string) {
    super(`Stockfish não respondeu a tempo (${waitingFor})`);
    this.name = "EngineUnresponsiveError";
  }
}

type SearchControl = {
  stopRequested: boolean;
  stopReason: SearchStopReason;
  stopNow: ((reason: SearchStopReason) => void) | null;
};

const HANDSHAKE_TIMEOUT_MS = 15_000;
const STOP_TIMEOUT_MS = 3_000;
const POLL_INTERVAL_MS = 20;

const NO_PROGRESS: SearchProgress = {
  depth: 0,
  scoreCp: null,
  mateIn: null,
  nodesPerSecond: 0,
  elapsedMs: 0,
  principalVariation: [],
};

const emptySearchResult = (stopReason: SearchStopReason): SearchResult => ({
  ...NO_PROGRESS,
  bestMove: null,
  ponderMove: null,
  stopReason,
});

const formatExit = ({ code, signal, spawnError }: UciProcessExit): string =>
  spawnError?.message ?? `code=${code} signal=${signal}`;

export class StockfishEngine implements EnginePort {
  #process: UciProcess | null = null;
  #starting: Promise<void> | null = null;
  #queue: Promise<unknown> = Promise.resolve();
  #latestSearch: SearchControl | null = null;
  #generation = 0;
  #onMessage: ((message: UciMessage) => void) | null = null;
  #onExit: ((details: UciProcessExit) => void) | null = null;
  #powerLevel: PowerLevel = 0;

  constructor(
    private readonly config: EngineConfig,
    private readonly logger: Logger,
  ) {}

  start(): Promise<void> {
    if (this.#process) return Promise.resolve();
    this.#starting ??= this.#spawnAndHandshake().finally(() => {
      this.#starting = null;
    });
    return this.#starting;
  }

  get powerLevel(): PowerLevel {
    return this.#powerLevel;
  }

  restart(level: PowerLevel = 0): Promise<void> {
    this.#supersedeLatestSearch();
    return this.#enqueue(async () => {
      this.#killProcess();
      this.#powerLevel = level;
      await this.start();
    });
  }

  newGame(): Promise<void> {
    this.#supersedeLatestSearch();
    return this.#enqueue(async () => {
      await this.start();
      this.#send("ucinewgame");
      this.#send("isready");
      await this.#awaitMessage("readyok", HANDSHAKE_TIMEOUT_MS);
    });
  }

  search(
    position: SearchPosition,
    limits: SearchLimits,
    onProgress?: (progress: SearchProgress) => void,
  ): SearchHandle {
    this.#supersedeLatestSearch();

    const control: SearchControl = { stopRequested: false, stopReason: "requested", stopNow: null };
    this.#latestSearch = control;
    const result = this.#enqueue(() => this.#runSearch(position, limits, control, onProgress));
    const stop = () => {
      control.stopRequested = true;
      control.stopNow?.("requested");
    };
    return { result, stop };
  }

  dispose(): void {
    this.#killProcess();
  }

  #supersedeLatestSearch(): void {
    const latest = this.#latestSearch;
    if (!latest) return;
    latest.stopRequested = true;
    latest.stopReason = "superseded";
    latest.stopNow?.("superseded");
  }

  #killProcess(): void {
    this.#generation += 1;
    this.#process?.kill();
    this.#process = null;
  }

  #enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.#queue.then(task, task);
    this.#queue = run.catch(() => undefined);
    return run;
  }

  #send(command: string): void {
    this.logger.trace({ command }, "uci-send");
    this.#process?.send(command);
  }

  async #spawnAndHandshake(): Promise<void> {
    this.logger.info({ binaryPath: this.config.binaryPath }, "engine-starting");
    this.#generation += 1;
    const generation = this.#generation;
    const isCurrent = () => generation === this.#generation;

    this.#process = spawnUciProcess(this.config.binaryPath, {
      onMessage: (message) => {
        if (isCurrent()) this.#onMessage?.(message);
      },
      onStderr: (line) => this.logger.warn({ line }, "engine-stderr"),
      onExit: (details) => {
        if (!isCurrent()) return;
        this.logger.error({ ...details, spawnError: details.spawnError?.message }, "engine-exited");
        this.#process = null;
        this.#onExit?.(details);
      },
    });

    try {
      this.#send("uci");
      await this.#awaitMessage("uciok", HANDSHAKE_TIMEOUT_MS);
      const { threads, hashMb } = resourcesForLevel(this.config, this.#powerLevel);
      this.#send(`setoption name Threads value ${threads}`);
      this.#send(`setoption name Hash value ${hashMb}`);
      this.#send("setoption name MultiPV value 1");
      if (this.config.syzygyPath) {
        this.#send(`setoption name SyzygyPath value ${this.config.syzygyPath}`);
      }
      this.#send("isready");
      await this.#awaitMessage("readyok", HANDSHAKE_TIMEOUT_MS);
      this.logger.info({ threads, hashMb, powerLevel: this.#powerLevel }, "engine-ready");
    } catch (error) {
      this.#killProcess();
      throw error;
    }
  }

  #awaitMessage(kind: UciMessage["kind"], timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const clear = () => {
        clearTimeout(timer);
        this.#onMessage = null;
        this.#onExit = null;
      };
      const timer = setTimeout(() => {
        clear();
        reject(new EngineUnresponsiveError(kind));
      }, timeoutMs);
      this.#onMessage = (message) => {
        if (message.kind !== kind) return;
        clear();
        resolve();
      };
      this.#onExit = (details) => {
        clear();
        reject(new EngineCrashedError(formatExit(details)));
      };
    });
  }

  async #runSearch(
    position: SearchPosition,
    limits: SearchLimits,
    control: SearchControl,
    onProgress: ((progress: SearchProgress) => void) | undefined,
  ): Promise<SearchResult> {
    if (control.stopRequested) return emptySearchResult(control.stopReason);
    await this.start();

    if (!this.#process) throw new EngineCrashedError("processo indisponível");

    const policy: StopPolicy | null = limits.kind === "adaptive" ? createStopPolicy(limits) : null;
    const startedAtMs = performance.now();
    let latest: SearchProgress = NO_PROGRESS;
    let stopSentAtMs: number | null = null;
    let stopReason: SearchStopReason = "requested";

    return new Promise<SearchResult>((resolve, reject) => {
      const finish = () => {
        clearInterval(timer);
        this.#onMessage = null;
        this.#onExit = null;
        control.stopNow = null;
      };

      const requestStop = (reason: SearchStopReason) => {
        if (stopSentAtMs !== null) return;
        stopSentAtMs = performance.now();
        stopReason = reason;
        this.#send("stop");
      };

      const timer = setInterval(() => {
        const nowMs = performance.now();
        if (stopSentAtMs !== null) {
          if (nowMs - stopSentAtMs < STOP_TIMEOUT_MS) return;
          finish();
          this.#killProcess();
          reject(new EngineUnresponsiveError("stop"));
          return;
        }
        const reason = policy?.shouldStop(nowMs - startedAtMs);
        if (reason) requestStop(reason);
      }, POLL_INTERVAL_MS);

      this.#onMessage = (message) => {
        if (message.kind === "info") {
          const { info } = message;
          const bestMove = info.principalVariation[0];
          if (info.bound !== "exact" || !bestMove) return;

          const elapsedMs = performance.now() - startedAtMs;
          latest = {
            depth: info.depth,
            scoreCp: info.scoreCp,
            mateIn: info.mateIn,
            nodesPerSecond: info.nodesPerSecond,
            elapsedMs,
            principalVariation: info.principalVariation,
          };
          policy?.observe({
            depth: info.depth,
            bestMove,
            scoreCp: info.scoreCp,
            mateIn: info.mateIn,
          });
          onProgress?.(latest);

          const reason = policy?.shouldStop(elapsedMs);
          if (reason) requestStop(reason);
          return;
        }

        if (message.kind === "bestmove") {
          finish();
          const [firstMove, secondMove] = latest.principalVariation;
          resolve({
            ...latest,
            bestMove: message.move,
            ponderMove:
              message.ponderMove ?? (firstMove === message.move ? (secondMove ?? null) : null),
            elapsedMs: performance.now() - startedAtMs,
            stopReason,
          });
        }
      };

      this.#onExit = (details) => {
        finish();
        reject(new EngineCrashedError(formatExit(details)));
      };

      control.stopNow = requestStop;
      const moves = position.moves.length > 0 ? ` moves ${position.moves.join(" ")}` : "";
      this.#send(`position startpos${moves}`);
      this.#send("go infinite");
      if (control.stopRequested) requestStop(control.stopReason);
    });
  }
}
