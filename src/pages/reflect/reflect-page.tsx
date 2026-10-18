import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { flatten, useGoalTree } from "@/entities/goal";
import { updateHabit } from "@/entities/habit";
import { addEntry, failureReasons, removeEntry, saveReview, useEntries, useReview, useReviews, type ReviewFields } from "@/entities/journal";
import { usePrefs } from "@/entities/prefs";
import { usePeriodStats } from "@/entities/progress";
import { useUser } from "@/entities/session";
import { addTask } from "@/entities/task";
import type { ReviewKind } from "@/shared/db";
import { localeOf } from "@/shared/i18n";
import { addDays, dateKey, formatKey, isoWeekKey, monthOf, weekOf } from "@/shared/lib/date";
import { useIntent } from "@/shared/lib/intent";
import { burst, haptic } from "@/shared/lib/motion/fx";
import { Empty, Field, IconButton, PageHead, Section, Stat, Tabs, TextArea, TextIn } from "@/shared/ui/bloom";
import { Glyph } from "@/shared/ui/glyph";
import { Art, Bar, Tile, at, toast } from "@/shared/ui/kit";
import { Tour } from "@/widgets/tour/tour";

type Tab = "day" | "week" | "month" | "failures" | "journal";

export function ReflectPage() {
  const { t } = useTranslation();
  const user = useUser();
  const [tab, setTab] = useState<Tab>(() => (new Date().getDay() === 0 ? "week" : "day"));
  useIntent("journal", () => setTab("journal"));
  return (
    <div className="page">
      <PageHead title={t("reflect.title")} sub={t("reflect.sub")} art="o-journal" help="reflect" back />
      <Tabs
        tour="reflect-tabs"
        value={tab}
        onChange={setTab}
        options={(["day", "week", "month", "failures", "journal"] as const).map((id) => ({ id, label: t(`reflect.tabs.${id}`) }))}
      />
      {tab === "day" ? <DayReview userId={user.id} /> : null}
      {tab === "week" ? <WeekReview userId={user.id} /> : null}
      {tab === "month" ? <MonthReview userId={user.id} /> : null}
      {tab === "failures" ? <Failures userId={user.id} /> : null}
      {tab === "journal" ? <Journal userId={user.id} /> : null}
      <Tour id="reflect" />
    </div>
  );
}

function useReviewForm(userId: string, kind: ReviewKind, periodKey: string) {
  const review = useReview(userId, kind, periodKey);
  const [fields, setFields] = useState<ReviewFields>({ wentWell: "", wasHard: "", nextStep: "", keep: [], drop: [] });
  useEffect(() => {
    if (review === undefined) return;
    setFields({ wentWell: review?.wentWell ?? "", wasHard: review?.wasHard ?? "", nextStep: review?.nextStep ?? "", keep: review?.keep ?? [], drop: review?.drop ?? [] });
  }, [review]);
  return { review, fields, set: (patch: Partial<ReviewFields>) => setFields((current) => ({ ...current, ...patch })) };
}

function SaveButton({ onSave, disabled }: { onSave: () => Promise<void>; disabled?: boolean }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      data-tour="reflect-save"
      className="btn is-block"
      disabled={disabled}
      onClick={async (event) => {
        const target = event.currentTarget;
        await onSave();
        burst(target, { count: 18, spread: 90 });
        haptic([8, 40, 10]);
        toast(t("reflect.saved"), "c-sleep-cloud");
      }}
    >
      <Glyph name="check" size={20} stroke={2.6} />
      {t("common.save")}
    </button>
  );
}

