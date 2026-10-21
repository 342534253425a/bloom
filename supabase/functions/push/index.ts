// Bloom push server (Supabase Edge Function "push", verify JWT: off).
//  - {type:"vapid"}  → public VAPID key for the app (made on first call).
//  - {type:"item"}   → partner events from the couple_items trigger (needs x-bloom-hook).
//  - {type:"tick"}   → scheduled reminders every 5 minutes from pg_cron (needs x-bloom-hook).
// Browsers and iPhones get Web Push; the Android app gets Firebase (endpoint "fcm:<token>",
// secret FCM_SERVICE_ACCOUNT = the Firebase service-account JSON).
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import webpush from "npm:web-push@3.6.7";

/** The service key: legacy env name first, then the newer `SUPABASE_SECRET_KEYS` JSON map. */
function serviceKey(): string {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}") as Record<string, string>;
    return keys.default ?? Object.values(keys)[0] ?? "";
  } catch {
    return "";
  }
}

const db = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey(), { auth: { persistSession: false } });
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };

type Config = { hook_secret: string; vapid_public: string | null; vapid_private: string | null };
type Snapshot = {
  lang?: string;
  on?: Record<string, boolean>;
  times?: Record<string, string>;
  quiet?: { on: boolean; from: string; to: string };
  waterEvery?: number;
  waterGoal?: number;
  weekStart?: "monday" | "sunday";
};
type Sub = { endpoint: string; user_id: string; sub: webpush.PushSubscription; tz: string; lang: string; prefs: Snapshot; updated_at?: string };
type Msg = { title: string; body: string; url: string; tag: string; count?: number };

let config: Config | null = null;
async function getConfig(): Promise<Config> {
  if (config?.vapid_public) return config;
  const { data, error } = await db.rpc("push_get_config");
  if (error) throw error;
  let row = (Array.isArray(data) ? data[0] : data) as Config;
  if (!row.vapid_public) {
    const keys = webpush.generateVAPIDKeys();
    await db.rpc("push_set_vapid", { pub: keys.publicKey, priv: keys.privateKey });
    const again = await db.rpc("push_get_config");
    row = (Array.isArray(again.data) ? again.data[0] : again.data) as Config;
  }
  config = row;
  webpush.setVapidDetails("mailto:bloom@bloom-app.app", row.vapid_public!, row.vapid_private!);
  return row;
}

/* ------------------------------------------------------------------ copy */

