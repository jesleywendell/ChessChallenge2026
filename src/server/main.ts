import { existsSync } from "node:fs";
import { join } from "node:path";
import fastifyStatic from "@fastify/static";
import fastifyWebsocket from "@fastify/websocket";
import Fastify from "fastify";
import { resolveEngineConfig, StockfishNotFoundError } from "../engine/engine-config";
import { StockfishEngine } from "../engine/stockfish-engine";
import { clientMessageSchema, type ServerMessage } from "../shared/protocol";
import { dispatchClientMessage } from "./dispatch-client-message";
import { GameSession } from "./game-session";
import { createFileGameStore } from "./game-store";
import { createLogger } from "./logger";

const PORT = Number(process.env.PORT ?? 8787);
const HOST = process.env.HOST ?? "127.0.0.1";
const WEB_DIRECTORY = join(import.meta.dirname, "../../dist/web");
const SAVED_GAME_PATH = join("data", "current-game.json");

const logger = createLogger();

process.on("unhandledRejection", (reason) => logger.error({ err: reason }, "unhandled-rejection"));
process.on("uncaughtException", (error) => logger.error({ err: error }, "uncaught-exception"));

const startEngine = async (): Promise<StockfishEngine> => {
  const engine = new StockfishEngine(resolveEngineConfig(), logger.child({ component: "engine" }));
  await engine.start();
  return engine;
};

const main = async () => {
  const engine = await startEngine();
  const session = new GameSession({
    engine,
    store: createFileGameStore(SAVED_GAME_PATH, logger),
    logger: logger.child({ component: "session" }),
  });
  await session.restoreFromDisk();

  const app = Fastify({ logger: false });
  await app.register(fastifyWebsocket);

  app.get("/ws", { websocket: true }, (socket) => {
    const send = (message: ServerMessage) => socket.send(JSON.stringify(message));
    const sendError = (message: string) => send({ type: "error", message });

    send({ type: "snapshot", game: session.getSnapshot() });
    const stopSnapshots = session.onSnapshot((game) => send({ type: "snapshot", game }));
    const stopProgress = session.onProgress((progress) =>
      send({ type: "engine-progress", progress }),
    );
    logger.info("client-connected");

    socket.on("message", async (raw: Buffer) => {
      try {
        const parsed = clientMessageSchema.safeParse(JSON.parse(raw.toString()));
        if (!parsed.success) return sendError("Mensagem inválida.");
        const result = await dispatchClientMessage(session, parsed.data);
        if (!result.ok) sendError(result.message);
      } catch (error) {
        logger.error({ err: error }, "client-message-failed");
        sendError("Erro interno ao processar a mensagem.");
      }
    });

    socket.on("close", () => {
      stopSnapshots();
      stopProgress();
      logger.info("client-disconnected");
    });
  });

  if (existsSync(WEB_DIRECTORY)) {
    await app.register(fastifyStatic, { root: WEB_DIRECTORY });
  } else {
    logger.warn("web-build-missing: rode `npm run build` ou use `npm run dev`");
  }

  await app.listen({ port: PORT, host: HOST });
  logger.info({ url: `http://${HOST}:${PORT}` }, "server-listening");

  const shutdown = () => {
    session.dispose();
    engine.dispose();
    void app.close().finally(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
};

main().catch((error) => {
  if (error instanceof StockfishNotFoundError) {
    logger.fatal(error.message);
  } else {
    logger.fatal({ err: error }, "startup-failed");
  }
  process.exit(1);
});
