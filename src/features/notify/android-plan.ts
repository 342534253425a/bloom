import { readBoard } from "@/entities/habit";
import { alreadySent, inQuiet, kindOn, kindTime } from "@/entities/notify";
import type { Prefs } from "@/entities/prefs";
import { stats } from "@/entities/vocab";
import { kindById } from "@/shared/config/notifications";
import { db } from "@/shared/db";
import { addDays, dateKey, daysBetween, weekdayOf } from "@/shared/lib/date";
import { numericId, shell } from "@/shared/lib/native";

/**
 * The Android app can't run the page's 30-second reminder check while it's closed, so the
 * same reminders are handed to Android ahead of time (today and tomorrow) and fire on their own.
 * Planned again whenever the app opens, goes to the background or the settings change.
 */

type T = (key: string, options?: Record<string, unknown>) => string;
type Planned = { key: string; at: Date; title: string; body: string; to: string; urgent?: boolean };

const STORE = "bloom.native.planned";

function readPlanned(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(STORE) ?? "{}") as Record<string, number>;
  } catch {
    return {};
  }
}

/** True when Android was already told to show this reminder, so the page shouldn't show it again. */
export function plannedNatively(kind: string, period: string): boolean {
  if (shell !== "android") return false;
  const at = readPlanned()[`${kind}:${period}`];
  return at != null && at <= Date.now() + 60_000;
}

function at(day: string, clock: string, shiftMinutes = 0): Date {
  const date = new Date(`${day}T${clock.padStart(5, "0")}:00`);
  date.setMinutes(date.getMinutes() + shiftMinutes);
  return date;
}

async function collect(userId: string, prefs: Prefs, t: T): Promise<Planned[]> {
  const out: Planned[] = [];
  const today = dateKey();
  const on = (kind: string) => kindOn(prefs, kind);
  const add = (kind: string, period: string, when: Date, body: string, extra: { title?: string; urgent?: boolean } = {}) => {
    if (alreadySent(userId, kind, period)) return;
    out.push({ key: `${kind}:${period}`, at: when, title: extra.title ?? t(`notify.kind.${kind}`), body, to: kindById.get(kind)?.to ?? "/", urgent: extra.urgent });
  };
  const tasks = await db.tasks.where("userId").equals(userId).toArray();
  const lastDay = prefs.weekStart === "sunday" ? 5 : 6;

  for (const day of [today, addDays(today, 1)]) {
    const isToday = day === today;
    const time = (kind: string) => at(day, kindTime(prefs, kind));
    const dayRow = isToday ? await db.days.where("[userId+dateKey]").equals([userId, day]).first() : undefined;
    const open = tasks.filter((task) => task.dateKey === day && !task.done);

    if (on("morning") && !dayRow?.mood) add("morning", day, time("morning"), t("notify.msg.morning"));
    if (on("plan")) add("plan", day, time("plan"), open.length ? t("notify.msg.planSome", { count: open.length, first: open[0].title }) : t("notify.msg.planEmpty"));
    if (on("evening")) add("evening", day, time("evening"), t("notify.msg.evening"));
    if (on("bedtime")) add("bedtime", day, time("bedtime"), t("notify.msg.bedtime"));
    if (on("weekly") && weekdayOf(day) === lastDay) add("weekly", day, time("weekly"), t("notify.msg.weekly"));
    if (on("move") && !dayRow?.moveMinutes) add("move", day, time("move"), t("notify.msg.move"));

    const board = await readBoard(userId, day);
    if (!board.vacation) {
      if (on("habit"))
        for (const card of board.cards)
          if (card.reminder && card.plannedToday && !card.doneToday) add("habit", `${day}:${card.id}`, at(day, card.reminder), t("notify.msg.habit", { name: card.name }), { title: card.name });
      const left = board.planned - board.done;
      if (on("missed") && left > 0) add("missed", day, time("missed"), t("notify.msg.missed", { count: left }));
      const risky = board.cards.filter((card) => card.plannedToday && !card.doneToday && card.streak >= 2).sort((a, b) => b.streak - a.streak)[0];
      if (on("streak") && risky) add("streak", day, time("streak"), t("notify.msg.streak", { name: risky.name, days: risky.streak }));
    }

    if (on("task"))
      for (const task of open) if (task.clock) add("task", `${day}:${task.id}`, at(day, task.clock, -10), t("notify.msg.task", { title: task.title }), { title: task.title, urgent: true });
    if (on("tasksLeft") && open.length) add("tasksLeft", day, time("tasksLeft"), t("notify.msg.tasksLeft", { count: open.length }));

    if (on("water")) {
      const start = at(day, kindTime(prefs, "water"));
      const every = Math.max(1, prefs.waterEvery || 2);
      const done = dayRow?.water ?? 0;
      for (let slot = 0; ; slot++) {
        const when = new Date(start.getTime() + slot * every * 3_600_000);
        if (when.getHours() >= 21 || when.getDate() !== start.getDate()) break;
        if (done < prefs.waterGoal) add("water", `${day}:${slot}`, when, t("notify.msg.water", { done, goal: prefs.waterGoal }));
      }
    }

    if (on("countdown"))
      for (const item of await db.countdowns.where("userId").equals(userId).toArray()) {
        const days = daysBetween(day, item.targetDate.slice(0, 10));
        if (days === 0) add("countdown", `${day}:${item.id}`, time("countdown"), t("notify.msg.countdownToday", { title: item.title }), { title: item.title });
        else if (days === 1 || days === 7) add("countdown", `${day}:${item.id}`, time("countdown"), t("notify.msg.countdownSoon", { title: item.title, days }), { title: item.title });
      }
    if (on("goalDue"))
      for (const goal of (await db.goals.where("userId").equals(userId).toArray()).filter((g) => g.due && !g.doneAt)) {
        const due = goal.due!.slice(0, 10);
        if (due === day) add("goalDue", `${day}:${goal.id}`, time("goalDue"), t("notify.msg.goalToday", { title: goal.title }), { title: goal.title });
        else if (due === addDays(day, 1)) add("goalDue", `${day}:${goal.id}`, time("goalDue"), t("notify.msg.goalTomorrow", { title: goal.title }), { title: goal.title });
      }

    if (on("ielts")) {
      const rows = await db.vocab.where("userId").equals(userId).toArray();
      const due = stats(new Map(rows.map((row) => [row.wordId, row])), "all").due;
      add("ielts", day, time("ielts"), due ? t("notify.msg.ielts", { count: due }) : t("notify.msg.ieltsNew"));
    }
  }

  // A running focus timer rings when it ends, even with the app closed.
  if (on("focusEnd"))
    for (const session of await db.focusSessions.where("userId").equals(userId).toArray())
      if (session.status === "running" && session.endsAt)
        add("focusEnd", session.id, new Date(session.endsAt), session.kind === "break" ? t("notify.msg.breakDone") : t("notify.msg.focusDone"), { title: t("focus.notify"), urgent: true });

  const now = Date.now();
  return out.filter((item) => item.at.getTime() > now + 15_000 && (item.urgent || !inQuiet(prefs, item.at))).sort((a, b) => a.at.getTime() - b.at.getTime()).slice(0, 60);
}