type L = [string, string, string];
const copy: Record<string, L> = {
  morning: ["Good morning! How are you feeling? 🌤", "Доброе утро! Как ты себя чувствуешь? 🌤", "早上好！今天感觉怎么样？🌤"],
  planEmpty: ["Nothing planned yet. Pick 1–3 things for today?", "Пока ничего не запланировано. Выберешь 1–3 дела на сегодня?", "还没有计划，选 1–3 件今天要做的事？"],
  planSome: ["{count} tasks today. First up: {first}", "Сегодня задач: {count}. Первая: {first}", "今天有 {count} 个任务，第一个：{first}"],
  evening: ["Time to slow down. Two minutes for today's review? 🌙", "Пора замедлиться. Две минуты на итог дня? 🌙", "该放慢脚步了，花两分钟复盘今天？🌙"],
  bedtime: ["Screens down, lights low. Sleep well 😴", "Откладываем телефон и приглушаем свет. Сладких снов 😴", "放下手机，调暗灯光，好梦 😴"],
  weekly: ["The week is ending. Look back and plan the next one?", "Неделя заканчивается. Подведём итог и спланируем следующую?", "这周快结束了，回顾一下并计划下周？"],
  habit: ["Time for “{name}” 🌱", "Время для «{name}» 🌱", "该做“{name}”了 🌱"],
  missed: ["{count} habits are still waiting. Even the minimum counts 💚", "Ещё ждут привычек: {count}. Даже минимум считается 💚", "还有 {count} 个习惯在等你，最小版本也算数 💚"],
  task: ["In 10 minutes: {title}", "Через 10 минут: {title}", "10 分钟后：{title}"],
  tasksLeft: ["{count} tasks left today. One more?", "Осталось задач: {count}. Ещё одну?", "今天还剩 {count} 个任务，再完成一个？"],
  focusDone: ["Focus finished. Time for a short break ☕", "Фокус завершён. Время для короткого перерыва ☕", "专注结束，休息一下 ☕"],
  breakDone: ["Break's over. Ready for another round?", "Перерыв закончился. Ещё раунд?", "休息结束，再来一轮？"],
  water: ["Glass of water? {done} of {goal} so far 💧", "Стакан воды? Пока {done} из {goal} 💧", "喝杯水吧？已喝 {done}/{goal} 💧"],
  move: ["A 5-minute walk or stretch? 🚶", "Пройтись или потянуться 5 минут? 🚶", "走走或拉伸 5 分钟？🚶"],
  countdownToday: ["Today: {title} 🎉", "Сегодня: {title} 🎉", "就是今天：{title} 🎉"],
  countdownSoon: ["{title} in {days} days", "{title} через {days} дн.", "距离 {title} 还有 {days} 天"],
  goalToday: ["Goal due today: {title}", "Срок цели сегодня: {title}", "目标今天到期：{title}"],
  goalTomorrow: ["Goal due tomorrow: {title}", "Срок цели завтра: {title}", "目标明天到期：{title}"],
  ielts: ["{count} IELTS words are ready for review 📚", "Слов IELTS на повторение: {count} 📚", "有 {count} 个雅思单词待复习 📚"],
  ieltsNew: ["5 minutes of IELTS words today? 📚", "5 минут слов IELTS сегодня? 📚", "今天花 5 分钟背雅思单词？📚"],
  love: ["{name} sent you a surprise 💗", "{name} отправил(а) тебе сюрприз 💗", "{name} 给你发了惊喜 💗"],
  sharedFocus: ["{name} started a shared focus: {minutes} min", "{name} запустил(а) общий фокус: {minutes} мин", "{name} 开始了 {minutes} 分钟的一起专注"],
  garden: ["{name} watered your garden. Your turn now 🪴", "{name} полил(а) ваш сад. Теперь твоя очередь 🪴", "{name} 浇了花园，轮到你了 🪴"],
  question: ["{name} answered today's question. Your turn ❓", "{name} ответил(а) на вопрос дня. Твоя очередь ❓", "{name} 回答了今日一问，轮到你了 ❓"],
  pairHabit: ["{name} ticked a pair habit 🤝", "{name} отметил(а) парную привычку 🤝", "{name} 打卡了双人习惯 🤝"],
  pairHabitNew: ["{name} added a pair habit: {title}", "{name} добавил(а) парную привычку: {title}", "{name} 添加了双人习惯：{title}"],
  duel: ["{name} challenged you to a word duel ⚔️", "{name} вызывает тебя на дуэль слов ⚔️", "{name} 向你发起单词对决 ⚔️"],
  duelDone: ["{name} finished your duel: {score} points", "{name} прошёл(ла) дуэль: {score} очков", "{name} 完成了对决：{score} 分"],
  phraseNew: ["{name} recorded a new phrase. How did it sound?", "{name} записал(а) новую фразу. Как звучит?", "{name} 录了新短语，听起来怎么样？"],
  phraseRated: ["{name} rated your pronunciation: {verdict}", "{name} оценил(а) твоё произношение: {verdict}", "{name} 评价了你的发音：{verdict}"],
  phraseAdded: ["{name} added a phrase: {hanzi}", "{name} добавил(а) фразу: {hanzi}", "{name} 添加了短语：{hanzi}"],
  partnerDay: ["{name} finished all habits today 🌼", "{name} выполнил(а) все привычки сегодня 🌼", "{name} 今天完成了所有习惯 🌼"],
  good: ["right ✅", "правильно ✅", "正确 ✅"],
  almost: ["almost 🟡", "почти 🟡", "差一点 🟡"],
  wrong: ["not yet ❌", "пока нет ❌", "还不对 ❌"],
  // Titles
  t_morning: ["Morning check-in", "Утренний чек-ин", "早间打卡"],
  t_plan: ["Plan the day", "План на день", "规划今天"],
  t_evening: ["Evening review", "Вечерний итог", "晚间复盘"],
  t_bedtime: ["Bedtime", "Пора спать", "睡觉时间"],
  t_weekly: ["Weekly review", "Итог недели", "每周复盘"],
  t_missed: ["Habits", "Привычки", "习惯"],
  t_tasksLeft: ["Tasks", "Задачи", "任务"],
  t_focusEnd: ["Focus", "Фокус", "专注"],
  t_water: ["Water", "Вода", "喝水"],
  t_move: ["Move a little", "Подвигаться", "活动一下"],
  t_ielts: ["IELTS", "IELTS", "雅思"],
  voice: ["🎤 Voice message", "🎤 Голосовое сообщение", "🎤 语音消息"],
  photo: ["📷 Photo", "📷 Фото", "📷 照片"],
  sticker: ["🌸 Sticker", "🌸 Стикер", "🌸 贴纸"],
  callAudio: ["📞 Voice call — tap to answer", "📞 Аудиозвонок — нажмите, чтобы ответить", "📞 语音来电，点按接听"],
  callVideo: ["📹 Video call — tap to answer", "📹 Видеозвонок — нажмите, чтобы ответить", "📹 视频来电，点按接听"],
  missedCall: ["📞 Missed call", "📞 Пропущенный звонок", "📞 未接来电"],
  newMessages: ["{count} new messages", "Новых сообщений: {count}", "{count} 条新消息"],
  test: ["Push works! This is how Bloom reaches you when it's closed 🌱", "Пуш работает! Так Bloom будет писать, когда он закрыт 🌱", "推送正常！Bloom 关闭时就这样提醒你 🌱"],
};