function DayReview({ userId }: { userId: string }) {
  const { t } = useTranslation();
  const today = dateKey();
  const { review, fields, set } = useReviewForm(userId, "day", today);
  const stats = usePeriodStats(userId, today, today);
  const history = useReviews(userId);
  const day = stats?.days[0];
  const past = (history ?? []).filter((item) => item.kind === "day" && item.periodKey !== today).slice(0, 7);
  return (
    <div className="two-col">
      <section className="card reflect-card tone-lav rise" style={at(1)} data-tour="reflect-form">
        <div className="card-title">
          <h2 className="heading">{t("reflect.day.title")}</h2>
          {review ? <span className="pill">✓</span> : null}
        </div>
        {day ? (
          <div className="mini-stats">
            <span>
              <Glyph name="sprout" size={16} /> {day.done}/{day.planned}
            </span>
            <span>
              <Glyph name="check" size={16} /> {day.tasks}
            </span>
            <span>
              <Glyph name="flame" size={16} /> {day.focus} {t("common.min")}
            </span>
          </div>
        ) : null}
        <Field label={`🌱 ${t("reflect.day.well")}`}>
          <TextArea value={fields.wentWell} onChange={(wentWell) => set({ wentWell })} placeholder={t("reflect.day.wellPlaceholder")} rows={2} />
        </Field>
        <Field label={`🌧 ${t("reflect.day.hard")}`}>
          <TextArea value={fields.wasHard} onChange={(wasHard) => set({ wasHard })} placeholder={t("reflect.day.hardPlaceholder")} rows={2} />
        </Field>
        <Field label={`👣 ${t("reflect.day.next")}`}>
          <TextArea value={fields.nextStep} onChange={(nextStep) => set({ nextStep })} placeholder={t("reflect.day.nextPlaceholder")} rows={2} />
        </Field>
        <SaveButton disabled={!fields.wentWell.trim() && !fields.wasHard.trim() && !fields.nextStep.trim()} onSave={() => saveReview(userId, "day", today, fields)} />
        {fields.nextStep.trim() ? (
          <button
            type="button"
            className="btn is-soft is-block"
            onClick={async () => {
              await addTask(userId, { title: fields.nextStep, dateKey: addDays(today, 1), top: true });
              toast(t("reflect.day.taskAdded"), "c-checklist");
            }}
          >
            <Glyph name="calendar" size={18} />
            {t("reflect.day.toTask")}
          </button>
        ) : null}
      </section>
      <div className="side-stack">
        <Art name="c-read-cup" className="reflect-art float" />
        {past.length ? (
          <Section title={t("reflect.history")}>
            <div className="history">
              {past.map((item) => (
                <article key={item.id} className="card history-item">
                  <p className="eyebrow">{formatKey(item.periodKey, localeOf(), { weekday: "long", day: "numeric", month: "long" })}</p>
                  {item.wentWell ? <p>🌱 {item.wentWell}</p> : null}
                  {item.wasHard ? <p>🌧 {item.wasHard}</p> : null}
                  {item.nextStep ? <p>👣 {item.nextStep}</p> : null}
                </article>
              ))}
            </div>
          </Section>
        ) : null}
      </div>
    </div>
  );
}

const moodWord = (score: number | null) => (score === null ? "—" : `${score.toFixed(1)}/5`);

