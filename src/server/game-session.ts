import { Chess, type Move } from "chess.js";
import type { Logger } from "pino";
import { buildOpeningBook, type OpeningBook, pickBookMove } from "../engine/opening-book";
import { OPENING_LINES } from "../engine/opening-lines";
import type { EnginePort, SearchHandle, SearchProgress } from "../engine/stockfish-engine";
import { computeThinkBudget, creditPonderTime } from "../engine/time-budget";
import {
  COLOR_BY_TURN,
  detectResult,
  pickEmergencyMove,
  playMove,
  principalVariationToSan,
  toUci,
} from "../shared/chess-utils";
import {
  type Color,
  type EngineProgress,
  type EngineStatus,
  type GameConfig,
  type GameResult,
  type GameSnapshot,
  type MoveRecord,
  type MoveSource,
  oppositeColor,
} from "../shared/protocol";
import {
  type Clock,
  createClock,
  passTurn,
  remainingMs,
  setPaused,
  setRemaining,
  startClock,
  stopClock,
  toClockSnapshot,
} from "./clock";
import type { GameStore, SavedGame } from "./game-store";

export type ActionResult = { ok: true } | { ok: false; message: string };

type GameSessionDependencies = {
  engine: EnginePort;
  store: GameStore;
  logger: Logger;
  nowMs?: () => number;
  random?: () => number;
};

type EngineDecision = {
  uci: string;
  source: MoveSource;
  depth: number | null;
  scoreCp: number | null;
  mateIn: number | null;
  ponderMove: string | null;
};

type PonderState = { predictedUci: string; handle: SearchHandle };
type PonderOutcome = { hit: boolean; elapsedMs: number };
type Phase = GameSnapshot["phase"];

const OK: ActionResult = { ok: true };
const NO_PONDER: PonderOutcome = { hit: false, elapsedMs: 0 };
const READY: EngineStatus = { state: "ready", message: null };
const ENGINE_ATTEMPTS = 2;
const NO_SEARCH = { depth: null, scoreCp: null, mateIn: null, ponderMove: null } as const;

const fail = (message: string): ActionResult => ({ ok: false, message });

export class GameSession {
  #engine: EnginePort;
  #store: GameStore;
  #logger: Logger;
  #now: () => number;
  #random: () => number;

  #phase: Phase = "setup";
  #config: GameConfig | null = null;
  #chess = new Chess();
  #moves: MoveRecord[] = [];
  #clock: Clock = createClock(1);
  #book: OpeningBook = new Map();
  #engineStatus: EngineStatus = READY;
  #result: GameResult | null = null;
  #resumedFromDisk = false;

  #epoch = 0;
  #thinking: SearchHandle | null = null;
  #ponder: PonderState | null = null;

  #snapshotListeners = new Set<(snapshot: GameSnapshot) => void>();
  #progressListeners = new Set<(progress: EngineProgress) => void>();

  constructor({ engine, store, logger, nowMs, random }: GameSessionDependencies) {
    this.#engine = engine;
    this.#store = store;
    this.#logger = logger;
    this.#now = nowMs ?? Date.now;
    this.#random = random ?? Math.random;
  }

