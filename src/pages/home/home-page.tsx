import { Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { saveDay, useDay } from "@/entities/day";
import { useActiveFocus, useFocusClock, useFocusStats, pauseFocus, resumeFocus, startFocus } from "@/entities/focus";
import { flatten, useCountdowns, useGoalTree } from "@/entities/goal";
import { useHabitBoard } from "@/entities/habit";
import { useReview } from "@/entities/journal";
import { usePrefs } from "@/entities/prefs";
import { plantStages, pointRules, useProgress } from "@/entities/progress";
import { useUser } from "@/entities/session";
import { addTask, useTasksOn } from "@/entities/task";
import { HabitItem } from "@/features/habit/habit-item";
import { HabitSheet } from "@/features/habit/habit-sheet";
import { TaskItem, TaskSheet } from "@/features/task/task-item";
import { countdownArt } from "@/features/goal/goal-sheet";
import type { Task } from "@/shared/db";
import { localeOf } from "@/shared/i18n";
import { dateKey, formatClock, greetingFor, hourInZone } from "@/shared/lib/date";
import { requestIntent } from "@/shared/lib/intent";
import { haptic, pop, useCountUp } from "@/shared/lib/motion/fx";
import { EnergyPicker, MoodPicker, Section } from "@/shared/ui/bloom";
import { Glyph } from "@/shared/ui/glyph";
import { Art, Bar, Ring, Tile, at, toast } from "@/shared/ui/kit";
import { SpacesGrid } from "@/widgets/spaces-grid/spaces-grid";
import { Tour } from "@/widgets/tour/tour";
import { InstallBanner } from "@/widgets/install/install";
import { PushPrompt } from "@/features/notify/push-prompt";

export function HomePage() {
  const { t } = useTranslation();
  const user = useUser();
  const navigate = useNavigate();
  const today = dateKey();
  const prefs = usePrefs(user.id);
  const day = useDay(user.id, today);
  const board = useHabitBoard(user.id);
  const tasks = useTasksOn(user.id, today);
  const focusStats = useFocusStats(user.id, 1);
  const review = useReview(user.id, "day", today);
  const [habitOpen, setHabitOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);

  const part = greetingFor();
  const hour = hourInZone();
  const firstName = user.displayName.split(" ")[0] ?? user.displayName;
  const dateLine = new Intl.DateTimeFormat(localeOf(), { weekday: "long", day: "numeric", month: "long" }).format(new Date());

  const tops = (tasks ?? []).filter((task) => task.top);
  const plannedHabits = (board?.cards ?? []).filter((card) => (card.plannedToday || card.doneToday) && !card.vacation);
  const steps = useMemo(() => {
    const list: Array<{ done: boolean }> = [{ done: Boolean(day?.mood) }];
    if (tops.length === 0) list.push({ done: false });
    tops.forEach((task) => list.push({ done: task.done }));
    plannedHabits.forEach((card) => list.push({ done: card.doneToday }));
    list.push({ done: Boolean(review) });
    return list;
  }, [day, tops, plannedHabits, review]);
  const doneSteps = steps.filter((step) => step.done).length;
  const shownDone = useCountUp(doneSteps, 700);

  const nextStep = (() => {
    if (!day?.mood) return { label: t("home.next.mood"), art: "i-smile", go: () => document.getElementById("checkin")?.scrollIntoView({ behavior: "smooth", block: "center" }) };
    if (tops.length === 0) return { label: t("home.next.top"), art: "i-target", go: () => document.getElementById("top3")?.scrollIntoView({ behavior: "smooth", block: "center" }) };
    const openTop = tops.find((task) => !task.done);
    if (openTop) return { label: t("home.next.task", { name: openTop.title }), art: "i-list", go: () => setEditing(openTop) };
    const openHabit = plannedHabits.find((card) => !card.doneToday);
    if (openHabit) return { label: t("home.next.habit", { name: openHabit.name }), art: openHabit.icon ?? "i-sprout", go: () => void navigate({ to: "/habits/$habitId", params: { habitId: openHabit.id } }) };
    if ((focusStats?.today.minutes ?? 0) === 0 && hour < 20) return { label: t("home.next.focus"), art: "i-flame", go: () => void navigate({ to: "/focus" }) };
    if (!review && hour >= 17) return { label: t("home.next.reflect"), art: "o-journal", go: () => void navigate({ to: "/reflect" }) };
    if (!(day.good ?? []).some((line) => line.trim())) return { label: t("home.next.good"), art: "i-heart", go: () => { requestIntent("good"); void navigate({ to: "/body" }); } };
    return { label: t("home.next.done"), art: "c-lying-heart", go: () => void navigate({ to: "/garden" }) };
  })();

  const heroArt = part === "evening" ? "s-night" : part === "afternoon" ? "s-meadow-lake" : "s-morning-garden";

  return (
    <div className="page home">
      <header className="home-head rise" style={at(0)}>
        <div>
          <p className="eyebrow">{dateLine}</p>
          <h1 className="display">{t("home.hello", { greeting: t(`home.${part}`), name: firstName })}</h1>
          <p className="sub">{t(`home.line${part[0]!.toUpperCase()}${part.slice(1)}`)}</p>
        </div>
        <div className="home-head-actions">
          <Link to="/spaces" className="round-btn mob-only" aria-label={t("nav.spaces")} title={t("nav.spaces")}>
            <Glyph name="grid" size={21} stroke={2.1} />
          </Link>
          <Link to="/settings" className="round-btn mob-only" aria-label={t("nav.settings")}>
            <Glyph name="settings" size={21} stroke={2.1} />
          </Link>
        </div>
      </header>

      <InstallBanner />
      <PushPrompt />

      {board?.vacation ? (
        <div className="banner-note tone-sky rise" style={at(1)}>
          <Glyph name="palm" size={20} />
          <span>{t("home.vacation")}</span>
        </div>
      ) : null}

      <div className="home-grid">
        <div className="home-col">
          <section data-tour="home-day" className={`dayhero rise is-${part}`} style={at(1)}>
            <Art name={heroArt} className="dayhero-bg" eager />
            <div className="dayhero-top">
              <Ring value={steps.length ? doneSteps / steps.length : 0} size={92} stroke={10} color="#fff" track="rgba(255,255,255,.35)">
                <span className="ring-copy is-light">
                  <strong className="num">
                    {shownDone}/{steps.length}
                  </strong>
                </span>
              </Ring>
              <div>
                <p className="eyebrow is-light">{t("home.dayTitle")}</p>
                <strong className="dayhero-count">{t("home.dayCount", { done: doneSteps, total: steps.length })}</strong>
              </div>
            </div>
            <button type="button" className="dayhero-next pressable" onClick={nextStep.go}>
              <Tile name={nextStep.art} size={40} />
              <span>
                <small>{t("home.nextLabel")}</small>
                <strong>{nextStep.label}</strong>
              </span>
              <span className="chev-bubble">
                <Glyph name="chevron" size={18} stroke={2.4} />
              </span>
            </button>
          </section>

          <section id="checkin" data-tour="home-checkin" className="card checkin-card rise" style={at(2)}>
            <div className="card-title">
              <h2 className="heading">{t("home.checkTitle")}</h2>
              <Link to="/body" className="link">
                {t("home.moreBody")}
              </Link>
            </div>
            <MoodPicker
              compact
              value={day?.mood}
              onPick={(mood) => {
                void saveDay(user.id, { mood });
                if (!day?.mood) toast(t("home.moodSaved"), "c-hug-heart");
              }}
            />
            {day?.mood ? <p className="mood-line">{t(`body.moodLine.${day.mood}`)}</p> : null}
            <div className="checkin-energy">
              <span className="field-label">{t("home.energy")}</span>
              <EnergyPicker value={day?.energy} onPick={(energy) => void saveDay(user.id, { energy })} />
            </div>
          </section>

          <section id="top3" data-tour="home-top" className="card rise" style={at(3)}>
            <div className="card-title">
              <h2 className="heading">
                <Glyph name="star" size={18} fill className="title-star" /> {t("home.topTitle")}
              </h2>
              <Link to="/tasks" className="link">
                {t("home.allTasks")}
              </Link>
            </div>
            {tops.length === 0 ? <p className="sub card-note">{t("home.topEmpty")}</p> : null}
            <div className="tlist">
              {tops.map((task) => (
                <TaskItem key={task.id} task={task} userId={user.id} compact onOpen={setEditing} />
              ))}
            </div>
            {tops.length < 3 ? <QuickTop userId={user.id} /> : <p className="tiny card-note">{t("home.topFull")}</p>}
          </section>

          <section className="card rise" style={at(4)} data-tour="home-habits">
            <div className="card-title">
              <h2 className="heading">{t("home.habitsTitle")}</h2>
              <Link to="/habits" className="link">
                {board ? `${board.done}/${board.planned}` : ""} · {t("common.seeAll")}
              </Link>
            </div>
            {board && board.cards.length === 0 ? <p className="sub card-note">{t("home.habitsEmpty")}</p> : null}
            <div className="hlist">
              {plannedHabits.map((card) => (
                <HabitItem key={card.id} card={card} userId={user.id} />
              ))}
            </div>
            <button type="button" className="btn is-soft is-sm add-inline" onClick={() => setHabitOpen(true)}>
              <Glyph name="plus" size={18} stroke={2.4} />
              {t("home.addHabit")}
            </button>
          </section>
        </div>

        <div className="home-col">
          <FocusMini userId={user.id} defaultMinutes={prefs?.focusMinutes ?? 25} />
          <GardenMini userId={user.id} petName={prefs?.petName ?? "Bloomie"} />
          <UpcomingCard userId={user.id} />
          <Link to="/reflect" data-tour="home-evening" className={`card evening-card tone-lav pressable rise ${review ? "is-done" : ""}`} style={at(8)}>
            <Art name={review ? "c-sleep-cloud" : "c-read-cup"} className="evening-art" />
            <span>
              <strong className="heading">{t("home.eveningTitle")}</strong>
              <small>{review ? t("home.eveningDone") : t("home.eveningBody")}</small>
            </span>
          </Link>
          <QuoteCard />
        </div>
      </div>

      <Section
        tour="home-spaces"
        title={t("spaces.homeTitle")}
        action={
          <Link to="/spaces" className="link">
            {t("common.seeAll")}
          </Link>
        }
      >
        <p className="sub sect-sub">{t("spaces.homeSub")}</p>
        <SpacesGrid userId={user.id} />
      </Section>

      <Tour id="home" />
      <HabitSheet open={habitOpen} onClose={() => setHabitOpen(false)} userId={user.id} />
      <TaskSheet open={editing !== null} task={editing} onClose={() => setEditing(null)} userId={user.id} />
    </div>
  );
}

function QuickTop({ userId }: { userId: string }) {
  const { t } = useTranslation();
  const [title, setTitle] = useState("");
  const input = useRef<HTMLInputElement>(null);
  async function add() {
    if (!title.trim()) return;
    await addTask(userId, { title, top: true });
    setTitle("");
    haptic(6);
    input.current?.focus();
  }
  return (
    <div className="quick-add">
      <span className="input">
        <Glyph name="star" size={18} />
        <input
          ref={input}
          value={title}
          maxLength={120}
          placeholder={t("home.topPlaceholder")}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void add();
          }}
        />
      </span>
      <button type="button" className="icon-btn is-solid" aria-label={t("common.add")} disabled={!title.trim()} onClick={() => void add()}>
        <Glyph name="plus" size={20} stroke={2.6} />
      </button>
    </div>
  );
}