function say(lang: string, key: string, vars: Record<string, unknown> = {}) {
  const index = lang === "ru" ? 1 : lang === "zh" ? 2 : 0;
  return (copy[key]?.[index] ?? key).replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ""));
}

/* ------------------------------------------------------------------ Firebase (Android app) */

type ServiceAccount = { project_id: string; client_email: string; private_key: string };
let fcmAuth: { token: string; until: number } | null = null;

function account(): ServiceAccount | null {
  try {
    const raw = Deno.env.get("FCM_SERVICE_ACCOUNT");
    return raw ? (JSON.parse(raw) as ServiceAccount) : null;
  } catch {
    return null;
  }
}

const b64url = (bytes: Uint8Array | string) =>
  btoa(typeof bytes === "string" ? bytes : String.fromCharCode(...bytes)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

/** A short-lived Google access token for the Firebase send API, signed with the service account. */
async function fcmAccessToken(sa: ServiceAccount): Promise<string> {
  if (fcmAuth && fcmAuth.until > Date.now() + 60_000) return fcmAuth.token;
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/firebase.messaging", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
  const pem = sa.private_key.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${head}.${claims}`)));
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${head}.${claims}.${b64url(signature)}` }),
  });
  const json = await res.json();
  if (!json.access_token) throw new Error(`google auth: ${JSON.stringify(json).slice(0, 200)}`);
  fcmAuth = { token: json.access_token, until: Date.now() + (json.expires_in ?? 3600) * 1000 };
  return fcmAuth.token;
}

/** Sends one notification to an Android phone. Returns the HTTP status and Firebase's error, if any. */
async function sendFcm(token: string, msg: Msg): Promise<{ status: number; error: string | null }> {
  const sa = account();
  if (!sa) return { status: 0, error: "FCM_SERVICE_ACCOUNT is not set" };
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
    method: "POST",
    headers: { authorization: `Bearer ${await fcmAccessToken(sa)}`, "content-type": "application/json" },
    body: JSON.stringify({
      message: {
        token,
        notification: { title: msg.title, body: msg.body },
        data: { url: msg.url, tag: msg.tag },
        android: {
          priority: "high",
          ttl: "21600s",
          notification: {
            channel_id: "bloom",
            icon: "ic_stat_bloom",
            color: "#36c89c",
            tag: msg.tag,
            default_sound: true,
            default_vibrate_timings: true,
            ...(msg.count && msg.count > 1 ? { notification_count: msg.count } : {}),
          },
        },
      },
    }),
  });
  return { status: res.status, error: res.ok ? null : (await res.text()).slice(0, 300) };
}

/* ------------------------------------------------------------------ sending */

async function claim(userId: string, key: string): Promise<boolean> {
  const { data, error } = await db.from("push_sent").upsert({ user_id: userId, key }, { onConflict: "user_id,key", ignoreDuplicates: true }).select("key");
  return !error && Array.isArray(data) && data.length > 0;
}

