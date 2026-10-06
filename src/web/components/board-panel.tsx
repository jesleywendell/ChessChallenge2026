import { Chess, type Move } from "chess.js";
import { type CSSProperties, useMemo, useState } from "react";
import { Chessboard } from "react-chessboard";
import { type Color, type GameSnapshot, oppositeColor } from "../../shared/protocol";
import { sendMessage } from "../game-connection";

type PromotionPiece = "q" | "r" | "b" | "n";
type MoveAttempt = "sent" | "awaiting-promotion" | "illegal";
type LocalMoveState = {
  stateKey: string;
  selectedSquare: string | null;
  promotion: { from: string; to: string } | null;
  optimisticFen: string | null;
};

const PROMOTION_CHOICES: { piece: PromotionPiece; label: string; glyph: string }[] = [
  { piece: "q", label: "Dama", glyph: "♛" },
  { piece: "r", label: "Torre", glyph: "♜" },
  { piece: "b", label: "Bispo", glyph: "♝" },
  { piece: "n", label: "Cavalo", glyph: "♞" },
];

const PIECE_COLOR_PREFIX: Record<Color, string> = { white: "w", black: "b" };
const CHESS_COLOR: Record<Color, "w" | "b"> = { white: "w", black: "b" };

const LIGHT_SQUARE_STYLE: CSSProperties = { backgroundColor: "#eae9d2" };
const DARK_SQUARE_STYLE: CSSProperties = { backgroundColor: "#4b7399" };
const LAST_MOVE_STYLE: CSSProperties = { backgroundColor: "rgba(250, 204, 21, 0.45)" };
const SELECTED_STYLE: CSSProperties = { backgroundColor: "rgba(56, 189, 248, 0.6)" };
const CHECK_STYLE: CSSProperties = {
  background: "radial-gradient(circle, rgba(239,68,68,0.95) 0%, rgba(239,68,68,0) 75%)",
};
const TARGET_STYLE: CSSProperties = {
  background: "radial-gradient(circle, rgba(15,23,42,0.45) 20%, transparent 24%)",
};
const CAPTURE_TARGET_STYLE: CSSProperties = {
  background: "radial-gradient(circle, transparent 60%, rgba(15,23,42,0.45) 62%)",
};
const SUGGESTION_ARROW_COLOR = "rgba(34, 197, 94, 0.9)";

const emptyLocalState = (stateKey: string): LocalMoveState => ({
  stateKey,
  selectedSquare: null,
  promotion: null,
  optimisticFen: null,
});

const buildSquareStyles = (
  snapshot: GameSnapshot,
  selectedSquare: string | null,
  legalMoves: readonly Move[],
): Record<string, CSSProperties> => {
  const styles: Record<string, CSSProperties> = {};
  const lastMove = snapshot.moves.at(-1);
  if (lastMove) {
    styles[lastMove.from] = LAST_MOVE_STYLE;
    styles[lastMove.to] = LAST_MOVE_STYLE;
  }

  if (snapshot.inCheck) {
    const [kingSquare] = new Chess(snapshot.fen).findPiece({
      type: "k",
      color: CHESS_COLOR[snapshot.turn],
    });
    if (kingSquare) styles[kingSquare] = CHECK_STYLE;
  }

  if (selectedSquare) {
    styles[selectedSquare] = SELECTED_STYLE;
    for (const move of legalMoves.filter((candidate) => candidate.from === selectedSquare)) {
      styles[move.to] = move.captured ? CAPTURE_TARGET_STYLE : TARGET_STYLE;
    }
  }
  return styles;
};

type BoardPanelProps = {
  snapshot: GameSnapshot;
  ourColor: Color;
  flipped: boolean;
  errorId: number;
};

