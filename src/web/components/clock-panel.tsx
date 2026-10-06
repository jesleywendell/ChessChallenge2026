import { type FormEvent, useEffect, useState } from "react";
import { type Color, type GameSnapshot, oppositeColor } from "../../shared/protocol";
import { formatClock, parseClockInput } from "../format";
import { sendMessage } from "../game-connection";

const CLOCK_TICK_MS = 100;
const COLOR_LABELS: Record<Color, string> = { white: "Brancas", black: "Pretas" };

const useNowMs = (): number => {
  const [nowMs, setNowMs] = useState(() => performance.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(performance.now()), CLOCK_TICK_MS);
    return () => window.clearInterval(timer);
  }, []);
  return nowMs;
};

type ClockCardProps = {
  color: Color;
  title: string;
  remainingMs: number;
  isRunning: boolean;
};

function ClockCard({ color, title, remainingMs, isRunning }: ClockCardProps) {
  const [draft, setDraft] = useState<string | null>(null);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const parsedMs = draft === null ? null : parseClockInput(draft);
    if (parsedMs !== null) sendMessage({ type: "set-clock", color, remainingMs: parsedMs });
    setDraft(null);
  };

  return (
    <div
      className={`flex flex-col gap-1 rounded-xl border-2 p-3 ${
        isRunning ? "border-emerald-400 bg-emerald-950/40" : "border-slate-800 bg-slate-900"
      }`}
    >
      <span className="text-xs text-slate-400">
        {title} · {COLOR_LABELS[color]}
      </span>
      {draft === null ? (
        <button
          type="button"
          onClick={() => setDraft(formatClock(remainingMs).split(".")[0] ?? "")}
          aria-label={`Ajustar relógio das ${COLOR_LABELS[color]}`}
          className={`text-left font-mono text-3xl font-bold tabular-nums ${
            remainingMs < 60_000 ? "text-red-300" : ""
          }`}
        >
          {formatClock(remainingMs)}
        </button>
      ) : (
        <form onSubmit={handleSubmit} className="flex gap-1">
          <input
            // biome-ignore lint/a11y/noAutofocus: campo aparece por ação explícita do usuário
            autoFocus
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => setDraft(null)}
            aria-label="Novo tempo (mm:ss)"
            placeholder="mm:ss"
            className="w-full rounded-lg border border-slate-600 bg-slate-950 px-2 py-1 font-mono text-xl"
          />
        </form>
      )}
    </div>
  );
}

type ClockPanelProps = {
  snapshot: GameSnapshot;
  ourColor: Color;
  snapshotReceivedAtMs: number;
};

export function ClockPanel({ snapshot, ourColor, snapshotReceivedAtMs }: ClockPanelProps) {
  const nowMs = useNowMs();
  const { clock } = snapshot;
  const elapsedMs = clock.runningColor ? Math.max(0, nowMs - snapshotReceivedAtMs) : 0;
  const remainingFor = (color: Color): number => {
    const baseMs = color === "white" ? clock.whiteMs : clock.blackMs;
    return clock.runningColor === color ? Math.max(0, baseMs - elapsedMs) : baseMs;
  };
  const opponentColor = oppositeColor(ourColor);

  return (
    <section aria-label="Relógios" className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2">
        <ClockCard
          color={ourColor}
          title="IA"
          remainingMs={remainingFor(ourColor)}
          isRunning={clock.runningColor === ourColor}
        />
        <ClockCard
          color={opponentColor}
          title="Adversário"
          remainingMs={remainingFor(opponentColor)}
          isRunning={clock.runningColor === opponentColor}
        />
      </div>
      <div className="flex items-center justify-between gap-2 text-xs text-slate-400">
        <span>Relógio estimado: toque no tempo para igualar ao relógio físico.</span>
        {snapshot.phase === "playing" ? (
          <button
            type="button"
            onClick={() => sendMessage({ type: "set-paused", paused: !clock.paused })}
            className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-semibold ${
              clock.paused
                ? "bg-amber-400 text-slate-950 hover:bg-amber-300"
                : "bg-slate-800 text-slate-100 hover:bg-slate-700"
            }`}
          >
            {clock.paused ? "Retomar" : "Pausar"}
          </button>
        ) : null}
      </div>
    </section>
  );
}