function WeekReview({ userId }: { userId: string }) {
  const { t } = useTranslation();
  const prefs = usePrefs(userId);
  const today = dateKey();
  const keys = weekOf(today, prefs?.weekStart ?? "monday");
  const periodKey = isoWeekKey(keys[0]!);
  const { fields, set } = useReviewForm(userId, "week", periodKey);
  const stats = usePeriodStats(userId, keys[0]!, keys[6]!);
  return (
    <div className="two-col">
      <div className="side-stack">
        <Section title={t("reflect.week.numbers")}>
          <div className="stat-grid">
            <Stat value={`${Math.round((stats?.rate ?? 0) * 100)}%`} label={t("reflect.week.completion")} tone="mint" />
            <Stat value={stats?.tasksDone ?? 0} label={t("reflect.week.tasks")} tone="sky" />
            <Stat value={`${stats?.focusMinutes ?? 0}`} label={`${t("reflect.week.focus")}, ${t("common.min")}`} tone="pink" />
            <Stat value={moodWord(stats?.moodAvg ?? null)} label={t("reflect.week.mood")} tone="sun" />
          </div>
        </Section>
        {stats?.perHabit.length ? (
          <section className="card rise">
            {stats.perHabit.map((row) => (
              <div key={row.id} className="rate-row">
                <Tile name={row.icon} tone={row.tone as never} size={30} />
                <span>{row.name}</span>
                <Bar value={row.rate} tone={row.tone as never} height={6} />
                <b className="num">{Math.round(row.rate * 100)}%</b>
              </div>
            ))}
          </section>
        ) : null}
      </div>
      <section className="card reflect-card tone-mint rise">
        <div className="card-title">
          <h2 className="heading">{t("reflect.week.title")}</h2>
          <span className="tiny">
            {formatKey(keys[0]!, localeOf(), { day: "numeric", month: "short" })} – {formatKey(keys[6]!, localeOf(), { day: "numeric", month: "short" })}
          </span>
        </div>
        <Field label={`🏆 ${t("reflect.week.win")}`}>
          <TextArea value={fields.wentWell} onChange={(wentWell) => set({ wentWell })} placeholder={t("reflect.week.winPlaceholder")} rows={2} />
        </Field>
        <Field label={`🧱 ${t("reflect.week.hard")}`}>
          <TextArea value={fields.wasHard} onChange={(wasHard) => set({ wasHard })} rows={2} />
        </Field>
        <Field label={`🔧 ${t("reflect.week.adjust")}`}>
          <TextArea value={fields.nextStep} onChange={(nextStep) => set({ nextStep })} placeholder={t("reflect.week.adjustPlaceholder")} rows={2} />
        </Field>
        <SaveButton onSave={() => saveReview(userId, "week", periodKey, fields)} />
      </section>
    </div>
  );
}

