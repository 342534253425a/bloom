import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  addPairHabit,
  answerQuestion,
  gardenScore,
  newInviteCode,
  pairStreak,
  pairWith,
  questionIndex,
  removePairHabit,
  sendEffect,
  sharedRemaining,
  togglePairCheck,
  unpair,
  useCouple,
  useDaySummaries,
  useItem,
  useItems,
  waterTogether,
  canWater,
  type FocusData,
  type GardenData,
  type PairError,
  type PairHabit,
} from "@/entities/couple";
import { levelFor, plantStages, stageFor, useProgress } from "@/entities/progress";
import { habitIcons } from "@/shared/config/spaces";
import { localeOf } from "@/shared/i18n";
import { addDays, dateKey, formatClock, formatKey } from "@/shared/lib/date";
import { burst, haptic, pop } from "@/shared/lib/motion/fx";
import { Confirm, Field, IconButton, IconPicker, Section, TextIn } from "@/shared/ui/bloom";
import { Glyph } from "@/shared/ui/glyph";
import { Art, Bar, Tile, toast } from "@/shared/ui/kit";
import { shareText } from "../stats/stats-page";

const INVITE_KEY = "bloom.invite";

export function pendingInvite(): string | null {
  try {
    return localStorage.getItem(INVITE_KEY);
  } catch {
    return null;
  }
}

export function clearInvite() {
  try {
    localStorage.removeItem(INVITE_KEY);
  } catch {
    /* ignore */
  }
}

export function rememberInvite(code: string) {
  try {
    localStorage.setItem(INVITE_KEY, code.toUpperCase());
  } catch {
    /* ignore */
  }
}

/* ---------- Pairing ---------- */

export function PairSetup() {
  const { t } = useTranslation();
  const couple = useCouple();
  const [code, setCode] = useState(() => pendingInvite() ?? "");
  const [error, setError] = useState<PairError | null>(null);
  const [busy, setBusy] = useState(false);
  const mine = couple.me?.invite_code ?? "······";
  const link = `${window.location.origin}/join?code=${mine}`;

  const messages: Record<PairError, string> = {
    "code-not-found": t("couple.pair.errors.notFound"),
    "own-code": t("couple.pair.errors.own"),
    "already-paired": t("couple.pair.errors.taken"),
    offline: t("couple.pair.errors.offline"),
  };

  async function connect() {
    if (code.trim().length < 6) return;
    setBusy(true);
    const result = await pairWith(code);
    setBusy(false);
    setError(result);
    if (!result) {
      clearInvite();
      haptic([10, 60, 14]);
      toast(t("couple.pair.linked"), "c-pair-hearts");
    }
  }

  if (couple.status === "error") {
    return (
      <section className="card pair-card rise">
        <Art name="c-frown" className="pair-art" />
        <p className="sub">{t("couple.pair.errors.setup")}</p>
      </section>
    );
  }

  return (
    <section className="card pair-card tone-pink rise" data-tour="together-pair">
      <Art name="c-pair-hearts" className="pair-art float" />
      <h2 className="title">{t("couple.pair.title")}</h2>
      <p className="sub">{t("couple.pair.body")}</p>
      {pendingInvite() ? <p className="pair-invite">💌 {t("couple.pair.invited", { code: pendingInvite() })}</p> : null}
      <div className="pair-code">
        <span className="eyebrow">{t("couple.pair.yourCode")}</span>
        <strong className="num">{mine}</strong>
        <div className="btn-row is-center">
          <button type="button" className="btn is-pink is-sm" onClick={() => void shareText(t("couple.pair.shareText", { link, code: mine }), t)}>
            <Glyph name="share" size={18} />
            {t("couple.pair.shareLink")}
          </button>
          <button
            type="button"
            className="btn is-soft is-sm"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(mine);
                toast(t("common.copied"), "c-hug-heart");
              } catch {
                /* clipboard blocked */
              }
            }}
          >
            <Glyph name="copy" size={18} />
            {t("couple.pair.copyCode")}
          </button>
          <button type="button" className="btn is-ghost is-sm" onClick={() => void newInviteCode()}>
            {t("couple.pair.newCode")}
          </button>
        </div>
      </div>
      <div className="pair-enter">
        <span className="field-label">{t("couple.pair.enter")}</span>
        <div className="quick-add">
          <span className="input">
            <input
              value={code}
              maxLength={6}
              placeholder={t("couple.pair.placeholder")}
              onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
              onKeyDown={(event) => {
                if (event.key === "Enter") void connect();
              }}
              style={{ letterSpacing: "4px", fontWeight: 900, textTransform: "uppercase" }}
            />
          </span>
          <button type="button" className="btn is-sm" disabled={busy || code.length < 6} onClick={() => void connect()}>
            {t("couple.pair.connect")}
          </button>
        </div>
        {error ? <p className="field-error">{messages[error]}</p> : null}
      </div>
    </section>
  );
}

