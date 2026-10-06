import { useEffect, useMemo, useRef } from "react";
import type { Color, MoveRecord, MoveSource } from "../../shared/protocol";
import { formatScore } from "../format";
import { groupMovesByNumber } from "../move-rows";

const SOURCE_BADGES: Partial<Record<MoveSource, string>> = {
  book: "livro",
  "ponder-hit": "ponder",
  forced: "único",
  emergency: "emerg.",
};

const COLOR_LABELS: Record<Color, string> = { white: "Brancas", black: "Pretas" };

const describeAnalysis = (move: MoveRecord): string => {
  if (move.author !== "engine" || move.depth === null) return "";
  const thinkSeconds = move.thinkMs === null ? "" : ` · ${(move.thinkMs / 1000).toFixed(1)}s`;
  return `Aval. ${formatScore(move.scoreCp, move.mateIn)} · prof. ${move.depth}${thinkSeconds}`;
};

function MoveCell({ move }: { move: MoveRecord | null }) {
  if (!move) return <td className="px-2 py-1" />;
  const isEngine = move.author === "engine";
  const badge = SOURCE_BADGES[move.source];

  return (
    <td className="px-2 py-1" title={describeAnalysis(move)}>
      <span className="flex items-center gap-1.5">
        <span
          aria-hidden
          className={`size-2 shrink-0 rounded-full ${isEngine ? "bg-emerald-400" : "bg-amber-400"}`}
        />
        <span className="sr-only">{isEngine ? "IA" : "Adversário"}:</span>
        <span
          className={`font-mono text-base ${isEngine ? "font-bold text-emerald-200" : "text-amber-100"}`}
        >
          {move.san}
        </span>
        {badge ? (
          <span className="rounded bg-slate-800 px-1 text-[10px] uppercase text-slate-400">
            {badge}
          </span>
        ) : null}
      </span>
    </td>
  );
}

export function MoveHistory({
  moves,
  ourColor,
}: {
  moves: readonly MoveRecord[];
  ourColor: Color;
}) {
  const rows = useMemo(() => groupMovesByNumber(moves), [moves]);
  const scrollRef = useRef<HTMLDivElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: rolar sempre que chegar um novo lance
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [moves.length]);

  const headerLabel = (color: Color): string =>
    `${COLOR_LABELS[color]} (${color === ourColor ? "IA" : "Adversário"})`;

  return (
    <section
      aria-label="Histórico de lances"
      className="flex min-h-0 flex-1 flex-col rounded-xl border border-slate-800 bg-slate-900"
    >
      <div ref={scrollRef} className="min-h-40 flex-1 overflow-y-auto">
        <table className="w-full text-left">
          <thead className="sticky top-0 bg-slate-900 text-xs text-slate-400">
            <tr>
              <th scope="col" className="w-10 px-2 py-2 font-medium">
                #
              </th>
              <th scope="col" className="px-2 py-2 font-medium">
                {headerLabel("white")}
              </th>
              <th scope="col" className="px-2 py-2 font-medium">
                {headerLabel("black")}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.moveNumber} className="odd:bg-slate-950/40">
                <th scope="row" className="px-2 py-1 text-sm font-normal text-slate-500">
                  {row.moveNumber}
                </th>
                <MoveCell move={row.white} />
                <MoveCell move={row.black} />
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? (
          <p className="p-4 text-center text-sm text-slate-500">Nenhum lance ainda.</p>
        ) : null}
      </div>
    </section>
  );
}
