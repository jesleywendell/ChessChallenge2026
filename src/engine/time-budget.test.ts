import { describe, expect, it } from "vitest";
import { computeThinkBudget, creditPonderTime } from "./time-budget";

const FULL_CLOCK_MS = 25 * 60 * 1000;

describe("computeThinkBudget", () => {
  it("never plans a hard limit below the soft limit", () => {
    for (const fullmoveNumber of [1, 12, 30, 45, 70]) {
      const budget = computeThinkBudget({
        remainingMs: FULL_CLOCK_MS,
        fullmoveNumber,
        humanOverheadMs: 5_000,
      });

      expect(budget.hardMs).toBeGreaterThanOrEqual(budget.softMs);
    }
  });

  it("spends more per move in the middlegame than in the opening", () => {
    const input = { remainingMs: FULL_CLOCK_MS, humanOverheadMs: 5_000 };

    const opening = computeThinkBudget({ ...input, fullmoveNumber: 5 });
    const middlegame = computeThinkBudget({ ...input, fullmoveNumber: 20 });

    expect(middlegame.softMs).toBeGreaterThan(opening.softMs);
  });

  it("reserves human overhead so a larger overhead shrinks the budget", () => {
    const base = { remainingMs: FULL_CLOCK_MS, fullmoveNumber: 15 };

    const quick = computeThinkBudget({ ...base, humanOverheadMs: 2_000 });
    const slow = computeThinkBudget({ ...base, humanOverheadMs: 8_000 });

    expect(slow.softMs).toBeLessThan(quick.softMs);
  });

  it("caps a single move to a fraction of the usable clock", () => {
    const budget = computeThinkBudget({
      remainingMs: FULL_CLOCK_MS,
      fullmoveNumber: 20,
      humanOverheadMs: 5_000,
    });

    expect(budget.hardMs).toBeLessThan(FULL_CLOCK_MS * 0.2);
  });

  it("falls back to fast moves when the clock cannot cover human overhead", () => {
    const budget = computeThinkBudget({
      remainingMs: 20_000,
      fullmoveNumber: 25,
      humanOverheadMs: 5_000,
    });

    expect(budget).toEqual({ softMs: 300, hardMs: 1_000 });
  });

  it("keeps the soft limit well below the remaining clock", () => {
    const budget = computeThinkBudget({
      remainingMs: 90_000,
      fullmoveNumber: 40,
      humanOverheadMs: 1_000,
    });

    expect(budget.hardMs).toBeLessThan(90_000 / 4);
  });
});

describe("creditPonderTime", () => {
  it("subtracts the pondered time from both limits", () => {
    const credited = creditPonderTime({ softMs: 20_000, hardMs: 60_000 }, 8_000);

    expect(credited).toEqual({ softMs: 12_000, hardMs: 52_000 });
  });

  it("keeps a minimum follow-up when pondering already covered the budget", () => {
    const credited = creditPonderTime({ softMs: 20_000, hardMs: 60_000 }, 90_000);

    expect(credited.softMs).toBe(500);
    expect(credited.hardMs).toBe(1_000);
  });
});
