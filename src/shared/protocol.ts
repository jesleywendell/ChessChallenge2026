import { z } from "zod";

export const DEFAULT_INITIAL_CLOCK_MS = 25 * 60 * 1000;
export const DEFAULT_HUMAN_OVERHEAD_MS = 5_000;
export const MAX_HUMAN_OVERHEAD_MS = 30_000;

export const colorSchema = z.enum(["white", "black"]);
export type Color = z.infer<typeof colorSchema>;

export const moveAuthorSchema = z.enum(["engine", "opponent"]);
export type MoveAuthor = z.infer<typeof moveAuthorSchema>;

export const moveSourceSchema = z.enum([
  "opponent",
  "book",
  "search",
  "ponder-hit",
  "forced",
  "emergency",
]);
export type MoveSource = z.infer<typeof moveSourceSchema>;

export const pieceSchema = z.enum(["p", "n", "b", "r", "q", "k"]);
export type Piece = z.infer<typeof pieceSchema>;

export const moveRecordSchema = z.object({
  ply: z.number().int().positive(),
  color: colorSchema,
  author: moveAuthorSchema,
  source: moveSourceSchema,
  piece: pieceSchema,
  san: z.string(),
  uci: z.string(),
  from: z.string(),
  to: z.string(),
  thinkMs: z.number().nullable(),
  depth: z.number().nullable(),
  scoreCp: z.number().nullable(),
  mateIn: z.number().nullable(),
});
export type MoveRecord = z.infer<typeof moveRecordSchema>;

export const gameResultSchema = z.object({
  outcome: z.enum([
    "checkmate",
    "stalemate",
    "insufficient-material",
    "threefold-repetition",
    "fifty-move-rule",
  ]),
  winner: colorSchema.nullable(),
});
export type GameResult = z.infer<typeof gameResultSchema>;

export const engineStatusSchema = z.object({
  state: z.enum(["ready", "thinking", "pondering", "error"]),
  message: z.string().nullable(),
});
export type EngineStatus = z.infer<typeof engineStatusSchema>;

export const clockSnapshotSchema = z.object({
  whiteMs: z.number(),
  blackMs: z.number(),
  runningColor: colorSchema.nullable(),
  paused: z.boolean(),
});
export type ClockSnapshot = z.infer<typeof clockSnapshotSchema>;

export const gameConfigSchema = z.object({
  ourColor: colorSchema,
  initialClockMs: z.number().int().positive(),
  humanOverheadMs: z.number().int().min(0).max(MAX_HUMAN_OVERHEAD_MS),
});
export type GameConfig = z.infer<typeof gameConfigSchema>;

export const gameSnapshotSchema = z.object({
  phase: z.enum(["setup", "playing", "finished"]),
  config: gameConfigSchema.nullable(),
  fen: z.string(),
  turn: colorSchema,
  inCheck: z.boolean(),
  moves: z.array(moveRecordSchema),
  clock: clockSnapshotSchema,
  engine: engineStatusSchema,
  result: gameResultSchema.nullable(),
  resumedFromDisk: z.boolean(),
});
export type GameSnapshot = z.infer<typeof gameSnapshotSchema>;

export const engineProgressSchema = z.object({
  mode: z.enum(["thinking", "pondering"]),
  depth: z.number(),
  scoreCp: z.number().nullable(),
  mateIn: z.number().nullable(),
  nodesPerSecond: z.number(),
  elapsedMs: z.number(),
  principalVariation: z.array(z.string()),
});
export type EngineProgress = z.infer<typeof engineProgressSchema>;

export const clientMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("start-game"), config: gameConfigSchema }),
  z.object({ type: z.literal("opponent-move"), move: z.string().min(2).max(12) }),
  z.object({ type: z.literal("takeback") }),
  z.object({
    type: z.literal("set-clock"),
    color: colorSchema,
    remainingMs: z
      .number()
      .int()
      .min(0)
      .max(24 * 60 * 60 * 1000),
  }),
  z.object({ type: z.literal("set-paused"), paused: z.boolean() }),
  z.object({ type: z.literal("reset-game") }),
]);
export type ClientMessage = z.infer<typeof clientMessageSchema>;

export const serverMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("snapshot"), game: gameSnapshotSchema }),
  z.object({ type: z.literal("engine-progress"), progress: engineProgressSchema }),
  z.object({ type: z.literal("error"), message: z.string() }),
]);
export type ServerMessage = z.infer<typeof serverMessageSchema>;

export const oppositeColor = (color: Color): Color => (color === "white" ? "black" : "white");
