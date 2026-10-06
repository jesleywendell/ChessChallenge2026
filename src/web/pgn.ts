import { Chess } from "chess.js";
import { playMove } from "../shared/chess-utils";
import type { GameSnapshot } from "../shared/protocol";

const RESULT_TAGS = { white: "1-0", black: "0-1" } as const;
const ENGINE_PLAYER = "IA (Stockfish)";
const OPPONENT_PLAYER = "Adversário";

export const buildPgn = (snapshot: GameSnapshot): string => {
  const chess = new Chess();
  const ourColor = snapshot.config?.ourColor ?? "white";
  chess.setHeader("Event", "Chess Challenge III - ICEV 2026");
  chess.setHeader("White", ourColor === "white" ? ENGINE_PLAYER : OPPONENT_PLAYER);
  chess.setHeader("Black", ourColor === "black" ? ENGINE_PLAYER : OPPONENT_PLAYER);
  chess.setHeader(
    "Result",
    snapshot.result?.winner
      ? RESULT_TAGS[snapshot.result.winner]
      : snapshot.result
        ? "1/2-1/2"
        : "*",
  );
  for (const move of snapshot.moves) playMove(chess, move.uci);
  return chess.pgn();
};