  getSnapshot(): GameSnapshot {
    return {
      phase: this.#phase,
      config: this.#config,
      fen: this.#chess.fen(),
      turn: COLOR_BY_TURN[this.#chess.turn()],
      inCheck: this.#chess.inCheck(),
      moves: this.#moves,
      clock: toClockSnapshot(this.#clock, this.#now()),
      engine: this.#engineStatus,
      result: this.#result,
      resumedFromDisk: this.#resumedFromDisk,
    };
  }

  onSnapshot(listener: (snapshot: GameSnapshot) => void): () => void {
    this.#snapshotListeners.add(listener);
    return () => this.#snapshotListeners.delete(listener);
  }

  onProgress(listener: (progress: EngineProgress) => void): () => void {
    this.#progressListeners.add(listener);
    return () => this.#progressListeners.delete(listener);
  }

  async startGame(config: GameConfig): Promise<ActionResult> {
    this.#cancelEngineWork();
    this.#epoch += 1;
    const epoch = this.#epoch;

    this.#phase = "playing";
    this.#config = config;
    this.#chess = new Chess();
    this.#moves = [];
    this.#result = null;
    this.#resumedFromDisk = false;
    this.#book = buildOpeningBook(OPENING_LINES[config.ourColor], config.ourColor);
    this.#clock = startClock(createClock(config.initialClockMs), "white", this.#now());
    this.#engineStatus = READY;
    this.#logger.info({ config }, "game-started");
    this.#publish();

    await this.#prepareEngineForNewGame();
    if (epoch !== this.#epoch) return OK;

    if (config.ourColor === "white") void this.#runEngineTurn();
    return OK;
  }

  applyOpponentMove(text: string): ActionResult {
    const config = this.#config;
    if (!config || this.#phase !== "playing") return fail("Não há partida em andamento.");

    const opponentColor = oppositeColor(config.ourColor);
    if (COLOR_BY_TURN[this.#chess.turn()] !== opponentColor) return fail("Aguarde: é a vez da IA.");

    let move: Move;
    try {
      move = playMove(this.#chess, text);
    } catch (error) {
      return fail(error instanceof Error ? error.message : "Lance inválido.");
    }

    this.#moves.push(this.#toRecord(move, "opponent", "opponent", null));
    this.#clock = passTurn(this.#clock, opponentColor, this.#now());
    this.#logger.info({ san: move.san, ply: this.#moves.length }, "opponent-move");
    this.#settleGameState(opponentColor);
    this.#publish();

    if (this.#phase === "playing") void this.#runEngineTurn();
    else this.#cancelEngineWork();
    return OK;
  }

  takeback(): ActionResult {
    const config = this.#config;
    if (!config || this.#moves.length === 0) return fail("Não há lance para desfazer.");

    this.#cancelEngineWork();
    this.#epoch += 1;
    const undone = this.#chess.undo();
    this.#moves.pop();
    this.#logger.info({ san: undone?.san }, "takeback");

    this.#phase = "playing";
    this.#result = null;
    this.#engineStatus = READY;
    const turn = COLOR_BY_TURN[this.#chess.turn()];
    this.#clock = startClock(this.#clock, turn, this.#now());
    this.#publish();

    if (turn === config.ourColor) void this.#runEngineTurn();
    return OK;
  }

  setClock(color: Color, remainingMsValue: number): ActionResult {
    if (!this.#config) return fail("Não há partida em andamento.");
    this.#clock = setRemaining(this.#clock, color, remainingMsValue, this.#now());
    this.#publish();
    return OK;
  }

  setPaused(paused: boolean): ActionResult {
    if (!this.#config) return fail("Não há partida em andamento.");
    this.#clock = setPaused(this.#clock, paused, this.#now());
    this.#publish();
    return OK;
  }

  async resetGame(): Promise<ActionResult> {
    this.#cancelEngineWork();
    this.#epoch += 1;
    this.#phase = "setup";
    this.#config = null;
    this.#chess = new Chess();
    this.#moves = [];
    this.#result = null;
    this.#resumedFromDisk = false;
    this.#engineStatus = READY;
    await this.#store.clear();
    this.#publish({ persist: false });
    return OK;
  }

  async restoreFromDisk(): Promise<boolean> {
    const saved = await this.#store.load();
    if (!saved) return false;

    try {
      this.#restore(saved);
    } catch (error) {
      this.#logger.warn({ err: error }, "saved-game-discarded");
      await this.#store.clear();
      return false;
    }

    this.#logger.info({ plies: this.#moves.length }, "game-restored");
    this.#publish();
    const turn = COLOR_BY_TURN[this.#chess.turn()];
    if (this.#phase === "playing" && turn === saved.config.ourColor) void this.#runEngineTurn();
    return true;
  }

  dispose(): void {
    this.#epoch += 1;
    this.#cancelEngineWork();
  }

  #restore(saved: SavedGame): void {
    const chess = new Chess();
    for (const record of saved.moves) {
      const move = playMove(chess, record.uci);
      if (move.san !== record.san) throw new Error(`Lance divergente no ply ${record.ply}`);
    }

    this.#config = saved.config;
    this.#chess = chess;
    this.#moves = saved.moves;
    this.#book = buildOpeningBook(OPENING_LINES[saved.config.ourColor], saved.config.ourColor);
    this.#clock = setPaused(
      {
        ...createClock(saved.config.initialClockMs),
        remainingMsByColor: saved.remainingMsByColor,
      },
      true,
      this.#now(),
    );
    this.#phase = "playing";
    this.#result = null;
    this.#resumedFromDisk = true;

    const lastMove = this.#moves.at(-1);
    if (lastMove) this.#settleGameState(lastMove.color);
    if (this.#phase === "playing") {
      this.#clock = startClock(this.#clock, COLOR_BY_TURN[chess.turn()], this.#now());
    }
  }

  async #prepareEngineForNewGame(): Promise<void> {
    try {
      await this.#engine.newGame();
    } catch (error) {
      this.#logger.error({ err: error }, "engine-new-game-failed");
      await this.#engine.restart().catch((restartError) => {
        this.#logger.error({ err: restartError }, "engine-restart-failed");
      });
    }
  }

  async #runEngineTurn(): Promise<void> {
    const epoch = this.#epoch;
    const startedAtMs = this.#now();
    this.#setEngineStatus({ state: "thinking", message: null });

    try {
      const decision = await this.#decideWithRecovery(epoch);
      if (epoch !== this.#epoch) return;
      if (!decision) {
        this.#setEngineStatus(READY);
        return;
      }
      this.#commitEngineMove(decision, this.#now() - startedAtMs);
    } catch (error) {
      this.#logger.error({ err: error }, "engine-turn-failed");
      if (epoch === this.#epoch) {
        this.#setEngineStatus({ state: "error", message: "Falha ao calcular o lance." });
      }
    }
  }

  async #decideWithRecovery(epoch: number): Promise<EngineDecision | null> {
    for (let attempt = 1; attempt <= ENGINE_ATTEMPTS; attempt += 1) {
      try {
        return await this.#decide(epoch);
      } catch (error) {
        this.#logger.error({ err: error, attempt }, "engine-decision-failed");
        if (epoch !== this.#epoch) return null;
        await this.#engine.restart().catch((restartError) => {
          this.#logger.error({ err: restartError }, "engine-restart-failed");
        });
      }
    }

    const emergencyUci = pickEmergencyMove(this.#chess, this.#random);
    if (!emergencyUci) return null;
    this.#logger.error({ uci: emergencyUci }, "emergency-move");
    return {
      uci: emergencyUci,
      source: "emergency",
      depth: null,
      scoreCp: null,
      mateIn: null,
      ponderMove: null,
    };
  }

  async #decide(epoch: number): Promise<EngineDecision | null> {
    const config = this.#config;
    if (!config) return null;

    const legalMoves = this.#chess.moves({ verbose: true });
    if (legalMoves.length === 0) return null;
    const isLegal = (uci: string) => legalMoves.some((move) => toUci(move) === uci);

    const ponderOutcome = await this.#collectPonder(this.#moves.at(-1)?.uci);
    if (epoch !== this.#epoch) return null;

    const bookUci = pickBookMove(this.#book, this.#chess.fen(), this.#random);
    if (bookUci && isLegal(bookUci)) {
      return { ...NO_SEARCH, uci: bookUci, source: "book" };
    }

    const [onlyMove] = legalMoves;
    if (onlyMove && legalMoves.length === 1) {
      return { ...NO_SEARCH, uci: toUci(onlyMove), source: "forced" };
    }

    const nowMs = this.#now();
    const budget = computeThinkBudget({
      remainingMs: remainingMs(this.#clock, config.ourColor, nowMs),
      fullmoveNumber: Math.floor(this.#moves.length / 2) + 1,
      humanOverheadMs: config.humanOverheadMs,
    });
    const limits = ponderOutcome.hit ? creditPonderTime(budget, ponderOutcome.elapsedMs) : budget;

    const handle = this.#engine.search(
      { moves: this.#moves.map((record) => record.uci) },
      { kind: "adaptive", ...limits },
      (progress) => this.#publishProgress("thinking", this.#chess.fen(), progress),
    );
    this.#thinking = handle;
    const result = await handle.result.finally(() => {
      if (this.#thinking === handle) this.#thinking = null;
    });
    if (epoch !== this.#epoch) return null;

    if (!result.bestMove || !isLegal(result.bestMove)) {
      throw new Error(`Stockfish retornou lance inválido: ${result.bestMove ?? "nenhum"}`);
    }

    this.#logger.info(
      {
        bestMove: result.bestMove,
        depth: result.depth,
        scoreCp: result.scoreCp,
        mateIn: result.mateIn,
        elapsedMs: Math.round(result.elapsedMs),
        nodesPerSecond: result.nodesPerSecond,
        stopReason: result.stopReason,
        softMs: limits.softMs,
        hardMs: limits.hardMs,
        ponderHit: ponderOutcome.hit,
        ponderedMs: Math.round(ponderOutcome.elapsedMs),
      },
      "search-finished",
    );

    return {
      uci: result.bestMove,
      source: ponderOutcome.hit ? "ponder-hit" : "search",
      depth: result.depth,
      scoreCp: result.scoreCp,
      mateIn: result.mateIn,
      ponderMove: result.ponderMove,
    };
  }

  async #collectPonder(lastOpponentUci: string | undefined): Promise<PonderOutcome> {
    const ponder = this.#ponder;
    this.#ponder = null;
    if (!ponder) return NO_PONDER;

    ponder.handle.stop();
    try {
      const result = await ponder.handle.result;
      const hit = ponder.predictedUci === lastOpponentUci;
      this.#logger.info(
        { predicted: ponder.predictedUci, actual: lastOpponentUci, hit, depth: result.depth },
        "ponder-finished",
      );
      return { hit, elapsedMs: result.elapsedMs };
    } catch (error) {
      this.#logger.warn({ err: error }, "ponder-failed");
      return NO_PONDER;
    }
  }

  #commitEngineMove(decision: EngineDecision, thinkMs: number): void {
    const config = this.#config;
    if (!config) return;

    const move = playMove(this.#chess, decision.uci);
    this.#moves.push(
      this.#toRecord(move, "engine", decision.source, {
        thinkMs: Math.round(thinkMs),
        depth: decision.depth,
        scoreCp: decision.scoreCp,
        mateIn: decision.mateIn,
      }),
    );
    this.#clock = passTurn(this.#clock, config.ourColor, this.#now(), config.humanOverheadMs);
    this.#logger.info(
      { san: move.san, source: decision.source, thinkMs: Math.round(thinkMs) },
      "engine-move",
    );
    this.#settleGameState(config.ourColor);

    this.#engineStatus =
      decision.source === "emergency"
        ? { state: "error", message: "Stockfish falhou: lance de emergência jogado." }
        : READY;
    this.#publish();

    if (this.#phase === "playing") this.#startPonder(decision.ponderMove);
  }

  #startPonder(ponderUci: string | null): void {
    if (!ponderUci) return;

    const probe = new Chess(this.#chess.fen());
    try {
      playMove(probe, ponderUci);
    } catch {
      return;
    }

    const rootFen = probe.fen();
    const handle = this.#engine.search(
      { moves: [...this.#moves.map((record) => record.uci), ponderUci] },
      { kind: "infinite" },
      (progress) => this.#publishProgress("pondering", rootFen, progress),
    );
    handle.result.catch((error) => this.#logger.warn({ err: error }, "ponder-search-failed"));
    this.#ponder = { predictedUci: ponderUci, handle };
    if (this.#engineStatus.state === "ready") {
      this.#setEngineStatus({ state: "pondering", message: null });
    }
  }

  #cancelEngineWork(): void {
    this.#thinking?.stop();
    this.#thinking = null;
    this.#ponder?.handle.stop();
    this.#ponder = null;
  }

  #toRecord(
    move: Move,
    author: MoveRecord["author"],
    source: MoveSource,
    analysis: Pick<MoveRecord, "thinkMs" | "depth" | "scoreCp" | "mateIn"> | null,
  ): MoveRecord {
    return {
      ply: this.#moves.length + 1,
      color: COLOR_BY_TURN[move.color],
      author,
      source,
      piece: move.piece,
      san: move.san,
      uci: toUci(move),
      from: move.from,
      to: move.to,
      thinkMs: analysis?.thinkMs ?? null,
      depth: analysis?.depth ?? null,
      scoreCp: analysis?.scoreCp ?? null,
      mateIn: analysis?.mateIn ?? null,
    };
  }

  #settleGameState(lastMover: Color): void {
    const result = detectResult(this.#chess, lastMover);
    if (!result) return;
    this.#result = result;
    this.#phase = "finished";
    this.#clock = stopClock(this.#clock, this.#now());
    this.#logger.info({ result }, "game-finished");
  }

  #setEngineStatus(status: EngineStatus): void {
    this.#engineStatus = status;
    this.#publish({ persist: false });
  }

  #publish({ persist = true }: { persist?: boolean } = {}): void {
    const snapshot = this.getSnapshot();
    for (const listener of this.#snapshotListeners) listener(snapshot);
    if (persist && this.#config) this.#persist(this.#config);
  }

  #persist(config: GameConfig): void {
    const nowMs = this.#now();
    this.#store
      .save({
        config,
        moves: this.#moves,
        remainingMsByColor: {
          white: remainingMs(this.#clock, "white", nowMs),
          black: remainingMs(this.#clock, "black", nowMs),
        },
      })
      .catch((error) => this.#logger.warn({ err: error }, "save-game-failed"));
  }

  #publishProgress(mode: EngineProgress["mode"], rootFen: string, progress: SearchProgress): void {
    if (this.#progressListeners.size === 0) return;
    const message: EngineProgress = {
      mode,
      depth: progress.depth,
      scoreCp: progress.scoreCp,
      mateIn: progress.mateIn,
      nodesPerSecond: progress.nodesPerSecond,
      elapsedMs: progress.elapsedMs,
      principalVariation: principalVariationToSan(rootFen, progress.principalVariation),
    };
    for (const listener of this.#progressListeners) listener(message);
  }
}
