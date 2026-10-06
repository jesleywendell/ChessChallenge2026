import { type ClockSnapshot, type Color, oppositeColor } from "../shared/protocol";

export type Clock = {
  remainingMsByColor: Readonly<Record<Color, number>>;
  runningColor: Color | null;
  runningSinceMs: number | null;
  paused: boolean;
};

export const createClock = (initialMs: number): Clock => ({
  remainingMsByColor: { white: initialMs, black: initialMs },
  runningColor: null,
  runningSinceMs: null,
  paused: false,
});

export const remainingMs = (clock: Clock, color: Color, nowMs: number): number => {
  const base = clock.remainingMsByColor[color];
  if (clock.runningColor !== color || clock.runningSinceMs === null) return base;
  return Math.max(0, base - (nowMs - clock.runningSinceMs));
};

const withRemaining = (clock: Clock, color: Color, ms: number): Clock => ({
  ...clock,
  remainingMsByColor: { ...clock.remainingMsByColor, [color]: Math.max(0, Math.round(ms)) },
});

const settle = (clock: Clock, nowMs: number): Clock => {
  if (clock.runningColor === null) return clock;
  const settled = withRemaining(
    clock,
    clock.runningColor,
    remainingMs(clock, clock.runningColor, nowMs),
  );
  return { ...settled, runningSinceMs: clock.paused ? null : nowMs };
};

export const startClock = (clock: Clock, color: Color, nowMs: number): Clock => ({
  ...settle(clock, nowMs),
  runningColor: color,
  runningSinceMs: clock.paused ? null : nowMs,
});

/** Encerra o lance de `color`, cobra `extraChargeMs` dele e passa o relógio ao outro lado. */
export const passTurn = (clock: Clock, color: Color, nowMs: number, extraChargeMs = 0): Clock => {
  const settled = settle(clock, nowMs);
  const charged = withRemaining(settled, color, settled.remainingMsByColor[color] - extraChargeMs);
  return startClock(charged, oppositeColor(color), nowMs);
};

export const setRemaining = (clock: Clock, color: Color, ms: number, nowMs: number): Clock => {
  const settled = settle(clock, nowMs);
  return withRemaining(settled, color, ms);
};

export const setPaused = (clock: Clock, paused: boolean, nowMs: number): Clock => {
  if (clock.paused === paused) return clock;
  const settled = settle(clock, nowMs);
  return {
    ...settled,
    paused,
    runningSinceMs: paused || settled.runningColor === null ? null : nowMs,
  };
};

export const stopClock = (clock: Clock, nowMs: number): Clock => ({
  ...settle(clock, nowMs),
  runningColor: null,
  runningSinceMs: null,
});

export const toClockSnapshot = (clock: Clock, nowMs: number): ClockSnapshot => ({
  whiteMs: remainingMs(clock, "white", nowMs),
  blackMs: remainingMs(clock, "black", nowMs),
  runningColor: clock.paused ? null : clock.runningColor,
  paused: clock.paused,
});
