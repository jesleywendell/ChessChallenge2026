import { useState } from "react";
import type { GameSnapshot } from "../../shared/protocol";
import { sendMessage } from "../game-connection";
import { buildPgn } from "../pgn";

const COPIED_FEEDBACK_MS = 2_000;
const NEW_GAME_CONFIRMATION = "Encerrar esta partida e voltar à configuração?";

type GameControlsProps = {
  snapshot: GameSnapshot;
  onFlipBoard: () => void;
};

const buttonClasses =
  "rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold hover:bg-slate-700 disabled:opacity-40";

export function GameControls({ snapshot, onFlipBoard }: GameControlsProps) {
  const [copied, setCopied] = useState(false);

  const handleCopyPgn = async () => {
    await navigator.clipboard.writeText(buildPgn(snapshot));
    setCopied(true);
    window.setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
  };

  const handleNewGame = () => {
    if (window.confirm(NEW_GAME_CONFIRMATION)) sendMessage({ type: "reset-game" });
  };

  return (
    <div className="grid grid-cols-2 gap-2">
      <button
        type="button"
        onClick={() => sendMessage({ type: "takeback" })}
        disabled={snapshot.moves.length === 0}
        className={buttonClasses}
      >
        Desfazer último lance
      </button>
      <button type="button" onClick={onFlipBoard} className={buttonClasses}>
        Virar tabuleiro
      </button>
      <button type="button" onClick={handleCopyPgn} className={buttonClasses}>
        {copied ? "PGN copiado ✓" : "Copiar PGN"}
      </button>
      <button type="button" onClick={handleNewGame} className={`${buttonClasses} text-red-300`}>
        Nova partida
      </button>
    </div>
  );
}
