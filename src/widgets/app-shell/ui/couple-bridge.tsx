import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { connectCouple, markAway, publishDay, setActivity, useCouple, useItems, type Activity } from "@/entities/couple";
import { db } from "@/shared/db";
import { useDay } from "@/entities/day";
import { useFocusStats } from "@/entities/focus";
import { useHabitBoard } from "@/entities/habit";
import { useUser } from "@/entities/session";
import { LoveReceiver } from "@/features/couple/love";
import { pendingInvite } from "@/pages/together/parts";

const activityByPath: Array<[string, Activity]> = [
  ["/watch", "watch"],
  ["/together/chat", "chat"],
  ["/together", "together"],
  ["/habits", "habits"],
  ["/tasks", "tasks"],
  ["/focus", "focus"],
  ["/body", "body"],
  ["/reflect", "reflect"],
  ["/goals", "goals"],
  ["/garden", "garden"],
  ["/learn", "learn"],
  ["/stats", "stats"],
];

/** Keeps the couple connected while the app is open: presence, incoming love, and today's summary for the shared garden. */
export function CoupleBridge() {
  const user = useUser();
  const couple = useCouple();
  const navigate = useNavigate();
  const path = useRouterState({ select: (state) => state.location.pathname });
  const board = useHabitBoard(user.id);
  const focus = useFocusStats(user.id, 1);
  const day = useDay(user.id);
  const publishTimer = useRef(0);
  const focusLogs = useItems<{ minutes: number; at: string; label: string | null }>("focuslog");

  // Shared focus sessions count in each person's own focus stats, once per device and account.
  useEffect(() => {
    if (!focusLogs.length) return;
    const key = `bloom.focuslogs.${user.id}`;
    let done: string[] = [];
    try {
      done = JSON.parse(localStorage.getItem(key) ?? "[]") as string[];
    } catch {
      done = [];
    }
    const fresh = focusLogs.filter((log) => !done.includes(log.id));
    if (!fresh.length) return;
    void (async () => {
      for (const log of fresh) {
        const end = new Date(log.data.at);
        await db.focusSessions.put({
          id: `shared-${log.id.replace("focuslog:", "")}`,
          userId: user.id,
          plannedSec: log.data.minutes * 60,
          startedAt: new Date(end.getTime() - log.data.minutes * 60_000).toISOString(),
          endsAt: log.data.at,
          pausedRemainingMs: null,
          status: "completed",
          kind: "focus",
          label: log.data.label ? `👥 ${log.data.label}` : "👥",
          taskId: null,
        });
      }
      localStorage.setItem(key, JSON.stringify([...done, ...fresh.map((log) => log.id)].slice(-500)));
    })();
  }, [focusLogs, user.id]);

  useEffect(() => {
    void connectCouple(user.id, user.displayName);
  }, [user.id, user.displayName]);

  useEffect(() => {
    if (pendingInvite() && couple.status === "ready" && !couple.partner && !path.startsWith("/together")) void navigate({ to: "/together" });
  }, [couple.status, couple.partner, path, navigate]);

  useEffect(() => {
    const match = activityByPath.find(([prefix]) => path === prefix || path.startsWith(`${prefix}/`));
    setActivity(match?.[1] ?? (path === "/" ? "home" : "other"));
  }, [path]);

  useEffect(() => {
    const onVisible = () => markAway(document.visibilityState !== "visible");
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  useEffect(() => {
    if (!couple.partner || !board) return;
    window.clearTimeout(publishTimer.current);
    publishTimer.current = window.setTimeout(() => {
      void publishDay({ done: board.done, planned: board.planned, focus: focus?.today.minutes ?? 0, mood: day?.mood ?? null });
    }, 1500);
    return () => window.clearTimeout(publishTimer.current);
  }, [couple.partner, board, focus, day]);

  return couple.partner ? <LoveReceiver /> : null;
}
