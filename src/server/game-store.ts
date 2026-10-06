import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { Logger } from "pino";
import { z } from "zod";
import { gameConfigSchema, moveRecordSchema } from "../shared/protocol";

export const savedGameSchema = z.object({
  config: gameConfigSchema,
  moves: z.array(moveRecordSchema),
  remainingMsByColor: z.object({ white: z.number(), black: z.number() }),
});
export type SavedGame = z.infer<typeof savedGameSchema>;

export type GameStore = {
  save: (game: SavedGame) => Promise<void>;
  load: () => Promise<SavedGame | null>;
  clear: () => Promise<void>;
};

export const createFileGameStore = (filePath: string, logger: Logger): GameStore => ({
  save: async (game) => {
    const temporaryPath = `${filePath}.tmp`;
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(temporaryPath, JSON.stringify(game));
    await rename(temporaryPath, filePath);
  },
  load: async () => {
    try {
      const content = await readFile(filePath, "utf8");
      return savedGameSchema.parse(JSON.parse(content));
    } catch (error) {
      const isMissingFile = error instanceof Error && "code" in error && error.code === "ENOENT";
      if (!isMissingFile) logger.warn({ err: error }, "saved-game-unreadable");
      return null;
    }
  },
  clear: async () => {
    await rm(filePath, { force: true });
  },
});
