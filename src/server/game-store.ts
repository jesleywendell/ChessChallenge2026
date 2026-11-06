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

const RENAME_ATTEMPTS = 3;
const RENAME_RETRY_DELAY_MS = 50;

/** No Windows, antivírus/indexador às vezes seguram o arquivo por alguns ms (EPERM/EBUSY). */
const renameWithRetry = async (from: string, to: string): Promise<void> => {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await rename(from, to);
      return;
    } catch (error) {
      if (attempt >= RENAME_ATTEMPTS) throw error;
      await new Promise((resolve) => setTimeout(resolve, RENAME_RETRY_DELAY_MS));
    }
  }
};

/**
 * Salvamentos são serializados: dois `save` quase simultâneos (lance do adversário
 * seguido de lance de livro instantâneo) escreviam no mesmo `.tmp` ao mesmo tempo
 * e podiam gerar JSON corrompido, perdendo o snapshot.
 */
export const createFileGameStore = (filePath: string, logger: Logger): GameStore => {
  let pending: Promise<void> = Promise.resolve();

  const writeSnapshot = async (game: SavedGame): Promise<void> => {
    const temporaryPath = `${filePath}.tmp`;
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(temporaryPath, JSON.stringify(game));
    await renameWithRetry(temporaryPath, filePath);
  };

  return {
    save: (game) => {
      const run = pending.then(() => writeSnapshot(game));
      pending = run.catch(() => undefined);
      return run;
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
      await pending;
      await rm(filePath, { force: true });
    },
  };
};
