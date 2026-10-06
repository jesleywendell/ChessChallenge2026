import { describe, expect, it } from "vitest";
import { createStopPolicy, type SearchIteration } from "./stop-policy";

const SOFT_MS = 10_000;
const HARD_MS = 30_000;

const iteration = (depth: number, overrides: Partial<SearchIteration> = {}): SearchIteration => ({
  depth,
  bestMove: "e2e4",
  scoreCp: 30,
  mateIn: null,
  ...overrides,
});

const observeAll = (policy: ReturnType<typeof createStopPolicy>, iterations: SearchIteration[]) => {
  for (const next of iterations) policy.observe(next);
};

describe("createStopPolicy", () => {
  it("waits when nothing was searched yet, until the hard limit", () => {
    const policy = createStopPolicy({ softMs: SOFT_MS, hardMs: HARD_MS });

    expect(policy.shouldStop(SOFT_MS + 1)).toBeNull();
    expect(policy.shouldStop(HARD_MS)).toBe("hard-limit");
  });

  it("stops at the hard limit even when the position is unstable", () => {
    const policy = createStopPolicy({ softMs: SOFT_MS, hardMs: HARD_MS });
    observeAll(policy, [
      iteration(13, { bestMove: "a2a3" }),
      iteration(14, { bestMove: "b2b3" }),
      iteration(15, { bestMove: "c2c3" }),
    ]);

    expect(policy.shouldStop(HARD_MS + 1)).toBe("hard-limit");
  });

  it("keeps searching before the soft limit", () => {
    const policy = createStopPolicy({ softMs: SOFT_MS, hardMs: HARD_MS });
    observeAll(policy, [iteration(12), iteration(13), iteration(14)]);

    expect(policy.shouldStop(SOFT_MS - 1)).toBeNull();
  });

  it("stops at the soft limit when the best move and score are stable", () => {
    const policy = createStopPolicy({ softMs: SOFT_MS, hardMs: HARD_MS });
    observeAll(policy, [iteration(12), iteration(13, { scoreCp: 35 }), iteration(14)]);

    expect(policy.shouldStop(SOFT_MS)).toBe("soft-stable");
  });

  it("extends past the soft limit when the best move keeps changing", () => {
    const policy = createStopPolicy({ softMs: SOFT_MS, hardMs: HARD_MS });
    observeAll(policy, [
      iteration(12),
      iteration(13, { bestMove: "d2d4" }),
      iteration(14, { bestMove: "e2e4" }),
    ]);

    expect(policy.shouldStop(SOFT_MS + 5_000)).toBeNull();
  });

  it("extends past the soft limit when the evaluation is dropping", () => {
    const policy = createStopPolicy({ softMs: SOFT_MS, hardMs: HARD_MS });
    observeAll(policy, [
      iteration(12, { scoreCp: 60 }),
      iteration(13, { scoreCp: 30 }),
      iteration(14, { scoreCp: -10 }),
    ]);

    expect(policy.shouldStop(SOFT_MS + 5_000)).toBeNull();
  });

  it("does not trust shallow iterations at the soft limit", () => {
    const policy = createStopPolicy({ softMs: SOFT_MS, hardMs: HARD_MS });
    observeAll(policy, [iteration(6), iteration(7), iteration(8)]);

    expect(policy.shouldStop(SOFT_MS + 1)).toBeNull();
  });

  it("plays easy moves early once many deep iterations agree", () => {
    const policy = createStopPolicy({ softMs: SOFT_MS, hardMs: HARD_MS });
    observeAll(
      policy,
      Array.from({ length: 8 }, (_, index) => iteration(12 + index, { scoreCp: 30 + (index % 3) })),
    );

    expect(policy.shouldStop(SOFT_MS * 0.3)).toBe("easy-move");
    expect(policy.shouldStop(SOFT_MS * 0.2)).toBeNull();
  });

  it("stops as soon as a forced mate is fully searched", () => {
    const policy = createStopPolicy({ softMs: SOFT_MS, hardMs: HARD_MS });
    policy.observe(iteration(8, { scoreCp: null, mateIn: 3 }));

    expect(policy.shouldStop(10)).toBe("mate-found");
  });

  it("keeps searching while being mated", () => {
    const policy = createStopPolicy({ softMs: SOFT_MS, hardMs: HARD_MS });
    policy.observe(iteration(8, { scoreCp: null, mateIn: -3 }));

    expect(policy.shouldStop(10)).toBeNull();
  });

  it("keeps only the latest result per depth", () => {
    const policy = createStopPolicy({ softMs: SOFT_MS, hardMs: HARD_MS });
    observeAll(policy, [
      iteration(12),
      iteration(13),
      iteration(14, { bestMove: "a2a3" }),
      iteration(14),
    ]);

    expect(policy.shouldStop(SOFT_MS)).toBe("soft-stable");
  });
});
