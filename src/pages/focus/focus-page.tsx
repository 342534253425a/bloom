import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { cancelFocus, completeFocus, pauseFocus, resumeFocus, startFocus, useFocusClock, useFocusStats } from "@/entities/focus";
import { addEntry, avoidReasons, removeEntry, useEntries } from "@/entities/journal";
import { savePrefs, usePrefs } from "@/entities/prefs";
import { useUser } from "@/entities/session";
import { toggleTask, useTasksOn } from "@/entities/task";
import { localeOf } from "@/shared/i18n";
import { dateKey, formatClock, formatKey } from "@/shared/lib/date";
import { useIntent } from "@/shared/lib/intent";
import { burst, haptic } from "@/shared/lib/motion/fx";
import { Field, IconButton, PageHead, Section, Stat, TextIn } from "@/shared/ui/bloom";
import { Columns } from "@/shared/ui/charts";
import { Glyph } from "@/shared/ui/glyph";
import { Art, Stepper, at, toast } from "@/shared/ui/kit";
import { Sheet } from "@/shared/ui/sheet";
import { alreadySent, markSent, notify } from "@/entities/notify";
import { getPrefs } from "@/entities/prefs";
import { Tour } from "@/widgets/tour/tour";
import { useCouple, useItem, type FocusData } from "@/entities/couple";
import { SharedFocusStage } from "@/features/couple/shared-focus";
import { Toggle } from "@/shared/ui/kit";

const presets = [
  { id: "25", focus: 25, rest: 5 },
  { id: "50", focus: 50, rest: 10 },
  { id: "15", focus: 15, rest: 3 },
] as const;

