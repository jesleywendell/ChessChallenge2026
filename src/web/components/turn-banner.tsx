import type { Color, GameResult, GameSnapshot } from "../../shared/protocol";
import { describeMove } from "../move-description";

const RESULT_TITLES: Record<GameResult["outcome"], string> = {
  checkmate: "Xeque-mate",
  stalemate: "Empate por afogamento",
  "insufficient-material": "Empate por material insuficiente",
  "threefold-repetition": "Empate por repetição tripla",
  "fifty-move-rule": "Empate pela regra dos 50 lances",
};

const bannerClasses = (tone: "engine" | "action" | "warning" | "danger" | "neutral"): string => {
  const tones = {
    engine: "border-sky-500 bg-sky-950/50",
    action: "border-emerald-400 bg-emerald-950/60",
    warning: "border-amber-400 bg-amber-950/50",
    danger: "border-red-500 bg-red-950/60",
    neutral: "border-slate-700 bg-slate-900",
  };
  return `rounded-xl border-2 p-4 ${tones[tone]}`;
};

const winnerText = (winner: Color | null, ourColor: Color): string => {
  if (!winner) return "Partida empatada.";
  return winner === ourColor ? "Vitória da IA!" : "Vitória do adversário.";
};

export function TurnBanner({ snapshot, ourColor }: { snapshot: GameSnapshot; ourColor: Color }) {
  const lastMove = snapshot.moves.at(-1);

  if (snapshot.result) {
    return (
      <div
        role="status"
        className={bannerClasses(snapshot.result.winner === ourColor ? "action" : "neutral")}
      >
        <p className="text-xl font-bold">{RESULT_TITLES[snapshot.result.outcome]}</p>
        <p className="text-slate-300">{winnerText(snapshot.result.winner, ourColor)}</p>
      </div>
    );
  }

  if (snapshot.resumedFromDisk && snapshot.clock.paused) {
    return (
      <div role="status" className={bannerClasses("warning")}>
        <p className="text-lg font-bold">Partida retomada do disco</p>
        <p className="text-sm text-slate-300">
          O relógio está pausado. Confira a posição e o relógio físico e então toque em Retomar.
        </p>
      </div>
    );
  }

  if (snapshot.engine.state === "error") {
    return (
      <div role="alert" className={bannerClasses("danger")}>
        <p className="text-lg font-bold">Problema no motor</p>
        <p className="text-sm text-red-100">{snapshot.engine.message}</p>
      </div>
    );
  }

  if (snapshot.turn === ourColor) {
    return (
      <div role="status" className={bannerClasses("engine")}>
        <p className="text-xl font-bold">IA pensando…</p>
      </div>
    );
  }

  if (lastMove?.author === "engine") {
    return (
      <div role="status" aria-live="assertive" className={bannerClasses("action")}>
        <p className="text-sm font-medium text-emerald-200">Jogue no tabuleiro físico</p>
        <p className="font-mono text-5xl font-extrabold tracking-tight">{lastMove.san}</p>
        <p className="mt-1 text-lg text-emerald-100">{describeMove(lastMove)}</p>
        <p className="mt-2 text-xs text-slate-300">Depois, informe o lance do adversário.</p>
      </div>
    );
  }

  return (
    <div role="status" className={bannerClasses("neutral")}>
      <p className="text-lg font-bold">Aguardando o primeiro lance das Brancas</p>
      <p className="text-sm text-slate-400">Informe o lance do adversário no tabuleiro.</p>
    </div>
  );
}