function MonthReview({ userId }: { userId: string }) {
  const { t } = useTranslation();
  const today = dateKey();
  const keys = monthOf(today);
  const periodKey = today.slice(0, 7);
  const { fields, set } = useReviewForm(userId, "month", periodKey);
  const stats = usePeriodStats(userId, keys[0]!, keys.at(-1)!);
  const tree = useGoalTree(userId);
  const goals = flatten(tree ?? []).filter((goal) => !goal.parentId);
  const keep = fields.keep ?? [];
  const drop = fields.drop ?? [];
  const mark = (id: string, which: "keep" | "drop") => {
    set({ keep: which === "keep" ? [...keep.filter((item) => item !== id), id] : keep.filter((item) => item !== id), drop: which === "drop" ? [...drop.filter((item) => item !== id), id] : drop.filter((item) => item !== id) });
  };
  return (
    <div className="two-col">
      <div className="side-stack">
        <Section title={t("reflect.month.goals")}>
          <section className="card">
            {goals.length === 0 ? <p className="sub">{t("home.goalsEmpty")}</p> : null}
            {goals.map((goal) => (
              <div key={goal.id} className="rate-row">
                <Tile name={goal.icon} tone={goal.tone} size={30} />
                <span>{goal.title}</span>
                <Bar value={goal.progress} tone={goal.tone} height={6} />
                <b className="num">{Math.round(goal.progress * 100)}%</b>
              </div>
            ))}
          </section>
        </Section>
        <Section title={t("reflect.month.habits")}>
          <section className="card">
            {(stats?.perHabit ?? []).map((row) => (
              <div key={row.id} className="keep-row">
                <Tile name={row.icon} tone={row.tone as never} size={32} />
                <span className="row-copy">
                  <strong>{row.name}</strong>
                  <small>{Math.round(row.rate * 100)}%</small>
                </span>
                <button type="button" className={`chip ${keep.includes(row.id) ? "is-on" : ""}`} onClick={() => mark(row.id, "keep")}>
                  {t("reflect.month.keep")}
                </button>
                <button type="button" className={`chip is-coral ${drop.includes(row.id) ? "is-on" : ""}`} onClick={() => mark(row.id, "drop")}>
                  {t("reflect.month.drop")}
                </button>
              </div>
            ))}
            {drop.length ? (
              <>
                <p className="tiny">{t("reflect.month.dropHint")}</p>
                <button
                  type="button"
                  className="btn is-soft is-sm"
                  onClick={async () => {
                    for (const id of drop) await updateHabit(userId, id, { vacation: true });
                    toast(t("common.saved"), "c-sleep-cloud");
                  }}
                >
                  <Glyph name="pause" size={16} />
                  {t("reflect.month.pauseDropped")}
                </button>
              </>
            ) : null}
          </section>
        </Section>
      </div>
      <section className="card reflect-card tone-sun rise">
        <div className="card-title">
          <h2 className="heading">{t("reflect.month.title")}</h2>
          <span className="tiny">{formatKey(today, localeOf(), { month: "long", year: "numeric" })}</span>
        </div>
        <div className="mini-stats">
          <span>
            <Glyph name="sprout" size={16} /> {Math.round((stats?.rate ?? 0) * 100)}%
          </span>
          <span>
            <Glyph name="check" size={16} /> {stats?.tasksDone ?? 0}
          </span>
          <span>
            <Glyph name="flame" size={16} /> {Math.round((stats?.focusMinutes ?? 0) / 60)} {t("common.h")}
          </span>
        </div>
        <Field label={`✨ ${t("reflect.month.win")}`}>
          <TextArea value={fields.wentWell} onChange={(wentWell) => set({ wentWell })} rows={2} />
        </Field>
        <Field label={`📖 ${t("reflect.month.lesson")}`}>
          <TextArea value={fields.wasHard} onChange={(wasHard) => set({ wasHard })} rows={2} />
        </Field>
        <Field label={`🎯 ${t("reflect.month.focus")}`}>
          <TextArea value={fields.nextStep} onChange={(nextStep) => set({ nextStep })} rows={2} />
        </Field>
        <SaveButton onSave={() => saveReview(userId, "month", periodKey, fields)} />
      </section>
    </div>
  );
}

function Failures({ userId }: { userId: string }) {
  const { t } = useTranslation();
  const entries = useEntries(userId, ["failure"]);
  const [what, setWhat] = useState("");
  const [why, setWhy] = useState<string[]>([]);
  const [adjust, setAdjust] = useState("");
  return (
    <div className="two-col">
      <section className="card reflect-card tone-peach rise">
        <div className="card-title">
          <h2 className="heading">{t("reflect.failures.title")}</h2>
        </div>
        <p className="sub">{t("reflect.failures.sub")}</p>
        <Field label={t("reflect.failures.what")}>
          <TextIn value={what} onChange={setWhat} placeholder={t("reflect.failures.whatPlaceholder")} maxLength={160} />
        </Field>
        <Field label={t("reflect.failures.why")}>
          <div className="chips is-wrap">
            {failureReasons.map((reason) => (
              <button key={reason} type="button" className={`chip ${why.includes(reason) ? "is-on" : ""}`} onClick={() => setWhy(why.includes(reason) ? why.filter((item) => item !== reason) : [...why, reason])}>
                {t(`focus.reason.${reason}`)}
              </button>
            ))}
          </div>
        </Field>
        <Field label={t("reflect.failures.adjust")}>
          <TextArea value={adjust} onChange={setAdjust} placeholder={t("reflect.failures.adjustPlaceholder")} rows={2} />
        </Field>
        <button
          type="button"
          className="btn is-block"
          disabled={!what.trim()}
          onClick={async () => {
            await addEntry(userId, "failure", { body: what, tags: why, extra: adjust });
            setWhat("");
            setWhy([]);
            setAdjust("");
            toast(t("common.saved"), "c-hug-heart");
          }}
        >
          {t("reflect.failures.add")}
        </button>
      </section>
      <div className="side-stack">
        {entries && entries.length === 0 ? <Empty art="c-sit-calm" title={t("common.none")} body={t("reflect.failures.empty")} /> : null}
        {(entries ?? []).map((entry) => (
          <article key={entry.id} className="card log-item rise">
            <div className="card-title">
              <p className="eyebrow">{formatKey(entry.dateKey, localeOf(), { day: "numeric", month: "long" })}</p>
              <IconButton glyph="close" label={t("common.delete")} onClick={() => void removeEntry(userId, entry.id)} />
            </div>
            <strong>{entry.body}</strong>
            {entry.tags?.length ? (
              <div className="tag-row">
                {entry.tags.map((tag) => (
                  <span key={tag} className="pill is-sun">
                    {t(`focus.reason.${tag}`)}
                  </span>
                ))}
              </div>
            ) : null}
            {entry.extra ? (
              <p className="log-adjust">
                <Glyph name="sparkle" size={16} /> {entry.extra}
              </p>
            ) : null}
          </article>
        ))}
      </div>
    </div>
  );
}