export function FocusPage() {
  const { t } = useTranslation();
  const user = useUser();
  const prefs = usePrefs(user.id);
  const { focus, remaining, finished, clearFinished } = useFocusClock(user.id);
  const stats = useFocusStats(user.id, 7);
  const tasks = useTasksOn(user.id, dateKey());
  const [label, setLabel] = useState("");
  const [taskId, setTaskId] = useState<string | null>(null);
  const [custom, setCustom] = useState(false);
  const [pOpen, setPOpen] = useState(false);
  const ring = useRef<HTMLDivElement>(null);
  useIntent("procrastinate", () => setPOpen(true));
  const couple = useCouple();
  const sharedItem = useItem<FocusData>("focus");
  const sharedRunning = Boolean(sharedItem && sharedItem.data.phase !== "idle");
  const [sharedWanted, setSharedWanted] = useState(() => sessionStorage.getItem("bloom.focusShared") === "1");
  const sharedOn = Boolean(couple.partner) && (sharedWanted || sharedRunning);

  const focusMin = prefs?.focusMinutes ?? 25;
  const breakMin = prefs?.breakMinutes ?? 5;
  const presetId = presets.find((preset) => preset.focus === focusMin && preset.rest === breakMin)?.id ?? "custom";

  useEffect(() => {
    const pending = sessionStorage.getItem("bloom.focusTask");
    if (!pending || !tasks) return;
    sessionStorage.removeItem("bloom.focusTask");
    const task = tasks.find((item) => item.id === pending);
    if (task) {
      setTaskId(task.id);
      setLabel(task.title);
    }
  }, [tasks]);

  useEffect(() => {
    if (!finished) return;
    burst(ring.current, { count: 30, spread: 140 });
    haptic([10, 60, 10, 60, 14]);
    const isBreak = finished.kind === "break";
    const text = isBreak ? t("focus.breakOver") : t("focus.finishedBody", { minutes: Math.round(finished.plannedSec / 60) });
    toast(text, isBreak ? "c-wave-sun" : "c-arms-up");
    if (!alreadySent(user.id, "focusEnd", finished.id)) {
      markSent(user.id, "focusEnd", finished.id);
      void getPrefs(user.id).then((prefs) => notify({ userId: user.id, prefs, kind: "focusEnd", title: t("focus.notify"), body: text, urgent: true, silentInApp: true }));
    }
  }, [finished, t, user.id]);

  const running = focus?.status === "running";
  const paused = focus?.status === "paused";
  const isBreak = (focus?.kind ?? finished?.kind) === "break";
  const total = (focus?.plannedSec ?? focusMin * 60) * 1000;
  const shown = focus ? remaining : focusMin * 60 * 1000;
  const progress = focus ? 1 - remaining / total : 0;
  const size = 260;
  const stroke = 14;
  const radius = (size - stroke) / 2;
  const length = 2 * Math.PI * radius;
  const weekdays = t("common.weekdays", { returnObjects: true }) as string[];
  const openTasks = (tasks ?? []).filter((task) => !task.done);
  const justFinishedFocus = !focus && finished && finished.kind !== "break";

  return (
    <div className="page">
      <PageHead title={t("focus.title")} sub={t("focus.sub")} art="i-flame" help="focus" back />

      <div className="two-col">
        <div className="side-stack">
        {couple.partner ? (
          <div className="card shared-toggle rise">
            <span className="shared-toggle-icon">👥</span>
            <span className="row-copy">
              <strong>{t("couple.focus.share", { name: couple.partner.name || "♥" })}</strong>
              <small>{t("couple.focus.shareBody")}</small>
            </span>
            <Toggle
              on={sharedOn}
              label={t("couple.focus.share", { name: couple.partner.name || "♥" })}
              onChange={(on) => {
                setSharedWanted(on);
                sessionStorage.setItem("bloom.focusShared", on ? "1" : "0");
              }}
            />
          </div>
        ) : null}
        {sharedOn ? (
          <SharedFocusStage userId={user.id} />
        ) : (
        <section className={`card focus-stage rise ${isBreak ? "is-break" : ""} ${running ? "is-running" : ""}`} style={at(1)}>
          {!focus ? (
            <div className="chips is-center" data-tour="focus-presets">
              {presets.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className={`chip ${presetId === preset.id && !custom ? "is-on" : ""}`}
                  onClick={() => {
                    setCustom(false);
                    void savePrefs(user.id, { focusMinutes: preset.focus, breakMinutes: preset.rest });
                  }}
                >
                  {preset.focus}/{preset.rest}
                </button>
              ))}
              <button type="button" className={`chip ${custom || presetId === "custom" ? "is-on" : ""}`} onClick={() => setCustom(!custom)}>
                {t("focus.custom")}
              </button>
            </div>
          ) : (
            <span className={`pill ${isBreak ? "is-sky" : "is-pink"}`}>{isBreak ? t("focus.break") : t("focus.focus")}</span>
          )}

          {custom && !focus ? (
            <div className="custom-time">
              <div className="field-row">
                <span className="field-label">{t("focus.minutes")}</span>
                <Stepper value={focusMin} min={5} max={120} label={t("focus.minutes")} onChange={(value) => void savePrefs(user.id, { focusMinutes: value })} />
              </div>
              <div className="field-row">
                <span className="field-label">{t("focus.breakMinutes")}</span>
                <Stepper value={breakMin} min={1} max={30} label={t("focus.breakMinutes")} onChange={(value) => void savePrefs(user.id, { breakMinutes: value })} />
              </div>
            </div>
          ) : null}

          <div className="timer" data-tour="focus-timer" ref={ring} style={{ width: size, height: size }}>
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
              <circle cx={size / 2} cy={size / 2} r={radius} className="timer-track" strokeWidth={stroke} />
              <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                className="timer-value"
                strokeWidth={stroke}
                strokeDasharray={length}
                strokeDashoffset={length * (1 - progress)}
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
              />
            </svg>
            <div className="timer-center">
              <Art name={isBreak ? "c-mug" : running ? "c-headphones" : paused ? "c-sit-calm" : "c-laptop"} className={`timer-art ${running ? "float" : ""}`} eager />
              <strong className="num timer-time">{formatClock(shown)}</strong>
              {focus?.label ? <small className="timer-label">{focus.label}</small> : null}
            </div>
          </div>

          <p className="sub center">{running ? (isBreak ? t("focus.breathe") : t("focus.running")) : paused ? t("focus.paused") : justFinishedFocus ? t("focus.finishedTitle") : t("focus.sub")}</p>

          {!focus ? (
            <div className="focus-setup" data-tour="focus-setup">
              <Field label={t("focus.label")}>
                <TextIn
                  value={label}
                  onChange={(value) => {
                    setLabel(value);
                    setTaskId(null);
                  }}
                  placeholder={t("focus.labelPlaceholder")}
                  maxLength={80}
                />
              </Field>
              {openTasks.length ? (
                <div className="chips">
                  <span className="tiny chips-label">{t("focus.pickTask")}:</span>
                  {openTasks.slice(0, 8).map((task) => (
                    <button
                      key={task.id}
                      type="button"
                      className={`chip ${taskId === task.id ? "is-on" : ""}`}
                      onClick={() => {
                        setTaskId(task.id);
                        setLabel(task.title);
                      }}
                    >
                      {task.top ? "★ " : ""}
                      {task.title}
                    </button>
                  ))}
                </div>
              ) : null}
              <div className="btn-row">
                <button
                  type="button"
                  className="btn is-pink is-grow"
                  onClick={() => {
                    clearFinished();
                    haptic(10);
                    void startFocus(user.id, { minutes: focusMin, label, taskId });
                  }}
                >
                  <Glyph name="play" size={20} />
                  {t("focus.start")} · {focusMin} {t("common.min")}
                </button>
                {justFinishedFocus ? (
                  <button
                    type="button"
                    className="btn is-soft"
                    onClick={() => {
                      clearFinished();
                      void startFocus(user.id, { minutes: breakMin, kind: "break" });
                    }}
                  >
                    <Glyph name="sun" size={18} />
                    {t("focus.startBreak")} · {breakMin}
                  </button>
                ) : null}
              </div>
              {justFinishedFocus && finished?.taskId && openTasks.some((task) => task.id === finished.taskId) ? (
                <button
                  type="button"
                  className="btn is-soft is-block"
                  onClick={() => {
                    void toggleTask(user.id, finished.taskId!);
                    clearFinished();
                    toast(t("tasks.allDone"), "c-checklist");
                  }}
                >
                  <Glyph name="check" size={18} stroke={2.6} />
                  {t("tasks.done")}: {finished.label}
                </button>
              ) : null}
            </div>
          ) : (
            <div className="btn-row is-center">
              {running ? (
                <button type="button" className="btn is-soft" onClick={() => void pauseFocus(focus)}>
                  <Glyph name="pause" size={20} stroke={2.6} />
                  {t("focus.pause")}
                </button>
              ) : (
                <button type="button" className="btn is-pink" onClick={() => void resumeFocus(focus)}>
                  <Glyph name="play" size={20} />
                  {t("focus.resume")}
                </button>
              )}
              <button type="button" className="btn is-soft" onClick={() => void completeFocus(focus)}>
                <Glyph name="check" size={20} stroke={2.6} />
                {t("focus.finish")}
              </button>
              <IconButton glyph="close" label={t("focus.cancel")} onClick={() => void cancelFocus(focus)} />
            </div>
          )}
        </section>
        )}
        </div>

        <div className="side-stack">
          <div className="stat-grid is-3" data-tour="focus-stats">
            <Stat value={stats?.today.minutes ?? 0} label={`${t("common.min")} · ${t("focus.today").toLowerCase()}`} tone="pink" />
            <Stat value={stats?.today.sessions ?? 0} label={t("focus.sessions")} tone="lav" />
            <Stat value={Math.round((stats?.totalMinutes ?? 0) / 60)} label={`${t("common.h")} · ${t("focus.total").toLowerCase()}`} tone="sun" />
          </div>
          <section className="card rise">
            <div className="card-title">
              <h2 className="heading">{t("focus.week")}</h2>
              <span className="tiny">{t("stats.focusTrend")}</span>
            </div>
            <Columns
              data={(stats?.span ?? []).map((day) => ({
                label: weekdays[(new Date(`${day.key}T12:00:00`).getDay() + 6) % 7]!,
                value: day.minutes,
                title: formatKey(day.key, localeOf(), { weekday: "long", day: "numeric", month: "short" }),
              }))}
              format={(value) => `${value} ${t("common.min")}`}
              highlight={6}
              color="var(--pink)"
            />
          </section>

          <button type="button" data-tour="focus-procr" className="card procr-card tone-peach pressable rise" onClick={() => setPOpen(true)}>
            <Art name="c-frown" className="procr-art" />
            <span>
              <strong className="heading">{t("focus.procrastinate")}</strong>
              <small>{t("focus.procrastinateHint")}</small>
            </span>
            <span className="chev-bubble">
              <Glyph name="chevron" size={18} stroke={2.4} />
            </span>
          </button>

          <ProcrastinationList userId={user.id} />

          {stats?.recent.length ? (
            <Section title={t("focus.recent")}>
              <div className="card rows">
                {stats.recent.slice(0, 6).map((session) => (
                  <div key={session.id} className="row is-compact">
                    <Art name="i-flame" className="row-icon" />
                    <span className="row-copy">
                      <strong>{session.label || t("focus.untitled")}</strong>
                      <small>{new Intl.DateTimeFormat(localeOf(), { weekday: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(session.startedAt))}</small>
                    </span>
                    <b className="num">
                      {Math.round(session.plannedSec / 60)} {t("common.min")}
                    </b>
                  </div>
                ))}
              </div>
            </Section>
          ) : null}
        </div>
      </div>

      <Tour id="focus" />
      <ProcrastinationSheet open={pOpen} onClose={() => setPOpen(false)} userId={user.id} onStart={(step) => void startFocus(user.id, { minutes: 5, label: step })} />
    </div>
  );
}

