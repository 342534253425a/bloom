import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { addTask, areas, moveToToday, quadrants, removeTask, setTop, toggleTask, updateTask, useProjects, type TaskDraft } from "@/entities/task";
import { pointRules } from "@/entities/progress";
import type { Quadrant, Task, TaskArea } from "@/shared/db";
import { addDays, dateKey } from "@/shared/lib/date";
import { haptic, pop } from "@/shared/lib/motion/fx";
import { Field, TextIn } from "@/shared/ui/bloom";
import { Glyph } from "@/shared/ui/glyph";
import { CheckButton, toast } from "@/shared/ui/kit";
import { Sheet } from "@/shared/ui/sheet";

const areaTone: Record<TaskArea, string> = { personal: "lav", work: "sky", study: "sun", wellness: "mint" };

export function TaskItem({ task, userId, compact = false, onOpen }: { task: Task; userId: string; compact?: boolean; onOpen?: (task: Task) => void }) {
  const { t } = useTranslation();
  const overdue = !task.done && task.dateKey < dateKey();
  return (
    <div className={`titem ${task.done ? "is-done" : ""} ${task.top ? "is-top" : ""}`}>
      <CheckButton
        done={task.done}
        label={task.title}
        size={28}
        onToggle={() => {
          void toggleTask(userId, task.id);
          if (!task.done) toast(t("habits.checked", { points: pointRules.task + (task.top ? pointRules.topTask : 0) }), "c-checklist");
        }}
      />
      <button type="button" className="titem-copy" onClick={() => onOpen?.(task)}>
        <strong>{task.title}</strong>
        {!compact ? (
          <small>
            <span className={`dot is-${areaTone[task.area] ?? "lav"}`} />
            {t(`tasks.area.${task.area}`)}
            {task.clock ? ` · ${task.clock}${task.minutes ? `–${endClock(task.clock, task.minutes)}` : ""}` : ""}
            {task.quadrant ? ` · ${t(`tasks.quadrant.${task.quadrant}`)}` : ""}
            {overdue ? ` · ${task.dateKey.slice(5).split("-").reverse().join(".")}` : ""}
          </small>
        ) : null}
      </button>
      {overdue ? (
        <button type="button" className="icon-btn is-sky" title={t("tasks.moveToday")} aria-label={t("tasks.moveToday")} onClick={() => void moveToToday(userId, task.id)}>
          <Glyph name="arrowUp" size={18} stroke={2.2} />
        </button>
      ) : null}
      {!task.done ? (
        <button
          type="button"
          className={`star-btn ${task.top ? "is-on" : ""}`}
          aria-pressed={Boolean(task.top)}
          aria-label={task.top ? t("tasks.unstar") : t("tasks.star")}
          title={task.top ? t("tasks.unstar") : t("tasks.star")}
          onClick={async (event) => {
            pop(event.currentTarget, 1.25);
            const ok = await setTop(userId, task.id, !task.top);
            if (ok === false) toast(t("tasks.topFull"), "c-frown");
            else haptic(6);
          }}
        >
          <Glyph name="star" size={20} fill={Boolean(task.top)} />
        </button>
      ) : null}
    </div>
  );
}

