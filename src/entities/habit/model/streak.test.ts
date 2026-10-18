import { describe, expect, it } from "vitest";
import { currentStreak, longestStreak, type StreakRules } from "./streak";

const days = (...keys: string[]) => new Set(keys);

describe("currentStreak", () => {
  it("counts back from today and forgives an unfinished today", () => {
    expect(currentStreak(days("2026-10-08", "2026-10-09"), "2026-10-10")).toBe(2);
    expect(currentStreak(days("2026-10-08", "2026-10-09", "2026-10-10"), "2026-10-10")).toBe(3);
  });

  it("breaks on a missed planned day", () => {
    expect(currentStreak(days("2026-10-06", "2026-10-08", "2026-10-09"), "2026-10-09")).toBe(2);
  });

  it("freezes on paused and unplanned days", () => {
    const rules: StreakRules = {
      start: "2026-01-01",
      planned: (key) => key !== "2026-10-07",
      paused: (key) => key === "2026-10-05",
    };
    expect(currentStreak(days("2026-10-04", "2026-10-06", "2026-10-08"), "2026-10-08", rules)).toBe(3);
  });
});

describe("longestStreak", () => {
  it("finds the best run", () => {
    expect(longestStreak(days("2026-10-01", "2026-10-02", "2026-10-03", "2026-10-05"), "2026-10-06")).toBe(3);
  });
});