/* ---------- Partner header ---------- */

function since(iso: string | null, t: (key: string) => string): string {
  if (!iso) return "";
  const minutes = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return minutes < 60 ? `${minutes} ${t("common.min")}` : `${Math.floor(minutes / 60)} ${t("common.h")} ${minutes % 60} ${t("common.min")}`;
}

export function PartnerHeader() {
  const { t } = useTranslation();
  const couple = useCouple();
  const [confirm, setConfirm] = useState(false);
  const partner = couple.partner!;
  const presence = couple.presence;
  const status = !couple.connected
    ? t("couple.presence.connecting")
    : presence.online
      ? `${presence.away ? t("couple.presence.away") : t(`couple.presence.activity.${presence.activity ?? "other"}`)}${presence.since && !presence.away ? ` · ${t("couple.presence.for", { time: since(presence.since, t) })}` : ""}`
      : t("couple.presence.offline");
  return (
    <section className="card partner-hero rise" data-tour="together-partner">
      <span className={`partner-ava ${presence.online ? "is-online" : ""}`}>
        <Art name="c-two-wink" />
        <i />
      </span>
      <div className="partner-copy">
        <strong className="title">{partner.name || "♥"}</strong>
        <small>{status}</small>
        {couple.me?.paired_at ? <small className="tiny">{t("couple.pair.since", { date: formatKey(couple.me.paired_at.slice(0, 10), localeOf(), { day: "numeric", month: "long" }) })}</small> : null}
      </div>
      <button
        type="button"
        className="partner-heart"
        aria-label={t("couple.fx.thinking.name")}
        onClick={(event) => {
          pop(event.currentTarget, 1.3);
          burst(event.currentTarget, { count: 14, spread: 50, colors: ["#ff8ba0", "#ffb3c1", "#f2647f"] });
          haptic([10, 40, 10]);
          void sendEffect("thinking");
          toast(t("couple.love.sent", { name: partner.name || "♥" }), "c-hug-heart");
        }}
      >
        💗
      </button>
      <button type="button" className="icon-btn partner-more" aria-label={t("couple.pair.unpair")} onClick={() => setConfirm(true)}>
        <Glyph name="more" size={18} />
      </button>
      <Confirm open={confirm} title={t("couple.pair.unpair")} body={t("couple.pair.unpairBody")} action={t("couple.pair.unpair")} onClose={() => setConfirm(false)} onConfirm={() => void unpair()} />
    </section>
  );
}

/* ---------- Focus together ---------- */

