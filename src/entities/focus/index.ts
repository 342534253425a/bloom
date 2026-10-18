import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState } from "react";
import { addDays, dateKey } from "@/shared/lib/date";
import { createId } from "@/shared/lib/id";
import { db, type FocusSession } from "@/shared/db";

async function activeSession(userId: string): Promise<FocusSession | undefined> {
  const rows = await db.focusSessions.where("userId").equals(userId).toArray();
  return rows.find((session) => session.status === "running" || session.status === "paused");
}

export function useActiveFocus(userId: string) {
  return useLiveQuery(async () => (await activeSession(userId)) ?? null, [userId]);
}

export function remainingMs(focus: FocusSession | null | undefined, now: number): number {
  if (!focus) return 0;
  if (focus.status === "paused") return focus.pausedRemainingMs ?? focus.plannedSec * 1000;
  if (focus.status === "running" && focus.endsAt) return Math.max(0, new Date(focus.endsAt).getTime() - now);
  return 0;
}

export async function startFocus(
  userId: string,
  options: { minutes: number; kind?: "focus" | "break"; label?: string | null; taskId?: string | null },
): Promise<void> {
  const current = await activeSession(userId);
  if (current) await db.focusSessions.delete(current.id);
  const now = new Date();
  const plannedSec = Math.round(options.minutes * 60);
  await db.focusSessions.add({
    id: createId(),
    userId,
    plannedSec,
    startedAt: now.toISOString(),
    endsAt: new Date(now.getTime() + plannedSec * 1000).toISOString(),
    pausedRemainingMs: null,
    status: "running",
    kind: options.kind ?? "focus",
    label: options.label?.trim() || null,
    taskId: options.taskId ?? null,
  });
}

export async function pauseFocus(session: FocusSession): Promise<void> {
  if (session.status !== "running" || !session.endsAt) return;
  await db.focusSessions.update(session.id, {
    status: "paused",
    endsAt: null,
    pausedRemainingMs: Math.max(0, new Date(session.endsAt).getTime() - Date.now()),
  });
}

export async function resumeFocus(session: FocusSession): Promise<void> {
  if (session.status !== "paused") return;
  await db.focusSessions.update(session.id, {
    status: "running",
    endsAt: new Date(Date.now() + (session.pausedRemainingMs ?? 0)).toISOString(),
    pausedRemainingMs: null,
  });
}

export async function completeFocus(session: FocusSession): Promise<void> {
  // Finishing early still counts the minutes actually spent.
  const spentSec = Math.round((session.plannedSec * 1000 - remainingMs(session, Date.now())) / 1000);
  if (spentSec < 60) {
    await db.focusSessions.delete(session.id);
    return;
  }
  await db.focusSessions.update(session.id, {
    status: "completed",
    plannedSec: Math.min(session.plannedSec, spentSec),
    endsAt: new Date().toISOString(),
    pausedRemainingMs: null,
  });
}

export async function cancelFocus(session: FocusSession): Promise<void> {
  await db.focusSessions.delete(session.id);
}

/** Ticks while a session runs and closes it once the time is up. */
export function useFocusClock(userId: string) {
  const focus = useActiveFocus(userId);
  const [now, setNow] = useState(() => Date.now());
  const [finished, setFinished] = useState<FocusSession | null>(null);

  useEffect(() => {
    if (!focus || focus.status !== "running" || !focus.endsAt) return;
    const endsAt = new Date(focus.endsAt).getTime();
    const tick = () => {
      const current = Date.now();
      setNow(current);
      if (current >= endsAt) {
        void db.focusSessions.update(focus.id, { status: "completed", pausedRemainingMs: null });
        setFinished(focus);
      }
    };
    tick();
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [focus]);

  return { focus, remaining: remainingMs(focus, now), finished, clearFinished: () => setFinished(null) };
}

export type FocusDay = { key: string; minutes: number; sessions: number };

export function useFocusStats(userId: string, days = 7) {
  const today = dateKey();
  return useLiveQuery(async () => {
    const rows = (await db.focusSessions.where("userId").equals(userId).toArray()).filter(
      (session) => session.status === "completed" && (session.kind ?? "focus") === "focus",
    );
    const keyOf = (session: FocusSession) => dateKey(new Date(session.startedAt));
    const span: FocusDay[] = Array.from({ length: days }, (_, index) => {
      const key = addDays(today, index - days + 1);
      const own = rows.filter((session) => keyOf(session) === key);
      return { key, sessions: own.length, minutes: own.reduce((sum, session) => sum + Math.round(session.plannedSec / 60), 0) };
    });
    const recent = rows
      .slice()
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .slice(0, 12);
    return {
      span,
      today: span.at(-1) ?? { key: today, minutes: 0, sessions: 0 },
      totalMinutes: rows.reduce((sum, session) => sum + Math.round(session.plannedSec / 60), 0),
      totalSessions: rows.length,
      recent,
    };
  }, [userId, today, days]);
}