let running: Promise<void> | null = null;

/** Replaces Android's list of upcoming Bloom reminders with a fresh one. */
export function planAndroidReminders(userId: string, prefs: Prefs, t: T): Promise<void> {
  if (shell !== "android") return Promise.resolve();
  running ??= (async () => {
    try {
      const { LocalNotifications } = await import("@capacitor/local-notifications");
      if ((await LocalNotifications.checkPermissions()).display !== "granted") return;
      const previous = readPlanned();
      const pending = await LocalNotifications.getPending();
      const ours = new Set(Object.keys(previous).map((key) => numericId(`plan:${key}`)));
      const stale = pending.notifications.filter((item) => ours.has(item.id));
      if (stale.length) await LocalNotifications.cancel({ notifications: stale.map((item) => ({ id: item.id })) });

      const list = prefs.notify === false ? [] : await collect(userId, prefs, t);
      if (list.length)
        await LocalNotifications.schedule({
          notifications: list.map((item) => ({
            id: numericId(`plan:${item.key}`),
            title: item.title,
            body: item.body,
            extra: { to: item.to },
            schedule: { at: item.at, allowWhileIdle: true },
            smallIcon: "ic_stat_bloom",
            channelId: "bloom",
          })),
        });
      // Reminders whose time already passed stay listed, so the page knows Android showed them.
      const kept = Object.fromEntries(Object.entries(previous).filter(([, time]) => time <= Date.now() && time > Date.now() - 2 * 86_400_000));
      localStorage.setItem(STORE, JSON.stringify({ ...kept, ...Object.fromEntries(list.map((item) => [item.key, item.at.getTime()])) }));
    } catch (error) {
      console.warn("Bloom Android reminders", error);
    } finally {
      running = null;
    }
  })();
  return running;
}
