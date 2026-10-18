import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { moodScore, periodStarts, saveDay, stressSources, useAllDays, useDay, useDays, type DayPatch } from "@/entities/day";
import { usePrefs } from "@/entities/prefs";
import { useUser } from "@/entities/session";
import type { Day } from "@/shared/db";
import { localeOf } from "@/shared/i18n";
import { moodArt } from "@/shared/lib/art/look";
import { addDays, dateKey, daysBetween, formatKey, monthOf, weekdayOf } from "@/shared/lib/date";
import { useIntent } from "@/shared/lib/intent";
import { haptic, pop } from "@/shared/lib/motion/fx";
import { EnergyPicker, MoodPicker, PageHead, Section, Tabs } from "@/shared/ui/bloom";
import { Columns, Line } from "@/shared/ui/charts";
import { Glyph } from "@/shared/ui/glyph";
import { Art, Tile, at, toast } from "@/shared/ui/kit";
import { Sheet } from "@/shared/ui/sheet";
import { Tour } from "@/widgets/tour/tour";

/** Text that saves itself shortly after typing stops. */
function useAutosave(initial: string, save: (value: string) => void) {
  const [value, setValue] = useState(initial);
  const dirty = useRef(false);
  const latest = useRef(save);
  latest.current = save;
  useEffect(() => {
    if (!dirty.current) setValue(initial);
  }, [initial]);
  useEffect(() => {
    if (!dirty.current) return;
    const timer = window.setTimeout(() => {
      latest.current(value);
      dirty.current = false;
    }, 700);
    return () => window.clearTimeout(timer);
  }, [value]);
  return [value, (next: string) => {
    dirty.current = true;
    setValue(next);
  }] as const;
}

