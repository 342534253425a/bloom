import { describe, expect, it } from "vitest";
import { dateKey, formatClock, greetingFor, recentDateKeys } from "./date-key";

describe("dateKey", () => {
  it("uses the local calendar day in Moscow, not UTC", () => {
    expect(dateKey(new Date("2026-10-07T21:30:00Z"), "Europe/Moscow")).toBe("2026-10-08");
    expect(dateKey(new Date("2026-10-08T20:30:00Z"), "Europe/Moscow")).toBe("2026-10-08");
    expect(dateKey(new Date("2026-10-08T21:30:00Z"), "Europe/Moscow")).toBe("2026-10-09");
  });
});

describe("greetingFor", () => {
  it("splits the day at noon and 18:00 local", () => {
    expect(greetingFor(new Date("2026-10-08T06:30:00Z"), "Europe/Moscow")).toBe("morning");
    expect(greetingFor(new Date("2026-10-08T10:30:00Z"), "Europe/Moscow")).toBe("afternoon");
    expect(greetingFor(new Date("2026-10-08T18:30:00Z"), "Europe/Moscow")).toBe("evening");
  });
});

describe("recentDateKeys", () => {
  it("ends on the local calendar day and walks backward", () => {
    const keys = recentDateKeys(3, new Date("2026-10-08T21:30:00Z"), "Europe/Moscow");
    expect(keys).toEqual(["2026-10-07", "2026-10-08", "2026-10-09"]);
  });
});

describe("formatClock", () => {
  it("renders a 25 minute focus block", () => {
    expect(formatClock(25 * 60 * 1000)).toBe("25:00");
    expect(formatClock(90 * 1000)).toBe("1:30");
  });
});
