import { describe, expect, it } from "vitest";
import {
  createClock,
  passTurn,
  remainingMs,
  setPaused,
  setRemaining,
  startClock,
  stopClock,
  toClockSnapshot,
} from "./clock";

const START_MS = 1_000_000;
const INITIAL_MS = 25 * 60 * 1000;

describe("clock", () => {
  it("counts down only the running color", () => {
    const clock = startClock(createClock(INITIAL_MS), "white", START_MS);

    expect(remainingMs(clock, "white", START_MS + 4_000)).toBe(INITIAL_MS - 4_000);
    expect(remainingMs(clock, "black", START_MS + 4_000)).toBe(INITIAL_MS);
  });

  it("passes the turn, settling the mover and starting the other side", () => {
    const started = startClock(createClock(INITIAL_MS), "white", START_MS);

    const passed = passTurn(started, "white", START_MS + 3_000);

    expect(passed.runningColor).toBe("black");
    expect(remainingMs(passed, "white", START_MS + 50_000)).toBe(INITIAL_MS - 3_000);
    expect(remainingMs(passed, "black", START_MS + 5_000)).toBe(INITIAL_MS - 2_000);
  });

  it("charges the extra overhead to the mover when passing the turn", () => {
    const started = startClock(createClock(INITIAL_MS), "white", START_MS);

    const passed = passTurn(started, "white", START_MS + 3_000, 5_000);

    expect(remainingMs(passed, "white", START_MS + 3_000)).toBe(INITIAL_MS - 8_000);
  });

  it("never goes below zero", () => {
    const clock = startClock(createClock(1_000), "white", START_MS);

    expect(remainingMs(clock, "white", START_MS + 60_000)).toBe(0);
    expect(remainingMs(passTurn(clock, "white", START_MS + 500, 9_000), "white", START_MS)).toBe(0);
  });

  it("freezes while paused and resumes from the same value", () => {
    const running = startClock(createClock(INITIAL_MS), "white", START_MS);
    const paused = setPaused(running, true, START_MS + 10_000);

    expect(remainingMs(paused, "white", START_MS + 90_000)).toBe(INITIAL_MS - 10_000);

    const resumed = setPaused(paused, false, START_MS + 90_000);
    expect(remainingMs(resumed, "white", START_MS + 95_000)).toBe(INITIAL_MS - 15_000);
  });

  it("keeps a paused clock paused when the turn passes", () => {
    const paused = setPaused(
      startClock(createClock(INITIAL_MS), "white", START_MS),
      true,
      START_MS,
    );

    const passed = passTurn(paused, "white", START_MS + 20_000);

    expect(remainingMs(passed, "black", START_MS + 60_000)).toBe(INITIAL_MS);
  });

  it("lets the operator correct a color to match the physical clock", () => {
    const running = startClock(createClock(INITIAL_MS), "black", START_MS);

    const corrected = setRemaining(running, "black", 600_000, START_MS + 2_000);

    expect(remainingMs(corrected, "black", START_MS + 2_000)).toBe(600_000);
    expect(remainingMs(corrected, "black", START_MS + 7_000)).toBe(595_000);
  });

  it("stops running without losing elapsed time", () => {
    const running = startClock(createClock(INITIAL_MS), "white", START_MS);

    const stopped = stopClock(running, START_MS + 6_000);

    expect(stopped.runningColor).toBeNull();
    expect(remainingMs(stopped, "white", START_MS + 99_000)).toBe(INITIAL_MS - 6_000);
  });

  it("hides the running color in the snapshot while paused", () => {
    const paused = setPaused(
      startClock(createClock(INITIAL_MS), "white", START_MS),
      true,
      START_MS,
    );

    expect(toClockSnapshot(paused, START_MS)).toMatchObject({ runningColor: null, paused: true });
  });
});