function FocusMini({ userId, defaultMinutes }: { userId: string; defaultMinutes: number }) {
  const { t } = useTranslation();
  const { focus, remaining } = useFocusClock(userId);
  const active = useActiveFocus(userId);
  const stats = useFocusStats(userId, 1);
  const play = useRef<HTMLButtonElement>(null);
  const running = focus?.status === "running";
  const paused = focus?.status === "paused";
  return (
    <section data-tour="home-focus" className={`card focus-mini tone-pink rise ${running ? "is-running" : ""}`} style={at(5)}>
      <Link to="/focus" className="cover-link" aria-label={t("focus.title")} />
      <div className="focus-mini-copy">
        <span className="focus-mini-label">
          <Tile name="i-flame" size={28} />
          {t("home.focusTitle")}
        </span>
        <strong className="num focus-mini-time">{focus ? formatClock(remaining) : `${defaultMinutes}:00`}</strong>
        <small>{running ? t("home.focusRunning") : paused ? t("home.focusPaused") : t("home.focusIdle", { minutes: stats?.today.minutes ?? 0 })}</small>
      </div>
      <button
        ref={play}
        type="button"
        className="focus-play"
        aria-label={running ? t("focus.pause") : paused ? t("focus.resume") : t("home.focusStart", { minutes: defaultMinutes })}
        onClick={async () => {
          pop(play.current, 1.14);
          haptic(10);
          if (active?.status === "running") await pauseFocus(active);
          else if (active?.status === "paused") await resumeFocus(active);
          else {
            await startFocus(userId, { minutes: defaultMinutes });
            toast(t("focus.running"), "c-headphones");
          }
        }}
      >
        <Art name={running ? "btn-pause" : "btn-play"} eager />
      </button>
      <Art name="c-peek-center" className="focus-mini-peek" />
    </section>
  );
}

