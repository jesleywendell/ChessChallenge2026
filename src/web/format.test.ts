import { describe, expect, it } from "vitest";
import { formatClock, formatNodesPerSecond, formatScore, parseClockInput } from "./format";

describe("formatClock", () => {
  it("formats minutes and seconds", () => {
    expect(formatClock(25 * 60 * 1000)).toBe("25:00");
    expect(formatClock(61_000)).toBe("1:01");
  });

  it("shows tenths of a second under twenty seconds", () => {
    expect(formatClock(19_950)).toBe("0:19.9");
    expect(formatClock(4_200)).toBe("0:04.2");
  });

  it("never shows negative time", () => {
    expect(formatClock(-500)).toBe("0:00.0");
  });
});

describe("parseClockInput", () => {
  it("parses mm:ss into milliseconds", () => {
    expect(parseClockInput("12:30")).toBe(750_000);
    expect(parseClockInput(" 5:05 ")).toBe(305_000);
  });

  it("rejects malformed values", () => {
    expect(parseClockInput("12")).toBeNull();
    expect(parseClockInput("12:75")).toBeNull();
    expect(parseClockInput("abc")).toBeNull();
  });
});

describe("formatScore", () => {
  it("shows signed pawns", () => {
    expect(formatScore(35, null)).toBe("+0.35");
    expect(formatScore(-120, null)).toBe("−1.20");
    expect(formatScore(0, null)).toBe("0.00");
  });

  it("shows mate distances", () => {
    expect(formatScore(null, 3)).toBe("#3");
    expect(formatScore(null, -2)).toBe("−#2");
  });

  it("shows a dash without evaluation", () => {
    expect(formatScore(null, null)).toBe("—");
  });
});

describe("formatNodesPerSecond", () => {
  it("formats in millions", () => {
    expect(formatNodesPerSecond(12_345_678)).toBe("12.3 Mn/s");
  });
});