export function BodyPage() {
  const { t } = useTranslation();
  const user = useUser();
  const [tab, setTab] = useState<"today" | "history">("today");
  useIntent("mood", () => {
    setTab("today");
    document.getElementById("mood")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  useIntent("good", () => {
    setTab("today");
    window.setTimeout(() => document.getElementById("good")?.scrollIntoView({ behavior: "smooth", block: "start" }), 200);
  });
  return (
    <div className="page">
      <PageHead title={t("body.title")} sub={t("body.sub")} art="i-lotus" help="body" back />
      <Tabs
        tour="body-tabs"
        value={tab}
        onChange={setTab}
        options={[
          { id: "today", label: t("body.tabToday") },
          { id: "history", label: t("body.tabHistory") },
        ]}
      />
      {tab === "today" ? <TodayBody userId={user.id} /> : <History userId={user.id} />}
      <Tour id="body" />
    </div>
  );
}

function TodayBody({ userId }: { userId: string }) {
  const { t } = useTranslation();
  const day = useDay(userId);
  const prefs = usePrefs(userId);
  const [breath, setBreath] = useState(false);
  if (day === undefined || !prefs) return null;
  const patch = (value: DayPatch) => void saveDay(userId, value);
  return (
    <div className="two-col">
      <div className="side-stack">
        <section id="mood" data-tour="body-mood" className="card rise" style={at(1)}>
          <div className="card-title">
            <h2 className="heading">{t("body.mood")}</h2>
          </div>
          <MoodPicker value={day?.mood} onPick={(mood) => patch({ mood })} />
          {day?.mood ? (
            <div className="mood-note">
              <Art name={moodArt[day.mood]} />
              <span>{t(`body.moodLine.${day.mood}`)}</span>
              {day.mood === "anxious" || day.mood === "sad" || day.mood === "tired" ? (
                <button type="button" className="link" onClick={() => setBreath(true)}>
                  {t("body.breath")}
                </button>
              ) : null}
            </div>
          ) : null}
          <div className="sub-block" data-tour="body-energy">
            <span className="field-label">{t("body.energy")}</span>
            <EnergyPicker value={day?.energy} onPick={(energy) => patch({ energy })} />
          </div>
          <div className="sub-block" data-tour="body-stress">
            <span className="field-label">{t("body.stress")}</span>
            <div className="chips is-wrap">
              {stressSources.map((source) => {
                const on = (day?.stress ?? []).includes(source);
                return (
                  <button
                    key={source}
                    type="button"
                    className={`chip ${on ? "is-on" : ""}`}
                    onClick={() => patch({ stress: on ? (day?.stress ?? []).filter((item) => item !== source) : [...(day?.stress ?? []), source] })}
                  >
                    {t(`body.stressSources.${source}`)}
                  </button>
                );
              })}
            </div>
          </div>
          <NoteField userId={userId} day={day} />
        </section>

        <GoodThings userId={userId} day={day} />

        <button type="button" data-tour="body-breath" className="card breath-card tone-sky pressable rise" onClick={() => setBreath(true)}>
          <Art name="s-meditate" className="breath-bg" />
          <span>
            <strong className="heading">{t("body.breath")}</strong>
            <small>{t("body.breathBody")}</small>
          </span>
          <span className="chev-bubble">
            <Glyph name="play" size={16} />
          </span>
        </button>
      </div>

      <div className="side-stack">
        <Section title={t("body.bodyTitle")}>
          <div className="trackers" data-tour="body-trackers">
            <Tracker art="i-zzz" tone="lav" title={t("body.sleep")} value={day?.sleepHours != null ? `${day.sleepHours} ${t("body.sleepUnit")}` : "—"} hint={t("body.sleepGoal", { hours: prefs.sleepGoal })}>
              <Plus label="−" onClick={() => patch({ sleepHours: Math.max(0, (day?.sleepHours ?? prefs.sleepGoal) - 0.5) })} />
              <Plus label="+" onClick={() => patch({ sleepHours: Math.min(16, (day?.sleepHours ?? prefs.sleepGoal - 0.5) + 0.5) })} />
            </Tracker>
            <section className="card tracker is-wide tone-sky rise">
              <div className="tracker-head">
                <Tile name="i-drop" size={38} />
                <span>
                  <strong>{t("body.water")}</strong>
                  <small>
                    {day?.water ?? 0}/{prefs.waterGoal} {t("body.waterUnit")}
                  </small>
                </span>
              </div>
              <div className="glasses">
                {Array.from({ length: Math.max(prefs.waterGoal, day?.water ?? 0) }, (_, index) => {
                  const full = index < (day?.water ?? 0);
                  return (
                    <button
                      key={index}
                      type="button"
                      aria-label={`${index + 1}`}
                      className={`glass ${full ? "is-full" : ""}`}
                      onClick={(event) => {
                        pop(event.currentTarget, 1.2);
                        haptic(5);
                        const next = full && index + 1 === day?.water ? index : index + 1;
                        patch({ water: next });
                        if (next === prefs.waterGoal) toast(t("body.saved"), "s-drop-cup");
                      }}
                    >
                      <Glyph name="water" size={22} fill={full} />
                    </button>
                  );
                })}
                <button type="button" className="glass is-add" aria-label="+" onClick={() => patch({ water: (day?.water ?? 0) + 1 })}>
                  <Glyph name="plus" size={18} stroke={2.6} />
                </button>
              </div>
            </section>
            <Tracker art="i-shoe" tone="pink" title={t("body.move")} value={`${day?.moveMinutes ?? 0} ${t("body.moveUnit")}`}>
              <Plus label="−" onClick={() => patch({ moveMinutes: Math.max(0, (day?.moveMinutes ?? 0) - 5) })} />
              <Plus label="+5" onClick={() => patch({ moveMinutes: (day?.moveMinutes ?? 0) + 5 })} />
              <Plus label="+15" onClick={() => patch({ moveMinutes: (day?.moveMinutes ?? 0) + 15 })} />
            </Tracker>
            <FoodTracker userId={userId} day={day} />
            <WeightTracker userId={userId} day={day} imperial={prefs.units === "imperial"} />
            <CycleTracker userId={userId} day={day} cycleLength={prefs.cycleLength} />
          </div>
        </Section>
      </div>
      <BreathSheet open={breath} onClose={() => setBreath(false)} />
    </div>
  );
}

function Plus({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className="mini-btn"
      onClick={(event) => {
        pop(event.currentTarget, 1.15);
        haptic(5);
        onClick();
      }}
    >
      {label}
    </button>
  );
}

function Tracker({ art, tone, title, value, hint, children }: { art: string; tone: string; title: string; value: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className={`card tracker tone-${tone} rise`}>
      <div className="tracker-head">
        <Tile name={art} size={38} />
        <span>
          <strong>{title}</strong>
          {hint ? <small>{hint}</small> : null}
        </span>
      </div>
      <b className="num tracker-value">{value}</b>
      <div className="tracker-actions">{children}</div>
    </section>
  );
}

function NoteField({ userId, day }: { userId: string; day: Day | null }) {
  const { t } = useTranslation();
  const [note, setNote] = useAutosave(day?.note ?? "", (value) => void saveDay(userId, { note: value.trim() || null }));
  return (
    <label className="field sub-block">
      <span className="field-label">
        <Glyph name="lock" size={14} /> {t("body.note")}
      </span>
      <span className="input is-area">
        <textarea rows={2} value={note} placeholder={t("body.notePlaceholder")} onChange={(event) => setNote(event.target.value)} maxLength={1000} />
      </span>
    </label>
  );
}

function GoodThings({ userId, day }: { userId: string; day: Day | null }) {
  const { t } = useTranslation();
  const placeholders = t("body.goodPlaceholders", { returnObjects: true }) as string[];
  const good = day?.good ?? ["", "", ""];
  const [joined, setJoined] = useAutosave(JSON.stringify([good[0] ?? "", good[1] ?? "", good[2] ?? ""]), (value) => void saveDay(userId, { good: JSON.parse(value) as string[] }));
  const lines = JSON.parse(joined) as string[];
  const [win, setWin] = useAutosave(day?.win ?? "", (value) => void saveDay(userId, { win: value.trim() || null }));
  return (
    <section id="good" data-tour="body-good" className="card good-card tone-sun rise">
      <div className="card-title">
        <h2 className="heading">{t("body.goodTitle")}</h2>
        <Art name="c-hug-big-heart" className="good-art" />
      </div>
      <span className="field-label">{t("body.good")}</span>
      <div className="good-lines">
        {[0, 1, 2].map((index) => (
          <span key={index} className="input">
            <b className="good-num">{index + 1}</b>
            <input
              value={lines[index] ?? ""}
              placeholder={placeholders[index]}
              maxLength={140}
              onChange={(event) => {
                const next = lines.slice();
                next[index] = event.target.value;
                setJoined(JSON.stringify(next));
              }}
            />
          </span>
        ))}
      </div>
      <span className="field-label">🏆 {t("body.win")}</span>
      <span className="input">
        <input value={win} placeholder={t("body.winPlaceholder")} maxLength={160} onChange={(event) => setWin(event.target.value)} />
      </span>
    </section>
  );
}

function FoodTracker({ userId, day }: { userId: string; day: Day | null }) {
  const { t } = useTranslation();
  const [food, setFood] = useAutosave(day?.food ?? "", (value) => void saveDay(userId, { food: value.trim() || null }));
  return (
    <section className="card tracker is-wide tone-mint rise">
      <div className="tracker-head">
        <Tile name="i-food" size={38} />
        <span>
          <strong>{t("body.food")}</strong>
          <small>{t("body.meals")}</small>
        </span>
        <div className="meal-dots">
          {[1, 2, 3].map((meal) => (
            <button key={meal} type="button" aria-label={`${meal}`} className={`meal ${(day?.meals ?? 0) >= meal ? "is-on" : ""}`} onClick={() => void saveDay(userId, { meals: day?.meals === meal ? meal - 1 : meal })}>
              <Glyph name="check" size={14} stroke={3} />
            </button>
          ))}
        </div>
      </div>
      <span className="input">
        <input value={food} placeholder={t("body.foodPlaceholder")} maxLength={200} onChange={(event) => setFood(event.target.value)} />
      </span>
    </section>
  );
}

function WeightTracker({ userId, day, imperial }: { userId: string; day: Day | null; imperial: boolean }) {
  const { t } = useTranslation();
  const unit = imperial ? t("body.lb") : t("body.kg");
  const shown = day?.weightKg ? String(Math.round((imperial ? day.weightKg * 2.20462 : day.weightKg) * 10) / 10) : "";
  const [value, setValue] = useAutosave(shown, (next) => {
    const number = Number(next.replace(",", "."));
    void saveDay(userId, { weightKg: number > 0 ? (imperial ? number / 2.20462 : number) : null });
  });
  return (
    <section className="card tracker tone-peach rise">
      <div className="tracker-head">
        <Tile name="i-heart" size={38} />
        <span>
          <strong>{t("body.weight")}</strong>
          <small>{unit}</small>
        </span>
      </div>
      <span className="input is-num">
        <input inputMode="decimal" value={value} placeholder={t("body.weightPlaceholder")} onChange={(event) => setValue(event.target.value)} />
        <b>{unit}</b>
      </span>
    </section>
  );
}

function CycleTracker({ userId, day, cycleLength }: { userId: string; day: Day | null; cycleLength: number }) {
  const { t } = useTranslation();
  const all = useAllDays(userId);
  const flow = t("body.flow", { returnObjects: true }) as string[];
  const starts = periodStarts(all ?? []);
  const last = starts.at(-1);
  const today = dateKey();
  const cycleDay = last ? daysBetween(last, today) + 1 : null;
  const next = last ? daysBetween(today, addDays(last, cycleLength)) : null;
  return (
    <section className="card tracker is-wide tone-pink rise">
      <div className="tracker-head">
        <Tile name="i-flower" size={38} />
        <span>
          <strong>{t("body.period")}</strong>
          <small>{cycleDay ? `${t("body.cycleDay", { day: cycleDay })}${next !== null && next > 0 ? ` · ${t("body.nextPeriod", { days: next })}` : ""}` : t("body.cycleUnknown")}</small>
        </span>
      </div>
      <div className="chips is-wrap">
        {flow.map((label, index) => (
          <button key={label} type="button" className={`chip ${(day?.period ?? 0) === index ? "is-on" : ""}`} onClick={() => void saveDay(userId, { period: index })}>
            {label}
          </button>
        ))}
      </div>
    </section>
  );
}

function History({ userId }: { userId: string }) {
  const { t } = useTranslation();
  const today = dateKey();
  const month = monthOf(today);
  const monthDays = useDays(userId, month[0]!, month.at(-1)!);
  const recent = useDays(userId, addDays(today, -13), today);
  const weights = useDays(userId, addDays(today, -59), today);
  const weekdays = t("common.weekdays", { returnObjects: true }) as string[];
  const labels = t("body.energyLevels", { returnObjects: true }) as string[];
  if (!monthDays || !recent || !weights) return null;
  const lead = weekdayOf(month[0]!);
  const short = (key: string) => key.slice(8).replace(/^0/, "");
  const full = (key: string) => formatKey(key, localeOf(), { weekday: "short", day: "numeric", month: "short" });
  const hasAny = recent.some((item) => item.day);
  const weightPoints = weights.filter((item) => item.day?.weightKg);
  return (
    <div className="two-col">
      <section className="card rise">
        <div className="card-title">
          <h2 className="heading">{t("body.history")}</h2>
          <span className="tiny">{formatKey(today, localeOf(), { month: "long", year: "numeric" })}</span>
        </div>
        <div className="mood-cal">
          {weekdays.map((name) => (
            <span key={name} className="mood-cal-head">
              {name}
            </span>
          ))}
          {Array.from({ length: lead }, (_, index) => (
            <span key={`pad-${index}`} />
          ))}
          {monthDays.map(({ key, day }) => (
            <span key={key} className={`mood-cal-day ${key === today ? "is-today" : ""} ${key > today ? "is-future" : ""}`} title={day?.mood ? t(`body.moods.${day.mood}`) : full(key)}>
              {day?.mood ? <Art name={moodArt[day.mood]} /> : <i>{short(key)}</i>}
            </span>
          ))}
        </div>
      </section>
      <div className="side-stack">
        {!hasAny ? <p className="sub card-note">{t("body.noData")}</p> : null}
        <section className="card rise">
          <div className="card-title">
            <h2 className="heading">{t("body.energyTrend")}</h2>
          </div>
          <Line data={recent.map(({ key, day }) => ({ label: short(key), value: day?.energy ?? null, title: full(key) }))} min={1} max={5} format={(value) => `${value} · ${labels[value - 1]}`} color="var(--lav)" />
        </section>
        <section className="card rise">
          <div className="card-title">
            <h2 className="heading">{t("body.sleepTrend")}</h2>
          </div>
          <Columns data={recent.map(({ key, day }) => ({ label: short(key), value: day?.sleepHours ?? null, title: full(key) }))} max={12} format={(value) => `${value} ${t("body.sleepUnit")}`} color="var(--sky)" />
        </section>
        <section className="card rise">
          <div className="card-title">
            <h2 className="heading">{t("stats.moodTrend")}</h2>
          </div>
          <Line
            data={recent.map(({ key, day }) => ({ label: short(key), value: day?.mood ? moodScore[day.mood] : null, title: full(key) }))}
            min={1}
            max={5}
            format={(value) => `${value}/5`}
            color="var(--sun-600)"
          />
        </section>
        {weightPoints.length >= 2 ? (
          <section className="card rise">
            <div className="card-title">
              <h2 className="heading">{t("body.weightTrend")}</h2>
            </div>
            <Line
              data={weightPoints.map(({ key, day }) => ({ label: short(key), value: Math.round(day!.weightKg! * 10) / 10, title: full(key) }))}
              min={Math.floor(Math.min(...weightPoints.map((item) => item.day!.weightKg!)) - 1)}
              max={Math.ceil(Math.max(...weightPoints.map((item) => item.day!.weightKg!)) + 1)}
              format={(value) => `${value} ${t("body.kg")}`}
              color="var(--peach)"
            />
          </section>
        ) : null}
      </div>
    </div>
  );
}

const phases = [
  { key: "breathIn", seconds: 4 },
  { key: "breathHold", seconds: 2 },
  { key: "breathOut", seconds: 6 },
] as const;

function BreathSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const [step, setStep] = useState(0);
  const [running, setRunning] = useState(false);
  const rounds = 5;
  useEffect(() => {
    if (!open) {
      setRunning(false);
      setStep(0);
    }
  }, [open]);
  useEffect(() => {
    if (!running) return;
    if (step >= rounds * phases.length) {
      setRunning(false);
      haptic([10, 60, 10]);
      return;
    }
    const phase = phases[step % phases.length]!;
    const timer = window.setTimeout(() => {
      setStep(step + 1);
      haptic(5);
    }, phase.seconds * 1000);
    return () => window.clearTimeout(timer);
  }, [running, step]);
  const phase = phases[step % phases.length]!;
  const finished = !running && step >= rounds * phases.length;
  return (
    <Sheet open={open} title={t("body.breath")} closeLabel={t("common.done")} onClose={onClose}>
      <div className="breath">
        <div className={`breath-orb ${running ? `is-${phase.key}` : ""}`} style={{ "--phase": `${phase.seconds}s` } as CSSProperties}>
          <span className="breath-wave" />
          <span className="breath-wave is-2" />
          <span className="breath-core">
            <Art name={finished ? "c-flower-arms" : "c-sit-eyes-closed"} eager />
          </span>
        </div>
        <p className="heading center">{finished ? t("body.breathDone") : running ? t(`body.${phase.key}`) : t("body.breathBody")}</p>
        {running ? (
          <p className="sub center">
            {Math.floor(step / phases.length) + 1}/{rounds}
          </p>
        ) : null}
        <button
          type="button"
          className="btn is-block"
          onClick={() => {
            if (running) {
              setRunning(false);
              setStep(0);
            } else {
              setStep(0);
              setRunning(true);
            }
          }}
        >
          {running ? t("common.cancel") : t("body.breathStart")}
        </button>
      </div>
    </Sheet>
  );
}