async function deliver(subs: Sub[], msg: Msg) {
  await getConfig();
  await Promise.all(
    subs.map(async (s) => {
      if (s.endpoint.startsWith("fcm:")) {
        const { status, error } = await sendFcm(s.endpoint.slice(4), msg).catch((e) => ({ status: 0, error: String((e as Error).message ?? e) }));
        await db.from("push_log").insert({ user_id: s.user_id, host: "fcm", tag: msg.tag, status, error });
        // The app was removed or its token replaced.
        if (status === 404 || (status === 400 && /UNREGISTERED|registration-token-not-registered/.test(error ?? ""))) await db.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
        return;
      }
      const host = s.endpoint.split("/")[2] ?? "?";
      try {
        // "high" makes phones wake up for it even in battery-saving mode.
        const res = await webpush.sendNotification(s.sub, JSON.stringify(msg), { TTL: 6 * 3600, urgency: "high" });
        await db.from("push_log").insert({ user_id: s.user_id, host, tag: msg.tag, status: res.statusCode, error: null });
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode ?? null;
        const text = String((error as { body?: string }).body ?? (error as Error).message ?? error).slice(0, 300);
        await db.from("push_log").insert({ user_id: s.user_id, host, tag: msg.tag, status, error: text });
        if (status === 404 || status === 410) await db.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
        else console.warn("push failed", status, text);
      }
    }),
  );
}

async function subsOf(userId: string): Promise<Sub[]> {
  const { data } = await db.from("push_subscriptions").select("*").eq("user_id", userId);
  return (data ?? []) as Sub[];
}

/* ------------------------------------------------------------------ time helpers */

function local(tz: string, date = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23", weekday: "short" })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  const today = `${parts.year}-${parts.month}-${parts.day}`;
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  const weekday = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(parts.weekday as string); // 0 = Monday
  return { today, minutes, weekday };
}