export function endClock(clock: string, minutes: number) {
  const [hours, mins] = clock.split(":").map(Number);
  const total = (hours ?? 0) * 60 + (mins ?? 0) + minutes;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

type Draft = { title: string; area: TaskArea; day: string; top: boolean; quadrant: Quadrant | null; clock: string; minutes: string; projectId: string; detail: string };

export function TaskSheet({
  open,
  onClose,
  userId,
  task,
  preset,
}: {
  open: boolean;
  onClose: () => void;
  userId: string;
  task?: Task | null;
  preset?: Partial<TaskDraft>;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const projects = useProjects(userId);
  const today = dateKey();
  const [draft, setDraft] = useState<Draft>({ title: "", area: "personal", day: today, top: false, quadrant: null, clock: "", minutes: "", projectId: "", detail: "" });

  useEffect(() => {
    if (!open) return;
    setDraft({
      title: task?.title ?? preset?.title ?? "",
      area: task?.area ?? preset?.area ?? "personal",
      day: task?.dateKey ?? preset?.dateKey ?? today,
      top: task?.top ?? preset?.top ?? false,
      quadrant: task?.quadrant ?? preset?.quadrant ?? null,
      clock: task?.clock ?? preset?.clock ?? "",
      minutes: String(task?.minutes ?? preset?.minutes ?? ""),
      projectId: task?.projectId ?? preset?.projectId ?? "",
      detail: task?.detail ?? "",
    });
  }, [open, task, preset, today]);

  const set = (patch: Partial<Draft>) => setDraft((current) => ({ ...current, ...patch }));

  async function save() {
    if (!draft.title.trim()) return;
    const fields = {
      title: draft.title.trim(),
      area: draft.area,
      dateKey: draft.day || today,
      quadrant: draft.quadrant,
      clock: draft.clock || null,
      minutes: draft.clock && Number(draft.minutes) > 0 ? Number(draft.minutes) : null,
      projectId: draft.projectId || null,
      detail: draft.detail.trim() || null,
    };
    if (task) {
      await updateTask(userId, task.id, fields);
      if (Boolean(task.top) !== draft.top) await setTop(userId, task.id, draft.top);
    } else {
      await addTask(userId, { ...fields, top: draft.top });
    }
    haptic(8);
    toast(t("common.saved"), "c-checklist");
    onClose();
  }

  return (
    <Sheet open={open} title={task ? t("common.edit") : t("tasks.add")} closeLabel={t("common.cancel")} onClose={onClose}>
      <h2>{task ? t("common.edit") : t("tasks.add")}</h2>
      <div className="form">
        <Field label={t("common.title")}>
          <TextIn value={draft.title} onChange={(title) => set({ title })} placeholder={t("tasks.placeholder")} autoFocus={!task} onEnter={() => void save()} />
        </Field>
        <button type="button" className={`toggle-row ${draft.top ? "is-on" : ""}`} onClick={() => set({ top: !draft.top })}>
          <Glyph name="star" size={20} fill={draft.top} />
          <span>{t("tasks.star")}</span>
        </button>
        <Field label={t("tasks.day")}>
          <div className="chips is-wrap">
            {[
              { key: today, label: t("common.today") },
              { key: addDays(today, 1), label: t("common.tomorrow") },
            ].map((option) => (
              <button key={option.key} type="button" className={`chip ${draft.day === option.key ? "is-on" : ""}`} onClick={() => set({ day: option.key })}>
                {option.label}
              </button>
            ))}
            <span className="input is-chip">
              <input type="date" value={draft.day} onChange={(event) => set({ day: event.target.value })} />
            </span>
          </div>
        </Field>
        <Field label={t("tasks.area.personal") + " / " + t("tasks.area.work")}>
          <div className="chips is-wrap">
            {areas.map((area) => (
              <button key={area} type="button" className={`chip ${draft.area === area ? "is-on" : ""}`} onClick={() => set({ area })}>
                {t(`tasks.area.${area}`)}
              </button>
            ))}
          </div>
        </Field>
        <Field label={t("tasks.tabMatrix")}>
          <div className="chips is-wrap">
            {quadrants.map((quadrant) => (
              <button key={quadrant} type="button" className={`chip ${draft.quadrant === quadrant ? "is-on" : ""}`} onClick={() => set({ quadrant: draft.quadrant === quadrant ? null : quadrant })}>
                {t(`tasks.quadrant.${quadrant}`)}
              </button>
            ))}
          </div>
        </Field>
        <div className="field-pair">
          <Field label={t("tasks.when")}>
            <TextIn type="time" value={draft.clock} onChange={(clock) => set({ clock })} />
          </Field>
          <Field label={t("tasks.duration")}>
            <TextIn type="number" inputMode="numeric" value={draft.minutes} onChange={(minutes) => set({ minutes })} placeholder="30" min={5} max={720} />
          </Field>
        </div>
        {projects?.length ? (
          <Field label={t("tasks.project")}>
            <span className="input">
              <select value={draft.projectId} onChange={(event) => set({ projectId: event.target.value })}>
                <option value="">{t("tasks.noProject")}</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.title}
                  </option>
                ))}
              </select>
            </span>
          </Field>
        ) : null}
        <button type="button" className="btn is-block" disabled={!draft.title.trim()} onClick={() => void save()}>
          {t("common.save")}
        </button>
        {task ? (
          <div className="btn-row">
            <button
              type="button"
              className="btn is-soft is-sm"
              onClick={() => {
                onClose();
                sessionStorage.setItem("bloom.focusTask", task.id);
                void navigate({ to: "/focus" });
              }}
            >
              <Glyph name="flame" size={18} />
              {t("tasks.focusCta")}
            </button>
            {!task.done ? (
              <button type="button" className="btn is-soft is-sm" onClick={() => void updateTask(userId, task.id, { dateKey: addDays(today, 1), top: false }).then(onClose)}>
                <Glyph name="calendar" size={18} />
                {t("tasks.tomorrow")}
              </button>
            ) : null}
            <button
              type="button"
              className="btn is-danger is-sm"
              onClick={() => {
                void removeTask(userId, task.id);
                toast(t("common.deleted"), "c-wave");
                onClose();
              }}
            >
              <Glyph name="trash" size={18} />
              {t("common.delete")}
            </button>
          </div>
        ) : null}
      </div>
    </Sheet>
  );
}