export function FocusTogether() {
  const { t } = useTranslation();
  const couple = useCouple();
  const navigate = useNavigate();
  const focus = useItem<FocusData>("focus");
  const logs = useItems<{ minutes: number; at: string }>("focuslog");
  const [now, setNow] = useState(Date.now());
  const data = focus?.data;
  const running = Boolean(data && data.phase !== "idle");
  const remaining = sharedRemaining(data, now);
  const weekStart = addDays(dateKey(), -6);
  const week = logs.filter((log) => log.data.at.slice(0, 10) >= weekStart).reduce((sum, log) => sum + log.data.minutes, 0);
  const starter = data?.by === couple.me?.id ? t("couple.you") : couple.partner?.name || "♥";

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [running]);

  function open() {
    sessionStorage.setItem("bloom.focusShared", "1");
    void navigate({ to: "/focus" });
  }

  return (
    <Section title={t("couple.focus.title")} tour="together-focus">
      <button type="button" className={`card focus2 tone-lav pressable rise ${running ? "is-running" : ""}`} onClick={open}>
        <div className="focus2-row">
          <div className="focus2-avatars">
            <Art name="c-laptop" />
            <Art name="c-headphones" />
          </div>
          <div className="focus2-copy">
            {running ? <strong className="num focus2-time">{formatClock(remaining)}</strong> : <strong className="focus2-title">{t("couple.focus.withName", { name: couple.partner?.name || "♥" })}</strong>}
            <small>
              {running
                ? `${data!.phase === "break" ? t("couple.focus.onBreak") : t("couple.focus.focusing")} · ${t("couple.focus.startedBy", { name: starter })}`
                : t("couple.focus.body")}
            </small>
          </div>
        </div>
        <span className="btn is-sm">
          <Glyph name="flame" size={16} />
          {t("couple.focus.open")}
        </span>
        <small className="tiny">{t("couple.focus.week", { minutes: week })}</small>
      </button>
    </Section>
  );
}

/* ---------- Question of the day ---------- */

export function QuestionOfDay() {
  const { t } = useTranslation();
  const couple = useCouple();
  const answers = useItems<{ q: number; text: string; date: string }>("answer");
  const [text, setText] = useState("");
  const [bookOpen, setBookOpen] = useState(false);
  const questions = t("couple.questions", { returnObjects: true }) as string[];
  const today = dateKey();
  const index = questionIndex(today, questions.length);
  const me = couple.me?.id ?? "";
  const partner = couple.partner?.id ?? "";
  const name = couple.partner?.name || "♥";
  const mine = answers.find((item) => item.id === `qa:${today}:${me}`);
  const theirs = answers.find((item) => item.id === `qa:${today}:${partner}`);
  const book = useMemo(() => {
    const dates = [...new Set(answers.map((item) => item.data.date))].sort().reverse();
    return dates
      .map((date) => ({ date, me: answers.find((item) => item.id === `qa:${date}:${me}`), them: answers.find((item) => item.id === `qa:${date}:${partner}`) }))
      .filter((row) => row.me && row.them && row.date !== today);
  }, [answers, me, partner, today]);

  return (
    <Section title={t("couple.question.title")} tour="together-question">
      <section className="card question tone-sun rise">
        <Art name="c-hold-daisy" className="question-art" />
        <p className="question-text">“{questions[index]}”</p>
        {!mine ? (
          <>
            <small className="tiny">{theirs ? t("couple.question.hidden", { name }) : t("couple.question.body", { name })}</small>
            <div className="quick-add">
              <TextIn value={text} onChange={setText} placeholder={t("couple.question.placeholder")} maxLength={400} onEnter={() => void answerQuestion(index, text)} />
              <button type="button" className="btn is-sm" disabled={!text.trim()} onClick={() => void answerQuestion(index, text)}>
                {t("couple.question.answer")}
              </button>
            </div>
          </>
        ) : (
          <div className="answers">
            <div className="answer is-mine">
              <small>{t("couple.you")}</small>
              <p>{mine.data.text}</p>
            </div>
            <div className="answer">
              <small>{name}</small>
              <p>{theirs ? theirs.data.text : t("couple.question.waiting", { name })}</p>
            </div>
          </div>
        )}
        {book.length ? (
          <button type="button" className="link" onClick={() => setBookOpen(!bookOpen)}>
            📖 {t("couple.question.book")} · {book.length}
          </button>
        ) : null}
        {bookOpen ? (
          <div className="answer-book">
            {book.map((row) => (
              <article key={row.date}>
                <p className="eyebrow">{formatKey(row.date, localeOf(), { day: "numeric", month: "long" })}</p>
                <strong>“{questions[row.me!.data.q] ?? ""}”</strong>
                <p>
                  <b>{t("couple.you")}:</b> {row.me!.data.text}
                </p>
                <p>
                  <b>{name}:</b> {row.them!.data.text}
                </p>
              </article>
            ))}
          </div>
        ) : null}
      </section>
    </Section>
  );
}