function GardenMini({ userId, petName }: { userId: string; petName: string }) {
  const { t } = useTranslation();
  const progress = useProgress(userId);
  if (!progress) return <section className="card garden-mini skeleton" />;
  return (
    <Link to="/garden" data-tour="home-garden" className="card garden-mini tone-mint pressable rise" style={at(6)}>
      <span className="garden-mini-plant">
        <Art name={plantStages[progress.stage]} className="sway" />
      </span>
      <span className="garden-mini-copy">
        <strong className="heading">{t("home.gardenTitle", { name: petName, level: progress.level.level })}</strong>
        <small>{(t("garden.stages", { returnObjects: true }) as string[])[progress.stage]}</small>
        <Bar value={progress.level.progress} tone="mint" height={8} />
        <small className="tiny">
          {t("home.gardenBody", { points: progress.level.toNext })} · +{pointRules.habit} / {t("garden.earn.habit").toLowerCase()}
        </small>
      </span>
    </Link>
  );
}

function UpcomingCard({ userId }: { userId: string }) {
  const { t } = useTranslation();
  const countdowns = useCountdowns(userId);
  const goals = useGoalTree(userId);
  const next = (countdowns ?? []).filter((item) => item.daysLeft >= 0).slice(0, 2);
  const active = flatten(goals ?? [])
    .filter((goal) => !goal.doneAt)
    .sort((a, b) => b.progress - a.progress)
    .slice(0, 2);
  return (
    <section className="card rise" style={at(7)}>
      <div className="card-title">
        <h2 className="heading">{t("home.goalsTitle")}</h2>
        <Link to="/goals" className="link">
          {t("common.seeAll")}
        </Link>
      </div>
      {active.length === 0 ? (
        <Link to="/goals" className="mini-empty" onClick={() => requestIntent("goal")}>
          <Art name="o-target-heart" />
          <span>{t("home.goalsEmpty")}</span>
        </Link>
      ) : (
        <div className="goal-minis">
          {active.map((goal) => (
            <Link key={goal.id} to="/goals/$goalId" params={{ goalId: goal.id }} className="goal-mini">
              <Tile name={goal.icon} tone={goal.tone} size={36} />
              <span>
                <strong>{goal.title}</strong>
                <Bar value={goal.progress} tone={goal.tone} height={6} />
              </span>
              <b className="num">{Math.round(goal.progress * 100)}%</b>
            </Link>
          ))}
        </div>
      )}
      {next.length ? (
        <div className="cd-minis">
          {next.map((item) => (
            <Link key={item.id} to="/goals" className="cd-mini">
              <Tile name={countdownArt(item.kind)} size={34} />
              <span>{item.title}</span>
              <b className="num">{item.daysLeft === 0 ? t("countdowns.today") : t("countdowns.in", { count: item.daysLeft })}</b>
            </Link>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function QuoteCard() {
  const { t } = useTranslation();
  const quotes = t("quotes", { returnObjects: true }) as string[];
  const index = Math.floor(Date.now() / 86_400_000) % quotes.length;
  return (
    <section className="card quote-card tone-sun rise" style={at(9)}>
      <Art name="c-hold-daisy" className="quote-art" />
      <p className="eyebrow">{t("home.quote")}</p>
      <blockquote>{quotes[index]}</blockquote>
    </section>
  );
}
