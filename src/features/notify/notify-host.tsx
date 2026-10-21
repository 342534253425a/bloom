import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { getItems, markRead, messageOrder, sendMessage, useCouple, useItems, useUnread, type CoupleItem, type MessageData } from "@/entities/couple";
import type { CardData, RatingData, RecordingData } from "@/entities/couple/phrasebook";
import { readBoard } from "@/entities/habit";
import { alreadySent, dismissBanner, kindOn, kindTime, markSent, notify, pushSnapshot, setPushActive, useBanner } from "@/entities/notify";
import { currentLang } from "@/shared/i18n";
import { enableAndroidPush, ensurePush, markServerSent, syncPushPrefs } from "@/shared/lib/push";
import { getPrefs, usePrefs, type Prefs } from "@/entities/prefs";
import { useProgress } from "@/entities/progress";
import { useUser } from "@/entities/session";
import { stats } from "@/entities/vocab";
import { chineseStarter } from "@/shared/data/chinese-starter";
import { db } from "@/shared/db";
import { addDays, dateKey, daysBetween, weekdayOf } from "@/shared/lib/date";
import { Glyph } from "@/shared/ui/glyph";
import { Art } from "@/shared/ui/kit";
import { askAndroidNotifications, dismissAppNotification, onNoteAction, onOpenRequest, shell } from "@/shared/lib/native";
import { planAndroidReminders, plannedNatively } from "./android-plan";

/** How long after its time a scheduled reminder may still fire (the app may open late). */
const WINDOW_MIN = 120;