export function BoardPanel({ snapshot, ourColor, flipped, errorId }: BoardPanelProps) {
  const opponentColor = oppositeColor(ourColor);
  const stateKey = `${snapshot.fen}|${errorId}`;
  const [storedState, setStoredState] = useState<LocalMoveState>(emptyLocalState(stateKey));
  const local = storedState.stateKey === stateKey ? storedState : emptyLocalState(stateKey);

  const canEnterMove = snapshot.phase === "playing" && snapshot.turn === opponentColor;
  const legalMoves = useMemo(
    () => new Chess(snapshot.fen).moves({ verbose: true }),
    [snapshot.fen],
  );
  const squareStyles = useMemo(
    () => buildSquareStyles(snapshot, canEnterMove ? local.selectedSquare : null, legalMoves),
    [snapshot, canEnterMove, local.selectedSquare, legalMoves],
  );

  const lastMove = snapshot.moves.at(-1);
  const suggestion =
    snapshot.phase === "playing" && lastMove?.author === "engine" ? lastMove : null;

  const submitMove = (from: string, to: string, promotion?: PromotionPiece) => {
    const preview = new Chess(snapshot.fen);
    preview.move(promotion ? { from, to, promotion } : { from, to });
    setStoredState({ ...emptyLocalState(stateKey), optimisticFen: preview.fen() });
    sendMessage({ type: "opponent-move", move: `${from}${to}${promotion ?? ""}` });
  };

  const attemptMove = (from: string, to: string): MoveAttempt => {
    const candidates = legalMoves.filter((move) => move.from === from && move.to === to);
    if (candidates.length === 0) return "illegal";
    if (candidates.some((move) => move.promotion)) {
      setStoredState({ ...emptyLocalState(stateKey), promotion: { from, to } });
      return "awaiting-promotion";
    }
    submitMove(from, to);
    return "sent";
  };

  const handleSquareClick = ({
    square,
    piece,
  }: {
    square: string;
    piece: { pieceType: string } | null;
  }) => {
    if (!canEnterMove) return;
    if (local.selectedSquare && attemptMove(local.selectedSquare, square) !== "illegal") return;

    const isOpponentPiece = piece?.pieceType.startsWith(PIECE_COLOR_PREFIX[opponentColor]);
    setStoredState({
      ...emptyLocalState(stateKey),
      selectedSquare: isOpponentPiece ? square : null,
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="aspect-square w-[min(100%,calc(100dvh-11rem))] self-center overflow-hidden rounded-lg shadow-2xl">
        <Chessboard
          options={{
            id: "main-board",
            position: local.optimisticFen ?? snapshot.fen,
            boardOrientation: flipped ? opponentColor : ourColor,
            allowDragging: canEnterMove,
            allowDrawingArrows: false,
            animationDurationInMs: 180,
            lightSquareStyle: LIGHT_SQUARE_STYLE,
            darkSquareStyle: DARK_SQUARE_STYLE,
            squareStyles,
            arrows: suggestion
              ? [
                  {
                    startSquare: suggestion.from,
                    endSquare: suggestion.to,
                    color: SUGGESTION_ARROW_COLOR,
                  },
                ]
              : [],
            canDragPiece: ({ piece }) =>
              canEnterMove && piece.pieceType.startsWith(PIECE_COLOR_PREFIX[opponentColor]),
            onPieceDrop: ({ sourceSquare, targetSquare }) =>
              targetSquare ? attemptMove(sourceSquare, targetSquare) === "sent" : false,
            onSquareClick: handleSquareClick,
          }}
        />
      </div>

      {local.promotion ? (
        <fieldset className="flex items-center justify-center gap-2 rounded-xl border border-amber-400 bg-slate-900 p-3">
          <legend className="sr-only">Escolha a peça da promoção</legend>
          <span aria-hidden className="mr-2 text-sm text-amber-200">
            Promover para:
          </span>
          {PROMOTION_CHOICES.map(({ piece, label, glyph }) => (
            <button
              key={piece}
              type="button"
              aria-label={label}
              onClick={() =>
                local.promotion && submitMove(local.promotion.from, local.promotion.to, piece)
              }
              className="flex size-14 items-center justify-center rounded-lg bg-slate-800 text-4xl hover:bg-slate-700"
            >
              <span aria-hidden>{glyph}</span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => setStoredState(emptyLocalState(stateKey))}
            className="ml-2 rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"
          >
            Cancelar
          </button>
        </fieldset>
      ) : null}
    </div>
  );
}