/* ---------- Pair habits ---------- */

export function PairHabits() {
  const { t } = useTranslation();
  const couple = useCouple();
  const habits = useItems<PairHabit>("phabit");
  const checks = useItems("pcheck");
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [icon, setIcon] = useState("i-book");
  const today = dateKey();
  const me = couple.me?.id ?? "";
  const partner = couple.partner?.id ?? "";
  const name = couple.partner?.name || "♥";
  const has = (habit: string, who: string) => checks.some((item) => item.id === `pc:${habit}:${who}:${today}`);

  return (
    <Section title={t("couple.phabits.title")} tour="together-habits">
      <section className="card rise">
        <p className="sub card-note">{t("couple.phabits.body")}</p>
        {habits.length === 0 ? <p className="tiny card-note">{t("couple.phabits.empty")}</p> : null}
        <div className="phabits">
          {habits.map((habit) => {
            const mine = has(habit.id, me);
            const theirs = has(habit.id, partner);
            const streak = pairStreak(habit.id, checks, me, partner);
            return (
              <div key={habit.id} className={`phabit ${mine && theirs ? "is-both" : ""}`}>
                <Tile name={habit.data.icon} tone="pink" size={42} />
                <span className="row-copy">
                  <strong>{habit.data.title}</strong>
                  <small>{mine && theirs ? t("couple.phabits.both") : mine ? t("couple.phabits.waiting", { name }) : streak ? t("couple.phabits.streak", { count: streak }) : " "}</small>
                </span>
                <span className={`pdot ${theirs ? "is-on" : ""}`} title={name}>
                  {name.slice(0, 1).toUpperCase()}
                </span>
                <button
                  type="button"
                  className={`pcheck ${mine ? "is-on" : ""}`}
                  aria-pressed={mine}
                  onClick={(event) => {
                    if (!mine) burst(event.currentTarget, { count: 12, spread: 36 });
                    haptic(8);
                    void togglePairCheck(habit.id);
                  }}
                >
                  <Glyph name="check" size={18} stroke={3} />
                </button>
                <IconButton glyph="close" label={t("common.delete")} onClick={() => void removePairHabit(habit.id)} />
              </div>
            );
          })}
        </div>
        {adding ? (
          <div className="form">
            <Field label={t("couple.phabits.add")}>
              <TextIn value={title} onChange={setTitle} placeholder={t("couple.phabits.placeholder")} maxLength={60} autoFocus />
            </Field>
            <IconPicker icons={habitIcons.slice(0, 12)} value={icon} onPick={setIcon} />
            <button
              type="button"
              className="btn is-sm"
              disabled={!title.trim()}
              onClick={async () => {
                await addPairHabit(title, icon);
                setTitle("");
                setAdding(false);
              }}
            >
              {t("common.add")}
            </button>
          </div>
        ) : (
          <button type="button" className="btn is-soft is-sm" onClick={() => setAdding(true)}>
            <Glyph name="plus" size={18} stroke={2.6} />
            {t("couple.phabits.add")}
          </button>
        )}
      </section>
    </Section>
  );
}

/* ---------- Shared garden ---------- */