function ProcrastinationList({ userId }: { userId: string }) {
  const { t } = useTranslation();
  const entries = useEntries(userId, ["procrastination"]);
  if (!entries?.length) return null;
  return (
    <Section title={t("focus.pTitle")}>
      <div className="card rows">
        {entries.slice(0, 5).map((entry) => (
          <div key={entry.id} className="row is-compact">
            <span className="row-copy">
              <strong>{entry.body}</strong>
              <small>
                {(entry.tags ?? []).map((tag) => t(`focus.reason.${tag}`)).join(", ")}
                {entry.extra ? ` → ${entry.extra}` : ""}
              </small>
            </span>
            <IconButton glyph="close" label={t("common.delete")} onClick={() => void removeEntry(userId, entry.id)} />
          </div>
        ))}
      </div>
    </Section>
  );
}

function ProcrastinationSheet({ open, onClose, userId, onStart }: { open: boolean; onClose: () => void; userId: string; onStart: (step: string) => void }) {
  const { t } = useTranslation();
  const [what, setWhat] = useState("");
  const [why, setWhy] = useState<string[]>([]);
  const [step, setStep] = useState("");
  useEffect(() => {
    if (open) {
      setWhat("");
      setWhy([]);
      setStep("");
    }
  }, [open]);
  async function save(start: boolean) {
    await addEntry(userId, "procrastination", { body: what, tags: why, extra: step });
    if (start) onStart(step || what);
    toast(t("common.saved"), "c-hug-heart");
    onClose();
  }
  return (
    <Sheet open={open} title={t("focus.pTitle")} closeLabel={t("common.cancel")} onClose={onClose}>
      <Art name="c-hug-baby-heart" className="sheet-hero float" eager />
      <h2>{t("focus.procrastinate")}</h2>
      <p className="sub">{t("focus.procrastinateHint")}</p>
      <div className="form">
        <Field label={t("focus.pWhat")}>
          <TextIn value={what} onChange={setWhat} autoFocus maxLength={120} />
        </Field>
        <Field label={t("focus.pWhy")}>
          <div className="chips is-wrap">
            {avoidReasons.map((reason) => (
              <button key={reason} type="button" className={`chip ${why.includes(reason) ? "is-on" : ""}`} onClick={() => setWhy(why.includes(reason) ? why.filter((item) => item !== reason) : [...why, reason])}>
                {t(`focus.reason.${reason}`)}
              </button>
            ))}
          </div>
        </Field>
        <Field label={t("focus.pStep")}>
          <TextIn value={step} onChange={setStep} placeholder={t("focus.pStepPlaceholder")} maxLength={120} />
        </Field>
        <button type="button" className="btn is-pink is-block" disabled={!what.trim()} onClick={() => void save(true)}>
          <Glyph name="play" size={18} />
          {t("focus.pSave")}
        </button>
        <button type="button" className="btn is-soft is-block" disabled={!what.trim()} onClick={() => void save(false)}>
          {t("focus.pSaveOnly")}
        </button>
      </div>
    </Sheet>
  );
}

