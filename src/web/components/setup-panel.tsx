import { type FormEvent, useState } from "react";
import {
  type Color,
  DEFAULT_HUMAN_OVERHEAD_MS,
  DEFAULT_INITIAL_CLOCK_MS,
  MAX_HUMAN_OVERHEAD_MS,
} from "../../shared/protocol";
import { sendMessage } from "../game-connection";

const MS_PER_MINUTE = 60_000;
const MS_PER_SECOND = 1_000;
const MAX_CLOCK_MINUTES = 180;

const COLOR_OPTIONS: { color: Color; label: string; glyph: string; hint: string }[] = [
  { color: "white", label: "Brancas", glyph: "♔", hint: "A IA faz o primeiro lance" },
  { color: "black", label: "Pretas", glyph: "♚", hint: "O adversário começa" },
];

export function SetupPanel() {
  const [ourColor, setOurColor] = useState<Color>("white");
  const [clockMinutes, setClockMinutes] = useState(DEFAULT_INITIAL_CLOCK_MS / MS_PER_MINUTE);
  const [overheadSeconds, setOverheadSeconds] = useState(DEFAULT_HUMAN_OVERHEAD_MS / MS_PER_SECOND);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    sendMessage({
      type: "start-game",
      config: {
        ourColor,
        initialClockMs: Math.round(clockMinutes * MS_PER_MINUTE),
        humanOverheadMs: Math.round(overheadSeconds * MS_PER_SECOND),
      },
    });
  };

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-8 px-4 py-10">
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-8 rounded-2xl border border-slate-800 bg-slate-900 p-6"
      >
        <h1 className="text-2xl font-bold">Nova partida</h1>

        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1 text-sm font-medium text-slate-300">Nossa cor</legend>
          <div className="grid grid-cols-2 gap-3">
            {COLOR_OPTIONS.map(({ color, label, glyph, hint }) => (
              <label
                key={color}
                className="flex cursor-pointer flex-col items-center gap-1 rounded-xl border-2 border-slate-700 p-4 text-center has-checked:border-emerald-400 has-checked:bg-emerald-950/40"
              >
                <input
                  type="radio"
                  name="our-color"
                  value={color}
                  checked={ourColor === color}
                  onChange={() => setOurColor(color)}
                  className="sr-only"
                />
                <span aria-hidden className="text-5xl leading-none">
                  {glyph}
                </span>
                <span className="text-lg font-semibold">{label}</span>
                <span className="text-xs text-slate-400">{hint}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid grid-cols-2 gap-4">
          <label className="flex flex-col gap-1 text-sm text-slate-300">
            Tempo por jogador (min)
            <input
              type="number"
              min={1}
              max={MAX_CLOCK_MINUTES}
              step={1}
              value={clockMinutes}
              onChange={(event) => setClockMinutes(Number(event.target.value))}
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-lg text-slate-100"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-slate-300">
            Tempo humano por lance (s)
            <input
              type="number"
              min={0}
              max={MAX_HUMAN_OVERHEAD_MS / MS_PER_SECOND}
              step={1}
              value={overheadSeconds}
              onChange={(event) => setOverheadSeconds(Number(event.target.value))}
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-lg text-slate-100"
            />
          </label>
        </div>
        <p className="-mt-4 text-xs text-slate-400">
          O tempo humano é o gasto fora do motor em cada lance (ler o tabuleiro, digitar, mover a
          peça e apertar o relógio). A IA reserva esse tempo antes de decidir quanto pensar.
        </p>

        <button
          type="submit"
          className="rounded-xl bg-emerald-500 px-6 py-3 text-lg font-bold text-slate-950 hover:bg-emerald-400"
        >
          Iniciar partida
        </button>
      </form>
    </main>
  );
}