const mins = (clock: string) => {
  const [h, m] = clock.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

function addDays(key: string, n: number) {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
}

function quiet(p: Snapshot, minutes: number) {
  if (!p.quiet?.on) return false;
  const from = mins(p.quiet.from);
  const to = mins(p.quiet.to);
  return from <= to ? minutes >= from && minutes < to : minutes >= from || minutes < to;
}

/* ------------------------------------------------------------------ scheduled reminders */

async function rows<T = Record<string, unknown>>(userId: string, tbl: string, filter?: (q: ReturnType<typeof db.from>) => unknown): Promise<T[]> {
  let q = db.from("records").select("id, data").eq("user_id", userId).eq("tbl", tbl).eq("deleted", false);
  if (filter) q = filter(q as never) as typeof q;
  const { data } = await q;
  return (data ?? []).map((r: { id: string; data: T }) => ({ ...(r.data as object), id: r.id }) as T);
}

async function tickUser(userId: string, subs: Sub[]) {
  // All devices of one person carry the same settings; the most recently updated one wins.
  const s0 = [...subs].sort((a, b) => String(b.updated_at ?? "").localeCompare(String(a.updated_at ?? "")))[0];
  const p = s0.prefs ?? {};
  const lang = p.lang ?? s0.lang ?? "en";
  const { today, minutes, weekday } = local(s0.tz || "UTC");
  const on = (k: string) => p.on?.[k] !== false && p.on?.[k] !== undefined;
  const at = (k: string) => p.times?.[k] ?? "09:00";
  const window = (clock: string, width = 15) => minutes >= mins(clock) && minutes < mins(clock) + width;
  const due = (k: string) => on(k) && window(at(k));
  const isQuiet = quiet(p, minutes);
  const send = async (kind: string, period: string, body: string, url: string, title?: string, urgent = false) => {
    if (isQuiet && !urgent) return;
    if (!(await claim(userId, `${kind}:${period}`))) return;
    await deliver(subs, { title: title ?? say(lang, `t_${kind}`), body, url, tag: `${kind}-${period}` });
  };

  if (due("morning")) {
    const day = (await rows<{ mood?: string }>(userId, "days", (q) => q.eq("data->>dateKey", today)))[0];
    if (!day?.mood) await send("morning", today, say(lang, "morning"), "/body");
  }
  if (due("plan") || due("tasksLeft") || on("task")) {
    const tasks = (await rows<{ title: string; done: boolean; clock: string | null; id: string }>(userId, "tasks", (q) => q.eq("data->>dateKey", today))).filter((t) => !t.done);
    if (due("plan")) await send("plan", today, tasks.length ? say(lang, "planSome", { count: tasks.length, first: tasks[0].title }) : say(lang, "planEmpty"), "/tasks");
    if (due("tasksLeft") && tasks.length) await send("tasksLeft", today, say(lang, "tasksLeft", { count: tasks.length }), "/tasks");
    if (on("task"))
      for (const task of tasks)
        if (task.clock && minutes >= mins(task.clock) - 10 && minutes < mins(task.clock) + 5) await send("task", `${today}:${task.id}`, say(lang, "task", { title: task.title }), "/tasks", task.title, true);
  }
  if (due("evening")) await send("evening", today, say(lang, "evening"), "/reflect");
  if (due("bedtime")) await send("bedtime", today, say(lang, "bedtime"), "/body");
  if (due("weekly") && weekday === (p.weekStart === "sunday" ? 5 : 6)) await send("weekly", today, say(lang, "weekly"), "/reflect");

  // Habits: planned today = not deleted, not on vacation, and today's weekday in `days` (or no days set).
  if (on("habit") || due("missed")) {
    const habits = (await rows<{ id: string; name: string; deletedAt: string | null; days?: number[] | null; reminder?: string | null; vacation?: boolean; targetCount?: number }>(userId, "habits")).filter(
      (h) => !h.deletedAt && !h.vacation && (!h.days?.length || h.days.includes(weekday)),
    );
    const logs = await rows<{ habitId: string; count: number }>(userId, "habitLogs", (q) => q.eq("data->>dateKey", today));
    const done = (h: { id: string; targetCount?: number }) => logs.filter((l) => l.habitId === h.id).reduce((n, l) => n + (l.count || 1), 0) >= Math.max(1, h.targetCount ?? 1);
    if (on("habit")) for (const h of habits) if (h.reminder && window(h.reminder) && !done(h)) await send("habit", `${today}:${h.id}`, say(lang, "habit", { name: h.name }), "/habits", h.name);
    if (due("missed")) {
      const open = habits.filter((h) => !done(h)).length;
      if (open) await send("missed", today, say(lang, "missed", { count: open }), "/habits");
    }
  }

  if (on("focusEnd")) {
    const running = (await rows<{ id: string; status: string; endsAt: string | null; kind?: string }>(userId, "focusSessions", (q) => q.eq("data->>status", "running"))).filter(
      (f) => f.endsAt && Date.parse(f.endsAt) <= Date.now() && Date.now() - Date.parse(f.endsAt) < 30 * 60_000,
    );
    for (const f of running) await send("focusEnd", f.id, say(lang, f.kind === "break" ? "breakDone" : "focusDone"), "/focus", undefined, true);
  }

  if (on("water") && minutes >= mins(at("water")) && minutes < 21 * 60) {
    const every = Math.max(1, p.waterEvery ?? 2) * 60;
    const slot = Math.floor((minutes - mins(at("water"))) / every);
    if (minutes - (mins(at("water")) + slot * every) < 15) {
      const day = (await rows<{ water?: number }>(userId, "days", (q) => q.eq("data->>dateKey", today)))[0];
      const goal = p.waterGoal ?? 8;
      if ((day?.water ?? 0) < goal) await send("water", `${today}:${slot}`, say(lang, "water", { done: day?.water ?? 0, goal }), "/body");
    }
  }
  if (due("move")) {
    const day = (await rows<{ moveMinutes?: number }>(userId, "days", (q) => q.eq("data->>dateKey", today)))[0];
    if (!day?.moveMinutes) await send("move", today, say(lang, "move"), "/body");
  }
  if (due("countdown")) {
    for (const c of await rows<{ id: string; title: string; targetDate: string }>(userId, "countdowns")) {
      const days = daysBetween(today, c.targetDate.slice(0, 10));
      if (days === 0) await send("countdown", `${today}:${c.id}`, say(lang, "countdownToday", { title: c.title }), "/goals", c.title);
      else if (days === 1 || days === 7) await send("countdown", `${today}:${c.id}`, say(lang, "countdownSoon", { title: c.title, days }), "/goals", c.title);
    }
  }
  if (due("goalDue")) {
    for (const g of (await rows<{ id: string; title: string; due: string | null; doneAt: string | null }>(userId, "goals")).filter((g) => g.due && !g.doneAt)) {
      const d = g.due!.slice(0, 10);
      if (d === today) await send("goalDue", `${today}:${g.id}`, say(lang, "goalToday", { title: g.title }), "/goals", g.title);
      else if (d === addDays(today, 1)) await send("goalDue", `${today}:${g.id}`, say(lang, "goalTomorrow", { title: g.title }), "/goals", g.title);
    }
  }
  if (due("ielts")) {
    const vocab = await rows<{ due: string }>(userId, "vocab");
    const count = vocab.filter((v) => Date.parse(v.due) <= Date.now()).length;
    await send("ielts", today, count ? say(lang, "ielts", { count }) : say(lang, "ieltsNew"), "/learn");
  }
}

async function tick() {
  const { data } = await db.from("push_subscriptions").select("*");
  const byUser = new Map<string, Sub[]>();
  for (const s of (data ?? []) as Sub[]) byUser.set(s.user_id, [...(byUser.get(s.user_id) ?? []), s]);
  for (const [userId, all] of byUser) {
    // The Android app schedules its own reminders on the phone; only browsers and iPhones need them from here.
    const subs = all.filter((s) => !s.endpoint.startsWith("fcm:"));
    if (subs.length) await tickUser(userId, subs).catch((e) => console.warn("tick", userId, e));
  }
}

/* ------------------------------------------------------------------ partner events */

type Item = { couple_key: string; id: string; kind: string; author: string; data: Record<string, unknown>; created_at: string };

async function itemEvent(op: string, record: Item, old: Item | null, actor: string | null) {
  if (!actor) return;
  const { data: people } = await db.from("profiles").select("id, name").eq("couple_key", record.couple_key);
  const me = (people ?? []).find((p: { id: string }) => p.id === actor);
  const partner = (people ?? []).find((p: { id: string }) => p.id !== actor);
  if (!partner) return;
  const name = me?.name || "♥";
  const subs = await subsOf(partner.id);
  if (!subs.length) return;
  const p = subs[0].prefs ?? {};
  const lang = p.lang ?? subs[0].lang ?? "en";
  const on = (k: string) => p.on?.[k] !== false && p.on?.[k] !== undefined;
  const isNew = op === "INSERT";
  const d = record.data ?? {};
  const o = old?.data ?? {};
  let kind = "";
  let body = "";
  let count = 1;
  switch (record.kind) {
    case "msg": {
      if (!isNew) return;
      // A finished call written into the chat needs no push; a missed one does.
      const call = d.call as { status?: string } | undefined;
      if (call?.status === "ended") return;
      kind = "message";
      // Like messengers: one card per chat with the unread messages and how many there are.
      const preview = (m: Record<string, unknown>) =>
        m.call ? say(lang, "missedCall") : m.sticker ? say(lang, "sticker") : m.voice ? say(lang, "voice") : m.photo ? (m.text ? `📷 ${m.text}` : say(lang, "photo")) : String(m.text ?? "").slice(0, 160);
      const { data: read } = await db.from("couple_items").select("data").eq("couple_key", record.couple_key).eq("id", `read:${partner.id}`).maybeSingle();
      const seen = String((read?.data as { seen?: string } | null)?.seen ?? "");
      let query = db.from("couple_items").select("data, created_at").eq("couple_key", record.couple_key).eq("kind", "msg").eq("author", actor).order("created_at", { ascending: false }).limit(50);
      if (seen) query = query.gt("created_at", seen);
      const { data: unread } = await query;
      const list = ((unread ?? []) as Array<{ data: Record<string, unknown> }>).map((row) => row.data);
      count = Math.max(1, list.length);
      body = (list.length ? list.slice(0, 4).reverse() : [d]).map(preview).join("\n");
      break;
    }
    case "call":
      // "… is calling": wakes the partner's phone or computer when Bloom is closed.
      if (!isNew || d.state !== "ringing") return;
      kind = "call";
      body = say(lang, d.video ? "callVideo" : "callAudio");
      break;
    case "effect":
      if (!isNew || d.to !== partner.id) return;
      kind = "love";
      body = String(d.text ?? "") || say(lang, "love", { name });
      break;
    case "focus":
      if (d.phase !== "focus" || d.startedAt === o.startedAt || d.pausedLeft) return;
      kind = "sharedFocus";
      body = say(lang, "sharedFocus", { name, minutes: d.minutes });
      break;
    case "garden":
      if (d.lastAt === o.lastAt || d.lastBy !== actor) return;
      kind = "garden";
      body = say(lang, "garden", { name });
      break;
    case "answer":
      if (!isNew) return;
      kind = "question";
      body = say(lang, "question", { name });
      break;
    case "pcheck":
      if (!isNew) return;
      kind = "pairHabit";
      body = say(lang, "pairHabit", { name });
      break;
    case "phabit":
      if (!isNew) return;
      kind = "pairHabit";
      body = say(lang, "pairHabitNew", { name, title: d.title });
      break;
    case "duel":
      if (!isNew) return;
      kind = "duel";
      body = say(lang, "duel", { name });
      break;
    case "duelscore":
      if (!isNew) return;
      kind = "duel";
      body = say(lang, "duelDone", { name, score: d.score });
      break;
    case "cnrec":
      if (d.at === o.at) return;
      kind = "phrase";
      body = say(lang, "phraseNew", { name });
      break;
    case "cnrate":
      if (d.at === o.at) return;
      kind = "phrase";
      body = say(lang, "phraseRated", { name, verdict: say(lang, String(d.verdict)) }) + (d.note ? ` · ${d.note}` : "");
      break;
    case "cn":
      if (!isNew) return;
      kind = "phrase";
      body = say(lang, "phraseAdded", { name, hanzi: d.hanzi });
      break;
    case "day":
      if (!(Number(d.planned) > 0 && d.done === d.planned) || o.done === d.done) return;
      kind = "partnerDay";
      body = say(lang, "partnerDay", { name });
      if (!(await claim(partner.id, `partnerDay:${new Date().toISOString().slice(0, 10)}`))) return;
      break;
    default:
      return;
  }
  // Calls are on unless switched off (older settings don't list them yet).
  if (kind === "call" ? p.on?.call === false : !on(kind)) return;
  const urls: Record<string, string> = { call: "/together/chat", message: "/together/chat", love: "/together", sharedFocus: "/focus", garden: "/together", question: "/together", pairHabit: "/together", duel: "/learn", phrase: "/learn", partnerDay: "/together" };
  const { minutes } = local(subs[0].tz || "UTC");
  if (kind !== "message" && kind !== "call" && quiet(p, minutes)) return;
  const title = kind === "message" && count > 1 ? `${name} · ${say(lang, "newMessages", { count })}` : name;
  await deliver(subs, { title, body, url: urls[kind], tag: kind === "message" ? "message" : `${kind}-${record.id}`, count });
}

/* ------------------------------------------------------------------ entry */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = await req.json().catch(() => ({}));
    const cfg = await getConfig();
    if (body.type === "vapid") return Response.json({ publicKey: cfg.vapid_public }, { headers: cors });
    if (body.type === "test") {
      const token = (req.headers.get("authorization") ?? "").replace(/^Bearer /i, "");
      const { data: who } = await db.auth.getUser(token);
      if (!who?.user) return Response.json({ error: "not signed in" }, { status: 401, headers: cors });
      const subs = await subsOf(who.user.id);
      const lang = subs[0]?.prefs?.lang ?? subs[0]?.lang ?? "en";
      await deliver(subs, { title: "Bloom 🌱", body: say(lang, "test"), url: "/notifications", tag: "test" });
      return Response.json({ sent: subs.length }, { headers: cors });
    }
    if (req.headers.get("x-bloom-hook") !== cfg.hook_secret) return new Response("forbidden", { status: 403, headers: cors });
    if (body.type === "test_all") {
      const { data } = await db.from("push_subscriptions").select("*");
      const subs = (data ?? []) as Sub[];
      for (const sub of subs) await deliver([sub], { title: "Bloom 🌱", body: say(sub.prefs?.lang ?? sub.lang ?? "en", "test"), url: "/notifications", tag: "test" });
      return Response.json({ sent: subs.length }, { headers: cors });
    }
    if (body.type === "item") await itemEvent(body.op, body.record, body.old ?? null, body.actor ?? null);
    else if (body.type === "tick") await tick();
    return Response.json({ ok: true }, { headers: cors });
  } catch (error) {
    console.error(error);
    return Response.json({ error: String((error as Error).message ?? error) }, { status: 500, headers: cors });
  }
});