function minutesOf(clock: string): number {
  const [h, m] = clock.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function nowMinutes() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function inWindow(clock: string, width = WINDOW_MIN) {
  const start = minutesOf(clock);
  const current = nowMinutes();
  return current >= start && current < start + width;
}

type T = (key: string, options?: Record<string, unknown>) => string;

/** Every scheduled reminder, checked while Bloom is open. The push server mirrors the same rules for when it's closed. */
async function runSchedule(userId: string, prefs: Prefs, t: T, path: string, partnerName: string) {
  const today = dateKey();
  const send = (kind: string, period: string, body: string, extra: { to?: string; title?: string; urgent?: boolean } = {}) => {
    if (alreadySent(userId, kind, period)) return;
    markSent(userId, kind, period);
    // The Android app already showed this one by itself.
    if (plannedNatively(kind, period)) return;
    void markServerSent(`${kind}:${period}`);
    notify({ userId, prefs, kind, title: extra.title ?? t(`notify.kind.${kind}`), body, to: extra.to, urgent: extra.urgent, tag: `${kind}-${period}` });
  };
  const due = (kind: string) => kindOn(prefs, kind) && inWindow(kindTime(prefs, kind)) && !alreadySent(userId, kind, today);

  // Day rhythm
  if (due("morning")) {
    const day = await db.days.where("[userId+dateKey]").equals([userId, today]).first();
    if (!day?.mood) send("morning", today, t("notify.msg.morning"));
    else markSent(userId, "morning", today);
  }
  if (due("plan")) {
    const tasks = (await db.tasks.where("userId").equals(userId).toArray()).filter((task) => task.dateKey === today && !task.done);
    send("plan", today, tasks.length ? t("notify.msg.planSome", { count: tasks.length, first: tasks[0].title }) : t("notify.msg.planEmpty"));
  }
  if (due("evening")) send("evening", today, t("notify.msg.evening"));
  if (due("bedtime")) send("bedtime", today, t("notify.msg.bedtime"));
  const lastDay = prefs.weekStart === "sunday" ? 5 : 6;
  if (weekdayOf(today) === lastDay && due("weekly")) send("weekly", today, t("notify.msg.weekly"));

  // Habits
  const needBoard = kindOn(prefs, "habit") || due("missed") || due("streak");
  if (needBoard) {
    const board = await readBoard(userId, today);
    if (!board.vacation) {
      if (kindOn(prefs, "habit"))
        for (const card of board.cards)
          if (card.reminder && card.plannedToday && !card.doneToday && inWindow(card.reminder, 60)) send("habit", `${today}:${card.id}`, t("notify.msg.habit", { name: card.name }), { title: card.name });
      if (due("missed")) {
        const open = board.planned - board.done;
        if (open > 0) send("missed", today, t("notify.msg.missed", { count: open }));
        else markSent(userId, "missed", today);
      }
      if (due("streak")) {
        const risky = board.cards.filter((card) => card.plannedToday && !card.doneToday && card.streak >= 2).sort((a, b) => b.streak - a.streak)[0];
        if (risky) send("streak", today, t("notify.msg.streak", { name: risky.name, days: risky.streak }));
        else markSent(userId, "streak", today);
      }
    }
  }

  // Tasks & focus
  if (kindOn(prefs, "task") || due("tasksLeft")) {
    const tasks = (await db.tasks.where("userId").equals(userId).toArray()).filter((task) => task.dateKey === today && !task.done);
    if (kindOn(prefs, "task"))
      for (const task of tasks) {
        if (!task.clock) continue;
        const start = minutesOf(task.clock) - 10;
        const current = nowMinutes();
        if (current >= start && current < start + 40) send("task", `${today}:${task.id}`, t("notify.msg.task", { title: task.title }), { title: task.title, urgent: true });
      }
    if (due("tasksLeft")) {
      if (tasks.length) send("tasksLeft", today, t("notify.msg.tasksLeft", { count: tasks.length }));
      else markSent(userId, "tasksLeft", today);
    }
  }
  if (kindOn(prefs, "focusEnd") && !path.startsWith("/focus")) {
    const running = (await db.focusSessions.where("userId").equals(userId).toArray()).filter((s) => s.status === "running" && s.endsAt && Date.parse(s.endsAt) <= Date.now());
    for (const session of running) {
      if (Date.now() - Date.parse(session.endsAt!) > 30 * 60_000) continue;
      send("focusEnd", session.id, session.kind === "break" ? t("notify.msg.breakDone") : t("notify.msg.focusDone"), { title: t("focus.notify"), urgent: true });
    }
  }

  // Body
  if (kindOn(prefs, "water")) {
    const start = minutesOf(kindTime(prefs, "water"));
    const every = Math.max(1, prefs.waterEvery || 2) * 60;
    const current = nowMinutes();
    if (current >= start && current < 21 * 60) {
      const slot = Math.floor((current - start) / every);
      const day = await db.days.where("[userId+dateKey]").equals([userId, today]).first();
      const done = day?.water ?? 0;
      if (done < prefs.waterGoal && current - (start + slot * every) < 30) send("water", `${today}:${slot}`, t("notify.msg.water", { done, goal: prefs.waterGoal }));
    }
  }
  if (due("move")) {
    const day = await db.days.where("[userId+dateKey]").equals([userId, today]).first();
    if (!day?.moveMinutes) send("move", today, t("notify.msg.move"));
    else markSent(userId, "move", today);
  }

  // Goals
  if (due("countdown")) {
    const list = await db.countdowns.where("userId").equals(userId).toArray();
    let any = false;
    for (const item of list) {
      const days = daysBetween(today, item.targetDate.slice(0, 10));
      if (days === 0) send("countdown", `${today}:${item.id}`, t("notify.msg.countdownToday", { title: item.title }), { title: item.title });
      else if (days === 1 || days === 7) send("countdown", `${today}:${item.id}`, t("notify.msg.countdownSoon", { title: item.title, days }), { title: item.title });
      any = true;
    }
    if (!any) markSent(userId, "countdown", today);
  }
  if (due("goalDue")) {
    const goals = (await db.goals.where("userId").equals(userId).toArray()).filter((goal) => goal.due && !goal.doneAt);
    for (const goal of goals) {
      const due = goal.due!.slice(0, 10);
      if (due === today) send("goalDue", `${today}:${goal.id}`, t("notify.msg.goalToday", { title: goal.title }), { title: goal.title });
      else if (due === addDays(today, 1)) send("goalDue", `${today}:${goal.id}`, t("notify.msg.goalTomorrow", { title: goal.title }), { title: goal.title });
    }
    markSent(userId, "goalDue", today);
  }

  // Learning
  if (due("ielts")) {
    const rows = await db.vocab.where("userId").equals(userId).toArray();
    const s = stats(new Map(rows.map((row) => [row.wordId, row])), "all");
    send("ielts", today, s.due ? t("notify.msg.ielts", { count: s.due }) : t("notify.msg.ieltsNew"));
  }
  if (due("chinese")) {
    const recs = getItems<RecordingData>("cnrec");
    const rates = new Map(getItems<RatingData>("cnrate").map((item) => [item.id, item.data]));
    const toCheck = recs.filter((rec) => !rec.id.endsWith(`:${userId}`) && rates.get(`cnrate:${rec.data.card}:${rec.id.split(":").at(-1)}`)?.recAt !== rec.data.at).length;
    const redo = recs.filter((rec) => rec.id.endsWith(`:${userId}`)).filter((rec) => {
      const rating = rates.get(`cnrate:${rec.data.card}:${userId}`);
      return rating && rating.recAt === rec.data.at && rating.verdict !== "good";
    }).length;
    if (toCheck) send("chinese", today, t("notify.msg.chineseCheck", { count: toCheck, name: partnerName }));
    else if (redo) send("chinese", today, t("notify.msg.chineseRedo", { count: redo }));
    else markSent(userId, "chinese", today);
  }
}

function hanziOf(cardId: string): string {
  if (cardId.startsWith("s:")) {
    const [, deck, index] = cardId.split(":");
    return chineseStarter[deck]?.cards[Number(index)]?.[0] ?? "…";
  }
  return getItems<CardData>("cn").find((item) => item.id === cardId)?.data.hanzi ?? "…";
}

/** How a chat message reads in a notification. */
export function messagePreview(data: Partial<MessageData>, t: T): string {
  if (data.call) return data.call.status === "ended" ? `📞 ${t(data.call.video ? "call.log.incomingVideo" : "call.log.incoming")}` : `📞 ${t("call.log.missed")}`;
  if (data.sticker) return t("notify.preview.sticker");
  if (data.voice) return t("notify.preview.voice");
  if (data.photo) return data.text ? `📷 ${data.text}` : t("notify.preview.photo");
  return String(data.text ?? "").slice(0, 160);
}

/** The partner's messages this person hasn't read yet (newest last), for a grouped notification. */
function unreadChat(userId: string, partnerId: string, t: T): { lines: string[]; count: number } {
  const seen = getItems<{ seen?: string }>("read").find((item) => item.id === `read:${userId}`)?.data.seen ?? "";
  const unread = getItems<MessageData>("msg")
    .filter((message) => message.author === partnerId && message.created_at > seen)
    .sort(messageOrder);
  return { lines: unread.slice(-4).map((message) => messagePreview(message.data, t)), count: Math.max(1, unread.length) };
}

/** Turns what the partner does into notifications while Bloom is open. */
function usePartnerEvents(userId: string, prefs: Prefs | undefined, t: T, path: string) {
  const couple = useCouple();
  const name = couple.partner?.name || "♥";
  const partnerId = couple.partner?.id ?? "";
  const kinds = ["msg", "effect", "focus", "garden", "answer", "pcheck", "phabit", "duel", "duelscore", "cnrec", "cnrate", "cn", "day"];
  const all = kinds.map((kind) => useItems(kind)); // eslint-disable-line react-hooks/rules-of-hooks
  const seen = useRef<Map<string, string> | null>(null);
  const wasOnline = useRef<boolean | null>(null);
  const wasActivity = useRef<string | null>(null);

  useEffect(() => {
    if (!prefs || !partnerId) return;
    const flat = all.flat() as CoupleItem[];
    if (!seen.current) {
      seen.current = new Map(flat.map((item) => [item.id, item.updated_at]));
      return;
    }
    const fresh = flat.filter((item) => seen.current!.get(item.id) !== item.updated_at);
    const isNew = (item: CoupleItem) => !seen.current!.has(item.id);
    for (const item of fresh) {
      const d = item.data as Record<string, unknown>;
      const say = (kind: string, body: string, extra: { silentInApp?: boolean; to?: string; chat?: { lines: string[]; count: number } } = {}) => notify({ userId, prefs, kind, title: name, body, tag: `${kind}-${item.id}`, ...extra });
      switch (item.kind) {
        case "msg":
          // A finished call needs no notification; a missed one does.
          if (isNew(item) && item.author === partnerId && (d.call as MessageData["call"])?.status !== "ended") {
            const chat = unreadChat(userId, partnerId, t);
            const text = chat.lines.at(-1) ?? "";
            say("message", text, { silentInApp: path.startsWith("/together/chat") || path.startsWith("/watch"), chat });
          }
          break;
        case "effect":
          if (isNew(item) && d.to === userId) say("love", t("notify.msg.love", { name }), { silentInApp: true });
          break;
        case "focus":
          if (d.phase === "focus" && d.by === partnerId && !d.pausedLeft && d.startedAt && Date.now() - Date.parse(String(d.startedAt)) < 60_000)
            say("sharedFocus", t("notify.msg.sharedFocus", { name, minutes: d.minutes }), { silentInApp: path.startsWith("/focus") });
          break;
        case "garden":
          if (d.lastBy === partnerId) say("garden", t("notify.msg.garden", { name }));
          break;
        case "answer":
          if (isNew(item) && item.id.endsWith(`:${partnerId}`)) say("question", t("notify.msg.question", { name }));
          break;
        case "pcheck":
          if (isNew(item) && item.author === partnerId) {
            const habit = getItems<{ title: string }>("phabit").find((h) => h.id === d.habit);
            say("pairHabit", t("notify.msg.pairHabit", { name, title: habit?.data.title ?? "" }));
          }
          break;
        case "phabit":
          if (isNew(item) && item.author === partnerId) say("pairHabit", t("notify.msg.pairHabitNew", { name, title: d.title }));
          break;
        case "duel":
          if (isNew(item) && d.by === partnerId) say("duel", t("notify.msg.duel", { name }));
          break;
        case "duelscore":
          if (item.author === partnerId) {
            const mine = getItems<{ score: number }>("duelscore").find((s) => s.id === `duelscore:${String(d.duel).replace("duel:", "")}:${userId}`);
            if (mine) say("duel", t("notify.msg.duelResult", { name, mine: mine.data.score, theirs: d.score }));
          }
          break;
        case "cnrec":
          if (item.id.endsWith(`:${partnerId}`)) say("phrase", t("notify.msg.phraseNew", { name, hanzi: hanziOf(String(d.card)) }));
          break;
        case "cnrate":
          if (item.id.endsWith(`:${userId}`)) {
            const verdict = t(`learn.cn.${String(d.verdict)}`);
            say("phrase", t("notify.msg.phraseRated", { name, hanzi: hanziOf(String(d.card)), verdict }) + (d.note ? ` · ${d.note}` : ""));
          }
          break;
        case "cn":
          if (isNew(item) && item.author === partnerId) say("phrase", t("notify.msg.phraseAdded", { name, hanzi: d.hanzi }));
          break;
        case "day":
          if (item.author === partnerId && Number(d.planned) > 0 && d.done === d.planned && !alreadySent(userId, "partnerDay", dateKey())) {
            markSent(userId, "partnerDay", dateKey());
            say("partnerDay", t("notify.msg.partnerDay", { name }));
          }
          break;
      }
      seen.current.set(item.id, item.updated_at);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...all, prefs, partnerId]);

  // Presence: partner came online, opened the cinema.
  useEffect(() => {
    if (!prefs || !partnerId) return;
    const online = couple.presence.online;
    const activity = couple.presence.activity ?? null;
    if (wasOnline.current === false && online && !alreadySent(userId, "online", `${dateKey()}:${new Date().getHours()}`)) {
      markSent(userId, "online", `${dateKey()}:${new Date().getHours()}`);
      notify({ userId, prefs, kind: "online", title: name, body: t("notify.msg.online", { name }) });
    }
    if (wasActivity.current !== null && wasActivity.current !== "watch" && activity === "watch" && !path.startsWith("/watch"))
      notify({ userId, prefs, kind: "watch", title: name, body: t("notify.msg.watch", { name }) });
    wasOnline.current = online;
    wasActivity.current = activity;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [couple.presence.online, couple.presence.activity, prefs, partnerId]);
}

/** Runs every notification source while Bloom is open and shows the in-app banner. */
export function NotifyHost() {
  const { t } = useTranslation();
  const user = useUser();
  const prefs = usePrefs(user.id);
  const couple = useCouple();
  const path = useRouterState({ select: (state) => state.location.pathname });
  const navigate = useNavigate();
  const banner = useBanner();
  const progress = useProgress(user.id);
  const pathRef = useRef(path);
  pathRef.current = path;
  const partnerName = couple.partner?.name || "♥";

  usePartnerEvents(user.id, prefs, t, path);

  // Background delivery: know whether this device gets pushes and keep the server's settings current.
  // If notifications are already allowed, (re)subscribe this device without asking again.
  const subscribed = useRef(false);
  useEffect(() => {
    if (!prefs || subscribed.current) return;
    subscribed.current = true;
    void ensurePush(pushSnapshot(prefs, currentLang())).then(setPushActive);
  }, [prefs]);
  useEffect(() => {
    if (!prefs) return;
    const timer = window.setTimeout(() => void syncPushPrefs(pushSnapshot(prefs, currentLang())), 1500);
    return () => window.clearTimeout(timer);
  }, [prefs]);

  // A tapped notification in the Windows or Android app opens the right screen.
  useEffect(() => onOpenRequest((to) => void navigate({ to: to as "/" })), [navigate]);

  // Windows notification cards: reply and "mark as read" without opening Bloom.
  useEffect(
    () =>
      onNoteAction((action, payload) => {
        if (action === "reply" && typeof payload === "string") void sendMessage(payload);
        if (action === "reply" || action === "read") {
          const newest = getItems<MessageData>("msg").sort(messageOrder).at(-1);
          if (newest) void markRead(newest.created_at);
        }
      }),
    [],
  );

  // Once the chat is read (here or on another device) its notification goes away.
  const unread = useUnread();
  useEffect(() => {
    if (unread === 0) dismissAppNotification("chat");
  }, [unread]);

  // Android: allow notifications once, then hand upcoming reminders to the system.
  const asked = useRef(false);
  useEffect(() => {
    if (shell !== "android" || !prefs) return;
    const plan = () => void getPrefs(user.id).then((current) => planAndroidReminders(user.id, current, t));
    if (!asked.current) {
      asked.current = true;
      void askAndroidNotifications()
        .then(plan)
        .then(() => enableAndroidPush(pushSnapshot(prefs, currentLang())))
        .then(setPushActive);
    }
    const timer = window.setTimeout(plan, 1500);
    const every = window.setInterval(plan, 15 * 60_000);
    const onHide = () => document.visibilityState === "hidden" && plan();
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(every);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [prefs, user.id, t]);

  // A tap on a system notification opens the right screen.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === "bloom-open" && typeof event.data.url === "string") void navigate({ to: event.data.url as "/" });
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [navigate]);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      const current = await getPrefs(user.id);
      if (alive) await runSchedule(user.id, current, t, pathRef.current, partnerName).catch((error) => console.warn("Bloom reminders", error));
    };
    void tick();
    const timer = window.setInterval(() => void tick(), 30_000);
    const onVisible = () => document.visibilityState === "visible" && void tick();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [user.id, t, partnerName]);

  // Garden level ups.
  const level = progress?.level.level;
  useEffect(() => {
    if (!level || !prefs) return;
    const key = `bloom.level.${user.id}`;
    const last = Number(localStorage.getItem(key) ?? 0);
    if (last && level > last) notify({ userId: user.id, prefs, kind: "level", title: t("notify.kind.level"), body: t("notify.msg.level", { level }) });
    localStorage.setItem(key, String(level));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level]);

  // Banners close themselves after a while.
  useEffect(() => {
    if (!banner) return;
    const timer = window.setTimeout(dismissBanner, 9000);
    return () => window.clearTimeout(timer);
  }, [banner]);

  if (!banner) return null;
  return (
    <div className="nudge rise" role="status" key={banner.id}>
      {banner.kind?.icon ? <span className="nudge-icon">{banner.kind.icon}</span> : <Art name="c-peek-right" className="nudge-art" eager />}
      <p>
        <strong>{banner.title}</strong>
        <br />
        {banner.body}
      </p>
      <div className="nudge-actions">
        <button
          type="button"
          className="btn is-sm"
          onClick={() => {
            dismissBanner();
            void navigate({ to: banner.to as "/" });
          }}
        >
          {t("notify.open")}
        </button>
        <button type="button" className="nudge-close" aria-label={t("common.close")} onClick={dismissBanner}>
          <Glyph name="close" size={16} stroke={2.4} />
        </button>
      </div>
    </div>
  );
}
