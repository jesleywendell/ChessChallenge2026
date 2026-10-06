import type { EngineProgress, GameSnapshot } from "../../shared/protocol";
import { formatNodesPerSecond, formatScore } from "../format";

const STATE_LABELS: Record<GameSnapshot["engine"]["state"], string> = {
  ready: "Pronto",
  thinking: "Pensando",
  pondering: "Ponderando (no tempo do adversário)",
  error: "Erro",
};

type EnginePanelProps = {
  engine: GameSnapshot["engine"];
  progress: EngineProgress | null;
};

export function EnginePanel({ engine, progress }: EnginePanelProps) {
  const isSearching = engine.state === "thinking" || engine.state === "pondering";
  const visibleProgress = isSearching && progress?.mode === engine.state ? progress : null;

  return (
    <section aria-label="Motor" className="rounded-xl border border-slate-800 bg-slate-900 p-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-300">Stockfish</h2>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
            engine.state === "error"
              ? "bg-red-500/20 text-red-300"
              : isSearching
                ? "bg-sky-500/20 text-sky-300"
                : "bg-emerald-500/20 text-emerald-300"
          }`}
        >
          {STATE_LABELS[engine.state]}
        </span>
      </div>

      {visibleProgress ? (
        <dl className="mt-2 grid grid-cols-4 gap-2 text-center">
          <Metric label="Prof." value={String(visibleProgress.depth)} />
          <Metric
            label="Aval. IA"
            value={formatScore(visibleProgress.scoreCp, visibleProgress.mateIn)}
          />
          <Metric label="Vel." value={formatNodesPerSecond(visibleProgress.nodesPerSecond)} />
          <Metric label="Tempo" value={`${(visibleProgress.elapsedMs / 1000).toFixed(1)}s`} />
          <div className="col-span-4 text-left font-mono text-xs text-slate-400">
            {visibleProgress.principalVariation.join(" ")}
          </div>
        </dl>
      ) : null}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="font-mono text-sm font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