export function GardenTogether() {
  const { t } = useTranslation();
  const couple = useCouple();
  const days = useDaySummaries();
  const garden = useItem<GardenData>("garden");
  const me = couple.me?.id ?? "";
  const partner = couple.partner?.id ?? "";
  const name = couple.partner?.name || "♥";
  const progress = useProgress(me);
  const balance = progress?.balance ?? 0;
  const score = gardenScore(days, me, partner, garden?.data.waters ?? 0);
  const level = levelFor(score.points);
  const stage = stageFor(level.level);
  const stages = t("garden.stages", { returnObjects: true }) as string[];
  const today = dateKey();
  const mineToday = days.find((item) => item.id === `day:${me}:${today}`)?.data;
  const theirsToday = days.find((item) => item.id === `day:${partner}:${today}`)?.data;
  const check = canWater(balance);
  const lastBy = garden?.data.lastBy;
  const turnLabel = !lastBy ? t("couple.garden.anyTurn") : lastBy === me ? t("couple.garden.theirTurn", { name }) : t("couple.garden.yourTurn");

  async function water(target: HTMLElement | null) {
    const result = await waterTogether(balance);
    if (!result.ok) {
      toast(result.reason === "turn" ? t("couple.garden.waitTurn", { name }) : t("couple.garden.needPoints", { cost: result.cost, balance }), "c-sad-grass");
      return;
    }
    pop(target, 1.08);
    burst(target, { count: 16, spread: 70, colors: ["#5aaff0", "#9fd3fa", "#d6ecfd"] });
    haptic(8);
    await sendEffect("plant");
    toast(t("couple.garden.watered", { name }), "c-watering");
  }

  return (
    <Section title={garden?.data.name || t("couple.garden.title")} tour="together-garden">
      <section className="card garden2 tone-mint rise">
        <button type="button" className="garden2-plant" onClick={(event) => void water(event.currentTarget)}>
          <Art name={plantStages[stage]} className="sway" />
          <span className="garden2-flowers">{"🌸".repeat(Math.min(score.flowers.length, 7))}</span>
        </button>
        <div className="garden2-copy">
          <span className="pill">
            {t("garden.level", { level: level.level })} · {stages[stage]}
          </span>
          <p className="sub">{t("couple.garden.body")}</p>
          <Bar value={level.progress} tone="mint" height={8} />
          <small className="tiny">
            {t("garden.toNext", { points: level.toNext })} · {t("couple.garden.flowers", { count: score.flowers.length })}
          </small>
          <div className="garden2-today">
            <span>
              <b>{t("couple.you")}</b> {mineToday ? t("couple.garden.habitsOf", { done: mineToday.done, planned: mineToday.planned }) : t("couple.garden.noData")}
            </span>
            <span>
              <b>{name}</b> {theirsToday ? t("couple.garden.habitsOf", { done: theirsToday.done, planned: theirsToday.planned }) : t("couple.garden.noData")}
            </span>
          </div>
          <div className="water-row">
            <button type="button" className="btn is-sm" disabled={!check.ok} onClick={(event) => void water(event.currentTarget)}>
              💧 {t("couple.garden.waterFor", { cost: check.cost })}
            </button>
            <small className="tiny">
              {turnLabel} · {t("couple.garden.balance", { balance })}
            </small>
          </div>
        </div>
      </section>
    </Section>
  );
}

export function LearnEntry() {
  const { t } = useTranslation();
  const couple = useCouple();
  const name = couple.partner?.name || "♥";
  const learning = couple.presence.online && couple.presence.activity === "learn";
  return (
    <Link to="/learn" className={`card watch-entry is-learn rise ${learning ? "is-live" : ""}`}>
      <span className="watch-entry-icon">📚</span>
      <span>
        <strong className="heading">{t("learn.title")}</strong>
        <small>{learning ? `${name} · ${t("couple.presence.activity.learn")}` : t("learn.sub")}</small>
      </span>
      <span className="chev-bubble">
        <Glyph name="chevron" size={18} stroke={2.4} />
      </span>
    </Link>
  );
}

export function WatchEntry() {
  const { t } = useTranslation();
  const couple = useCouple();
  const name = couple.partner?.name || "♥";
  const watching = couple.presence.online && couple.presence.activity === "watch";
  return (
    <Link to="/watch" className={`card watch-entry rise ${watching ? "is-live" : ""}`} data-tour="together-watch">
      <span className="watch-entry-icon">🍿</span>
      <span>
        <strong className="heading">{t("couple.hub.watch")}</strong>
        <small>{watching ? t("couple.hub.watchLive", { name }) : t("couple.hub.watchBody")}</small>
      </span>
      <span className="chev-bubble">
        <Glyph name="chevron" size={18} stroke={2.4} />
      </span>
    </Link>
  );
}
