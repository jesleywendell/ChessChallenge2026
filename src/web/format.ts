const MILLISECONDS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const TENTHS_THRESHOLD_MS = 20_000;
const CENTIPAWNS_PER_PAWN = 100;
const MINUS_SIGN = "−";
const CLOCK_INPUT_PATTERN = /^(\d{1,3}):([0-5]?\d)$/;

export const formatClock = (ms: number): string => {
  const safeMs = Math.max(0, ms);
  const totalSeconds = Math.floor(safeMs / MILLISECONDS_PER_SECOND);
  const minutes = Math.floor(totalSeconds / SECONDS_PER_MINUTE);
  const seconds = String(totalSeconds % SECONDS_PER_MINUTE).padStart(2, "0");
  if (safeMs >= TENTHS_THRESHOLD_MS) return `${minutes}:${seconds}`;

  const tenths = Math.floor((safeMs % MILLISECONDS_PER_SECOND) / 100);
  return `${minutes}:${seconds}.${tenths}`;
};

/** Aceita "mm:ss" e devolve milissegundos, ou null se o texto for inválido. */
export const parseClockInput = (text: string): number | null => {
  const match = CLOCK_INPUT_PATTERN.exec(text.trim());
  if (!match) return null;
  const [, minutes = "0", seconds = "0"] = match;
  return (Number(minutes) * SECONDS_PER_MINUTE + Number(seconds)) * MILLISECONDS_PER_SECOND;
};

export const formatScore = (scoreCp: number | null, mateIn: number | null): string => {
  if (mateIn !== null) return mateIn > 0 ? `#${mateIn}` : `${MINUS_SIGN}#${Math.abs(mateIn)}`;
  if (scoreCp === null) return "—";
  const pawns = Math.abs(scoreCp / CENTIPAWNS_PER_PAWN).toFixed(2);
  if (scoreCp === 0) return pawns;
  return scoreCp > 0 ? `+${pawns}` : `${MINUS_SIGN}${pawns}`;
};

export const formatNodesPerSecond = (nodesPerSecond: number): string =>
  `${(nodesPerSecond / 1_000_000).toFixed(1)} Mn/s`;
