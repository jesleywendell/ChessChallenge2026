import { useSyncExternalStore } from "react";
import {
  type ClientMessage,
  type EngineProgress,
  type GameSnapshot,
  serverMessageSchema,
} from "../shared/protocol";

export type ConnectionStatus = "connecting" | "open" | "closed";

export type ConnectionState = {
  status: ConnectionStatus;
  snapshot: GameSnapshot | null;
  snapshotReceivedAtMs: number;
  progress: EngineProgress | null;
  error: { id: number; message: string } | null;
};

const INITIAL_RETRY_DELAY_MS = 300;
const MAX_RETRY_DELAY_MS = 2_000;

let state: ConnectionState = {
  status: "connecting",
  snapshot: null,
  snapshotReceivedAtMs: 0,
  progress: null,
  error: null,
};
let socket: WebSocket | null = null;
let retryDelayMs = INITIAL_RETRY_DELAY_MS;
let errorCounter = 0;
const listeners = new Set<() => void>();

const update = (changes: Partial<ConnectionState>) => {
  state = { ...state, ...changes };
  for (const listener of listeners) listener();
};

const websocketUrl = (): string => {
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  return `${protocol}://${window.location.host}/ws`;
};

const handleMessage = (raw: unknown) => {
  const parsed = serverMessageSchema.safeParse(JSON.parse(String(raw)));
  if (!parsed.success) {
    console.error("Mensagem do servidor inválida", parsed.error);
    return;
  }

  const message = parsed.data;
  if (message.type === "snapshot") {
    const movesChanged = message.game.moves.length !== state.snapshot?.moves.length;
    update({
      snapshot: message.game,
      snapshotReceivedAtMs: performance.now(),
      ...(movesChanged ? { progress: null } : {}),
    });
    return;
  }
  if (message.type === "engine-progress") {
    update({ progress: message.progress });
    return;
  }
  errorCounter += 1;
  update({ error: { id: errorCounter, message: message.message } });
};

const connect = () => {
  update({ status: "connecting" });
  const connection = new WebSocket(websocketUrl());
  socket = connection;

  connection.addEventListener("open", () => {
    retryDelayMs = INITIAL_RETRY_DELAY_MS;
    update({ status: "open" });
  });
  connection.addEventListener("message", (event) => handleMessage(event.data));
  connection.addEventListener("close", () => {
    update({ status: "closed" });
    window.setTimeout(connect, retryDelayMs);
    retryDelayMs = Math.min(retryDelayMs * 2, MAX_RETRY_DELAY_MS);
  });
};

export const sendMessage = (message: ClientMessage): void => {
  if (socket?.readyState !== WebSocket.OPEN) {
    errorCounter += 1;
    update({ error: { id: errorCounter, message: "Sem conexão com o servidor." } });
    return;
  }
  socket.send(JSON.stringify(message));
};

const subscribe = (listener: () => void): (() => void) => {
  if (listeners.size === 0 && !socket) connect();
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const getState = (): ConnectionState => state;

export const useConnectionState = (): ConnectionState => useSyncExternalStore(subscribe, getState);
