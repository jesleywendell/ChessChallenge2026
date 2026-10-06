import { mkdirSync } from "node:fs";
import { join } from "node:path";
import pino, { type Logger } from "pino";

const LOGS_DIRECTORY = "logs";

/** Registra em stdout e em `logs/session-<data>.jsonl` para análise após a partida. */
export const createLogger = (): Logger => {
  mkdirSync(LOGS_DIRECTORY, { recursive: true });
  const timestamp = new Date().toISOString().replaceAll(":", "-");
  const logFile = join(LOGS_DIRECTORY, `session-${timestamp}.jsonl`);

  return pino(
    { level: process.env.LOG_LEVEL ?? "info" },
    pino.multistream([
      { stream: process.stdout },
      { stream: pino.destination({ dest: logFile, sync: false }) },
    ]),
  );
};