function Journal({ userId }: { userId: string }) {
  const { t } = useTranslation();
  const entries = useEntries(userId, ["journal", "gratitude", "reflection"]);
  const prompts = t("reflect.journal.prompts", { returnObjects: true }) as string[];
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [prompt, setPrompt] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const list = (entries ?? []).filter((entry) => !query.trim() || `${entry.title ?? ""} ${entry.body}`.toLowerCase().includes(query.toLowerCase()));
  return (
    <div className="two-col">
      <section className="card journal-card rise">
        <div className="lock-note">
          <Glyph name="lock" size={16} />
          {t("reflect.journal.lock")}
        </div>
        {prompt ? <p className="prompt">“{prompt}”</p> : null}
        <span className="input">
          <input value={title} placeholder={t("reflect.journal.titlePlaceholder")} maxLength={80} onChange={(event) => setTitle(event.target.value)} />
        </span>
        <TextArea value={body} onChange={setBody} placeholder={t("reflect.journal.placeholder")} rows={7} maxLength={10000} />
        <div className="btn-row">
          <button type="button" className="btn is-soft is-sm" onClick={() => setPrompt(prompts[Math.floor(Math.random() * prompts.length)] ?? null)}>
            <Glyph name="sparkle" size={18} />
            {t("reflect.journal.prompt")}
          </button>
          <button
            type="button"
            className="btn is-sm is-grow"
            disabled={!body.trim()}
            onClick={async () => {
              await addEntry(userId, "journal", { body, title: title || prompt || null });
              setBody("");
              setTitle("");
              setPrompt(null);
              haptic(8);
              toast(t("common.saved"), "o-journal");
            }}
          >
            {t("reflect.journal.add")}
          </button>
        </div>
      </section>
      <div className="side-stack">
        {entries && entries.length > 3 ? (
          <span className="input">
            <Glyph name="search" size={18} />
            <input value={query} placeholder={t("reflect.journal.search")} onChange={(event) => setQuery(event.target.value)} />
          </span>
        ) : null}
        {entries && entries.length === 0 ? <Empty art="o-notebook" title={t("reflect.journal.title")} body={t("reflect.journal.empty")} /> : null}
        {list.map((entry) => (
          <article key={entry.id} className={`card journal-entry rise ${open === entry.id ? "is-open" : ""}`} onClick={() => setOpen(open === entry.id ? null : entry.id)}>
            <div className="card-title">
              <p className="eyebrow">{new Intl.DateTimeFormat(localeOf(), { weekday: "short", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(entry.createdAt))}</p>
              <IconButton
                glyph="trash"
                label={t("common.delete")}
                onClick={() => {
                  void removeEntry(userId, entry.id);
                }}
              />
            </div>
            {entry.title ? <strong>{entry.title}</strong> : null}
            <p>{entry.body}</p>
          </article>
        ))}
      </div>
    </div>
  );
}
