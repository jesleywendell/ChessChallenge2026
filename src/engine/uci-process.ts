import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { parseUciLine, type UciMessage } from "./uci-parser";

export type UciProcessExit = {
  code: number | null;
  signal: NodeJS.Signals | null;
  spawnError: Error | null;
};

export type UciProcessHandlers = {
  onMessage: (message: UciMessage) => void;
  onExit: (details: UciProcessExit) => void;
  onStderr: (line: string) => void;
};

export type UciProcess = {
  send: (command: string) => void;
  kill: () => void;
};

export const spawnUciProcess = (binaryPath: string, handlers: UciProcessHandlers): UciProcess => {
  const child = spawn(binaryPath, [], { stdio: ["pipe", "pipe", "pipe"] });
  let exited = false;

  const reportExit = (details: UciProcessExit) => {
    if (exited) return;
    exited = true;
    handlers.onExit(details);
  };

  createInterface({ input: child.stdout }).on("line", (line) => {
    handlers.onMessage(parseUciLine(line));
  });
  createInterface({ input: child.stderr }).on("line", handlers.onStderr);

  child.on("error", (spawnError) => reportExit({ code: null, signal: null, spawnError }));
  child.on("exit", (code, signal) => reportExit({ code, signal, spawnError: null }));
  child.stdin.on("error", () => undefined);

  return {
    send: (command) => {
      if (exited) return;
      child.stdin.write(`${command}\n`);
    },
    kill: () => {
      child.kill("SIGKILL");
    },
  };
};
