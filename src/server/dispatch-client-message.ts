import type { ClientMessage } from "../shared/protocol";
import type { ActionResult, GameSession } from "./game-session";

export const dispatchClientMessage = async (
  session: GameSession,
  message: ClientMessage,
): Promise<ActionResult> => {
  switch (message.type) {
    case "start-game":
      return session.startGame(message.config);
    case "opponent-move":
      return session.applyOpponentMove(message.move);
    case "takeback":
      return session.takeback();
    case "set-clock":
      return session.setClock(message.color, message.remainingMs);
    case "set-paused":
      return session.setPaused(message.paused);
    case "reset-game":
      return session.resetGame();
  }
};
