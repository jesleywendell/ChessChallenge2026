import { useState } from "react";
import type { Color, GameSnapshot } from "../shared/protocol";
import { BoardPanel } from "./components/board-panel";
import { ClockPanel } from "./components/clock-panel";
import { EnginePanel } from "./components/engine-panel";
import { ErrorToast } from "./components/error-toast";
import { GameControls } from "./components/game-controls";
import { MoveHistory } from "./components/move-history";
import { MoveInput } from "./components/move-input";
import { SetupPanel } from "./components/setup-panel";
import { TurnBanner } from "./components/turn-banner";
import { type ConnectionState, type ConnectionStatus, useConnectionState } from "./game-connection";

const STATUS_LABELS: Record<ConnectionStatus, string> = {
  connecting: "Conectando…",
  open: "Conectado",
  closed: "Reconectando…",
};

function Header({ status }: { status: ConnectionStatus }) {
  return (
    <header className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
      <h1 className="text-lg font-bold">
        Chess Challenge III <span className="font-normal text-slate-400">· Assistente</span>
      </h1>
      <span
        role="status"
        className={`rounded-full px-3 py-1 text-xs font-semibold ${
          status === "open" ? "bg-emerald-500/20 text-emerald-300" : "bg-red-500/20 text-red-300"
        }`}
      >
        {STATUS_LABELS[status]}
      </span>
    </header>
  );
}

type GameScreenProps = {
  connection: ConnectionState;
  snapshot: GameSnapshot;
  ourColor: Color;
};

function GameScreen({ connection, snapshot, ourColor }: GameScreenProps) {
  const [flipped, setFlipped] = useState(false);
  const canEnterOpponentMove = snapshot.phase === "playing" && snapshot.turn !== ourColor;

  return (
    <main className="mx-auto grid max-w-7xl gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_26rem]">
      <div className="flex flex-col gap-3">
        <BoardPanel
          snapshot={snapshot}
          ourColor={ourColor}
          flipped={flipped}
          errorId={connection.error?.id ?? 0}
        />
        <div className="mx-auto w-[min(100%,calc(100dvh-11rem))]">
          <MoveInput enabled={canEnterOpponentMove} />
        </div>
      </div>

      <aside className="flex min-h-0 flex-col gap-3 lg:max-h-[calc(100dvh-6rem)]">
        <TurnBanner snapshot={snapshot} ourColor={ourColor} />
        <ClockPanel
          snapshot={snapshot}
          ourColor={ourColor}
          snapshotReceivedAtMs={connection.snapshotReceivedAtMs}
        />
        <EnginePanel engine={snapshot.engine} progress={connection.progress} />
        <MoveHistory moves={snapshot.moves} ourColor={ourColor} />
        <GameControls snapshot={snapshot} onFlipBoard={() => setFlipped((current) => !current)} />
      </aside>
    </main>
  );
}

export function App() {
  const connection = useConnectionState();
  const { snapshot, status } = connection;
  const ourColor = snapshot?.config?.ourColor;

  return (
    <div className="min-h-dvh">
      <Header status={status} />
      {!snapshot ? (
        <p className="p-8 text-center text-slate-400">Conectando ao servidor…</p>
      ) : snapshot.phase === "setup" || !ourColor ? (
        <SetupPanel />
      ) : (
        <GameScreen connection={connection} snapshot={snapshot} ourColor={ourColor} />
      )}
      <ErrorToast error={connection.error} />
    </div>
  );
}
