import type {
  EnginePort,
  PowerLevel,
  SearchHandle,
  SearchLimits,
  SearchLine,
  SearchResult,
} from "../engine/stockfish-engine";

export type FakeOutcome =
  | {
      bestMove: string;
      ponderMove?: string;
      depth?: number;
      scoreCp?: number;
      lines?: SearchLine[];
    }
  | { error: Error }
  | { hang: true };

export type FakeSearchCall = { moves: string[]; limits: SearchLimits; stopped: boolean };

const baseResult = (overrides: Partial<SearchResult>): SearchResult => ({
  bestMove: null,
  ponderMove: null,
  depth: 0,
  scoreCp: null,
  mateIn: null,
  nodesPerSecond: 0,
  elapsedMs: 0,
  principalVariation: [],
  stopReason: "requested",
  lines: [],
  ...overrides,
});

/** Motor de teste: respostas roteirizadas e buscas `infinite` que só terminam no `stop()`. */
export class FakeEngine implements EnginePort {
  calls: FakeSearchCall[] = [];
  restarts = 0;
  restartLevels: PowerLevel[] = [];
  powerLevel: PowerLevel = 0;
  newGames = 0;
  ponderElapsedMs = 20_000;

  constructor(private readonly script: (moves: string[], limits: SearchLimits) => FakeOutcome) {}

  newGame(): Promise<void> {
    this.newGames += 1;
    return Promise.resolve();
  }

  restart(level: PowerLevel = 0): Promise<void> {
    this.restarts += 1;
    this.restartLevels.push(level);
    this.powerLevel = level;
    return Promise.resolve();
  }

  search(position: { moves: readonly string[] }, limits: SearchLimits): SearchHandle {
    const call: FakeSearchCall = { moves: [...position.moves], limits, stopped: false };
    this.calls.push(call);

    const outcome = this.script(call.moves, limits);
    const isOpenEnded = limits.kind === "infinite" || "hang" in outcome;
    if (isOpenEnded) return this.#openEndedSearch(call, outcome);

    if ("error" in outcome) {
      return { result: Promise.reject(outcome.error), stop: () => this.#markStopped(call) };
    }
    if ("hang" in outcome) throw new Error("unreachable");

    return {
      result: Promise.resolve(
        baseResult({
          bestMove: outcome.bestMove,
          ponderMove: outcome.ponderMove ?? null,
          depth: outcome.depth ?? 20,
          scoreCp: outcome.scoreCp ?? 25,
          lines: outcome.lines ?? [],
          elapsedMs: 1_000,
          stopReason: "soft-stable",
        }),
      ),
      stop: () => this.#markStopped(call),
    };
  }

  #markStopped(call: FakeSearchCall): void {
    call.stopped = true;
  }

  #openEndedSearch(call: FakeSearchCall, outcome: FakeOutcome): SearchHandle {
    let resolveResult: (result: SearchResult) => void = () => undefined;
    const result = new Promise<SearchResult>((resolve) => {
      resolveResult = resolve;
    });
    const bestMove = "bestMove" in outcome ? outcome.bestMove : null;
    return {
      result,
      stop: () => {
        this.#markStopped(call);
        resolveResult(baseResult({ bestMove, elapsedMs: this.ponderElapsedMs, depth: 25 }));
      },
    };
  }
}
