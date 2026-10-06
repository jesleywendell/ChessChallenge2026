import { type FormEvent, useEffect, useRef, useState } from "react";
import { sendMessage } from "../game-connection";

export function MoveInput({ enabled }: { enabled: boolean }) {
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (enabled) inputRef.current?.focus();
  }, [enabled]);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const move = text.trim();
    if (!move) return;
    sendMessage({ type: "opponent-move", move });
    setText("");
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <label className="sr-only" htmlFor="opponent-move">
        Lance do adversário
      </label>
      <input
        id="opponent-move"
        ref={inputRef}
        value={text}
        onChange={(event) => setText(event.target.value)}
        disabled={!enabled}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        placeholder={enabled ? "Lance do adversário (ex.: e2e4 ou Nf3)" : "Aguardando a IA…"}
        className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-lg placeholder:font-sans placeholder:text-base placeholder:text-slate-500 disabled:opacity-50"
      />
      <button
        type="submit"
        disabled={!enabled || text.trim() === ""}
        className="rounded-lg bg-amber-400 px-4 py-2 font-semibold text-slate-950 hover:bg-amber-300 disabled:opacity-40"
      >
        Enviar
      </button>
    </form>
  );
}
