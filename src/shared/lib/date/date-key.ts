export function timeZoneOf(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

export function dateKey(date = new Date(), timeZone = timeZoneOf()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) {
    throw new Error("Could not format the local date");
  }
  return `${year}-${month}-${day}`;
}

export function hourInZone(date = new Date(), timeZone = timeZoneOf()): number {
  const value = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    hourCycle: "h23",
  }).format(date);
  const hour = Number(value);
  return hour === 24 ? 0 : hour;
}

export type GreetingPart = "morning" | "afternoon" | "evening";

export function greetingFor(date = new Date(), timeZone = timeZoneOf()): GreetingPart {
  const hour = hourInZone(date, timeZone);
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}

export function recentDateKeys(count = 7, from = new Date(), timeZone = timeZoneOf()): string[] {
  const [year, month, day] = dateKey(from, timeZone).split("-").map(Number);
  const cursor = new Date(Date.UTC(year!, (month ?? 1) - 1, day));
  const keys: string[] = [];
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const date = new Date(cursor);
    date.setUTCDate(cursor.getUTCDate() - offset);
    const nextYear = date.getUTCFullYear();
    const nextMonth = String(date.getUTCMonth() + 1).padStart(2, "0");
    const nextDay = String(date.getUTCDate()).padStart(2, "0");
    keys.push(`${nextYear}-${nextMonth}-${nextDay}`);
  }
  return keys;
}

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function parseKey(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(Date.UTC(year!, (month ?? 1) - 1, day ?? 1));
}

function toKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(key: string, amount: number): string {
  const date = parseKey(key);
  date.setUTCDate(date.getUTCDate() + amount);
  return toKey(date);
}

/** 0 = Monday … 6 = Sunday. */
export function weekdayOf(key: string): number {
  return (parseKey(key).getUTCDay() + 6) % 7;
}

export function daysBetween(from: string, to: string): number {
  return Math.round((parseKey(to).getTime() - parseKey(from).getTime()) / 86_400_000);
}

export function keysBetween(from: string, to: string): string[] {
  const keys: string[] = [];
  for (let cursor = from; cursor <= to; cursor = addDays(cursor, 1)) keys.push(cursor);
  return keys;
}

/** The seven keys of the week that contains `key`. */
export function weekOf(key: string, start: "monday" | "sunday" = "monday"): string[] {
  const offset = start === "monday" ? weekdayOf(key) : (weekdayOf(key) + 1) % 7;
  const first = addDays(key, -offset);
  return Array.from({ length: 7 }, (_, index) => addDays(first, index));
}

export function monthOf(key: string): string[] {
  const first = `${key.slice(0, 7)}-01`;
  const date = parseKey(first);
  date.setUTCMonth(date.getUTCMonth() + 1);
  date.setUTCDate(0);
  return keysBetween(first, toKey(date));
}

export function dateFromKey(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year!, (month ?? 1) - 1, day ?? 1, 12);
}

export function formatKey(key: string, locale: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(locale, options).format(dateFromKey(key));
}

export function isoWeekKey(key: string): string {
  const date = parseKey(key);
  const day = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((date.getTime() - firstThursday.getTime()) / 86_400_000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}
