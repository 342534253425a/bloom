import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useUser } from "@/entities/session";
import {
  addProject,
  addProjectStep,
  addTask,
  quadrants,
  removeProject,
  toggleProjectStep,
  updateTask,
  useAllTasks,
  useOverdue,
  useProjects,
  useTasksOn,
  type TaskDraft,
} from "@/entities/task";
import { TaskItem, TaskSheet, endClock } from "@/features/task/task-item";
import type { Quadrant, Task, Tone } from "@/shared/db";
import { dateKey } from "@/shared/lib/date";
import { useIntent } from "@/shared/lib/intent";
import { haptic } from "@/shared/lib/motion/fx";
import { Confirm, Empty, Field, IconButton, PageHead, Section, Tabs, TextArea, TextIn, TonePicker } from "@/shared/ui/bloom";
import { Glyph } from "@/shared/ui/glyph";
import { Art, Bar, CheckButton, Tile, at, toast } from "@/shared/ui/kit";
import { Sheet } from "@/shared/ui/sheet";
import { Tour } from "@/widgets/tour/tour";

type Tab = "today" | "matrix" | "plan" | "projects";

export function TasksPage() {
  const { t } = useTranslation();
  const user = useUser();
  const [tab, setTab] = useState<Tab>("today");
  const [sheet, setSheet] = useState<{ task?: Task | null; preset?: Partial<TaskDraft> } | null>(null);
  const [projectOpen, setProjectOpen] = useState(false);
  useIntent("task", () => setSheet({}));
  useIntent("project", () => {
    setTab("projects");
    setProjectOpen(true);
  });

  return (
    <div className="page">
      <PageHead
        title={t("tasks.title")}
        sub={t("tasks.sub")}
        art="i-list"
        help="tasks"
        actions={
          <button type="button" className="btn is-sm desk-only" onClick={() => (tab === "projects" ? setProjectOpen(true) : setSheet({}))}>
            <Glyph name="plus" size={18} stroke={2.6} />
            {tab === "projects" ? t("tasks.newProject") : t("tasks.add")}
          </button>
        }
      />

      <Link to="/focus" data-tour="tasks-focus" className="card focus-link tone-pink pressable rise" style={at(1)}>
        <Tile name="i-flame" size={44} />
        <span>
          <strong>{t("tasks.focusCard")}</strong>
          <small>{t("tasks.focusCardBody")}</small>
        </span>
        <span className="chev-bubble">
          <Glyph name="chevron" size={18} stroke={2.4} />
        </span>
      </Link>

      <Tabs
        tour="tasks-tabs"
        value={tab}
        onChange={setTab}
        options={[
          { id: "today", label: t("tasks.tabToday") },
          { id: "matrix", label: t("tasks.tabMatrix") },
          { id: "plan", label: t("tasks.tabPlan") },
          { id: "projects", label: t("tasks.tabProjects") },
        ]}
      />

      {tab === "today" ? <TodayTab userId={user.id} onOpen={(task) => setSheet({ task })} /> : null}
      {tab === "matrix" ? <MatrixTab userId={user.id} onOpen={(task) => setSheet({ task })} onAdd={(quadrant) => setSheet({ preset: { quadrant } })} /> : null}
      {tab === "plan" ? <PlanTab userId={user.id} onOpen={(task) => setSheet({ task })} onAdd={(clock) => setSheet({ preset: { clock, minutes: 60 } })} /> : null}
      {tab === "projects" ? <ProjectsTab userId={user.id} onNew={() => setProjectOpen(true)} onAddTask={(projectId) => setSheet({ preset: { projectId } })} onOpen={(task) => setSheet({ task })} /> : null}

      <Tour id="tasks" />
      <TaskSheet open={sheet !== null} task={sheet?.task} preset={sheet?.preset} onClose={() => setSheet(null)} userId={user.id} />
      <ProjectSheet open={projectOpen} onClose={() => setProjectOpen(false)} userId={user.id} />
    </div>
  );
}

function QuickAdd({ userId }: { userId: string }) {
  const { t } = useTranslation();
  const [title, setTitle] = useState("");
  const input = useRef<HTMLInputElement>(null);
  async function add() {
    if (!title.trim()) return;
    await addTask(userId, { title });
    setTitle("");
    haptic(6);
    input.current?.focus();
  }
  return (
    <div className="quick-add is-big rise" data-tour="tasks-quick">
      <span className="input">
        <Glyph name="plus" size={20} stroke={2.4} />
        <input
          ref={input}
          value={title}
          maxLength={140}
          placeholder={t("tasks.quickAdd")}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void add();
          }}
        />
      </span>
      <button type="button" className="icon-btn is-solid" aria-label={t("common.add")} disabled={!title.trim()} onClick={() => void add()}>
        <Glyph name="check" size={20} stroke={2.8} />
      </button>
    </div>
  );
}

function TodayTab({ userId, onOpen }: { userId: string; onOpen: (task: Task) => void }) {
  const { t } = useTranslation();
  const tasks = useTasksOn(userId, dateKey());
  const overdue = useOverdue(userId);
  const [showDone, setShowDone] = useState(false);
  if (!tasks) return null;
  const tops = tasks.filter((task) => task.top);
  const open = tasks.filter((task) => !task.top && !task.done);
  const done = tasks.filter((task) => task.done && !task.top);
  return (
    <>
      <QuickAdd userId={userId} />
      <div className="two-col">
        <div className="side-stack">
          <section className="card top3-card tone-sun rise" data-tour="tasks-top">
            <div className="card-title">
              <h2 className="heading">
                <Glyph name="star" size={18} fill className="title-star" /> {t("tasks.top")}
              </h2>
              <span className="pill is-sun">{tops.length}/3</span>
            </div>
            {tops.length === 0 ? <p className="sub card-note">{t("tasks.topHint")}</p> : null}
            <div className="tlist">
              {tops.map((task) => (
                <TaskItem key={task.id} task={task} userId={userId} onOpen={onOpen} />
              ))}
            </div>
          </section>

          {overdue?.length ? (
            <Section title={`${t("tasks.overdue")} · ${overdue.length}`}>
              <div className="card tlist">
                {overdue.map((task) => (
                  <TaskItem key={task.id} task={task} userId={userId} onOpen={onOpen} />
                ))}
              </div>
            </Section>
          ) : null}
        </div>

        <div className="side-stack">
          <Section title={t("tasks.list")} tour="tasks-list">
            {open.length === 0 && tops.length === 0 && done.length === 0 ? (
              <Empty art="c-checklist" title={t("tasks.empty")} body={t("tasks.emptyBody")} />
            ) : open.length === 0 ? (
              <div className="card all-done">
                <Art name="c-arms-up" />
                <span>{t("tasks.allDone")}</span>
              </div>
            ) : (
              <div className="card tlist">
                {open.map((task) => (
                  <TaskItem key={task.id} task={task} userId={userId} onOpen={onOpen} />
                ))}
              </div>
            )}
          </Section>
          {done.length ? (
            <Section
              title={`${t("tasks.done")} · ${done.length}`}
              action={
                <button type="button" className="link" onClick={() => setShowDone(!showDone)}>
                  {showDone ? t("common.close") : t("common.seeAll")}
                </button>
              }
            >
              {showDone ? (
                <div className="card tlist">
                  {done.map((task) => (
                    <TaskItem key={task.id} task={task} userId={userId} onOpen={onOpen} />
                  ))}
                </div>
              ) : null}
            </Section>
          ) : null}
        </div>
      </div>
    </>
  );
}

const quadTone: Record<Quadrant, Tone> = { now: "pink", plan: "mint", delegate: "sun", later: "lav" };
const quadArt: Record<Quadrant, string> = { now: "i-flame", plan: "i-target", delegate: "c-two-hands", later: "i-cloud" };

function MatrixTab({ userId, onOpen, onAdd }: { userId: string; onOpen: (task: Task) => void; onAdd: (quadrant: Quadrant) => void }) {
  const { t } = useTranslation();
  const all = useAllTasks(userId);
  const [sorting, setSorting] = useState<Task | null>(null);
  const today = dateKey();
  const open = (all ?? []).filter((task) => !task.done && task.dateKey >= today).concat((all ?? []).filter((task) => !task.done && task.dateKey < today));
  const unsorted = open.filter((task) => !task.quadrant);
  return (
    <>
      <div className="matrix">
        {quadrants.map((quadrant, index) => {
          const list = open.filter((task) => task.quadrant === quadrant);
          return (
            <section key={quadrant} className={`card quad tone-${quadTone[quadrant]} rise`} style={at(index)}>
              <div className="quad-head">
                <Tile name={quadArt[quadrant]} size={34} />
                <span>
                  <strong>{t(`tasks.quadrant.${quadrant}`)}</strong>
                  <small>{t(`tasks.quadrantHint.${quadrant}`)}</small>
                </span>
                <IconButton glyph="plus" label={t("common.add")} onClick={() => onAdd(quadrant)} />
              </div>
              <div className="tlist">
                {list.map((task) => (
                  <TaskItem key={task.id} task={task} userId={userId} compact onOpen={onOpen} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
      {unsorted.length ? (
        <Section title={`${t("tasks.unsorted")} · ${unsorted.length}`}>
          <p className="sub">{t("tasks.sortHint")}</p>
          <div className="card tlist">
            {unsorted.map((task) => (
              <TaskItem key={task.id} task={task} userId={userId} onOpen={setSorting} />
            ))}
          </div>
        </Section>
      ) : null}
      <Sheet open={sorting !== null} title={sorting?.title ?? ""} closeLabel={t("common.cancel")} onClose={() => setSorting(null)}>
        <h2>{sorting?.title}</h2>
        <div className="quad-pick">
          {quadrants.map((quadrant) => (
            <button
              key={quadrant}
              type="button"
              className={`card quad-opt tone-${quadTone[quadrant]} pressable`}
              onClick={() => {
                if (sorting) void updateTask(userId, sorting.id, { quadrant });
                haptic(6);
                setSorting(null);
              }}
            >
              <Tile name={quadArt[quadrant]} size={38} />
              <strong>{t(`tasks.quadrant.${quadrant}`)}</strong>
              <small>{t(`tasks.quadrantHint.${quadrant}`)}</small>
            </button>
          ))}
        </div>
        {sorting ? (
          <button
            type="button"
            className="btn is-soft is-block"
            onClick={() => {
              const task = sorting;
              setSorting(null);
              onOpen(task);
            }}
          >
            <Glyph name="edit" size={18} />
            {t("common.edit")}
          </button>
        ) : null}
      </Sheet>
    </>
  );
}

const START_HOUR = 6;
const END_HOUR = 24;
const HOUR_PX = 64;

function minutesOf(clock: string) {
  const [hours, minutes] = clock.split(":").map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}

function PlanTab({ userId, onOpen, onAdd }: { userId: string; onOpen: (task: Task) => void; onAdd: (clock: string) => void }) {
  const { t } = useTranslation();
  const tasks = useTasksOn(userId, dateKey());
  const [now, setNow] = useState(() => new Date());
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    const top = Math.max(0, (now.getHours() - START_HOUR - 1) * HOUR_PX);
    scroller.current?.scrollTo({ top });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const blocks = (tasks ?? []).filter((task) => task.clock);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const unplanned = (tasks ?? []).filter((task) => !task.clock && !task.done);
  return (
    <div className="two-col is-plan">
      <section className="card plan rise">
        {blocks.length === 0 ? <Empty art="o-clock" title={t("tasks.planEmpty")} body={t("tasks.planEmptyBody")} /> : null}
        <div className="plan-scroll" ref={scroller}>
          <div className="plan-day" style={{ height: (END_HOUR - START_HOUR) * HOUR_PX }}>
            {Array.from({ length: END_HOUR - START_HOUR }, (_, index) => {
              const hour = START_HOUR + index;
              const clock = `${String(hour).padStart(2, "0")}:00`;
              return (
                <button key={hour} type="button" className="plan-hour" style={{ top: index * HOUR_PX, height: HOUR_PX }} onClick={() => onAdd(clock)} aria-label={`${t("tasks.addBlock")} ${clock}`}>
                  <span>{clock}</span>
                </button>
              );
            })}
            {nowMin >= START_HOUR * 60 ? (
              <span className="plan-now" style={{ top: ((nowMin - START_HOUR * 60) / 60) * HOUR_PX }}>
                <b>{t("tasks.now")}</b>
              </span>
            ) : null}
            {blocks.map((task) => {
              const start = minutesOf(task.clock!);
              const length = task.minutes ?? 30;
              const top = ((start - START_HOUR * 60) / 60) * HOUR_PX;
              const live = nowMin >= start && nowMin < start + length;
              return (
                <button
                  key={task.id}
                  type="button"
                  className={`plan-block area-${task.area} ${task.done ? "is-done" : ""} ${live ? "is-live" : ""}`}
                  style={{ top: Math.max(0, top), height: Math.max(30, (length / 60) * HOUR_PX - 4) }}
                  onClick={() => onOpen(task)}
                >
                  <strong>{task.title}</strong>
                  <small>
                    {task.clock}–{endClock(task.clock!, length)}
                  </small>
                </button>
              );
            })}
          </div>
        </div>
      </section>
      <div className="side-stack">
        <button type="button" className="btn is-block" onClick={() => onAdd(`${String(Math.min(23, now.getHours() + 1)).padStart(2, "0")}:00`)}>
          <Glyph name="plus" size={18} stroke={2.6} />
          {t("tasks.addBlock")}
        </button>
        {unplanned.length ? (
          <Section title={`${t("tasks.unsorted")} · ${unplanned.length}`}>
            <p className="sub">{t("tasks.planEmptyBody")}</p>
            <div className="card tlist">
              {unplanned.map((task) => (
                <TaskItem key={task.id} task={task} userId={userId} onOpen={onOpen} />
              ))}
            </div>
          </Section>
        ) : null}
      </div>
    </div>
  );
}

function ProjectsTab({ userId, onNew, onAddTask, onOpen }: { userId: string; onNew: () => void; onAddTask: (projectId: string) => void; onOpen: (task: Task) => void }) {
  const { t } = useTranslation();
  const projects = useProjects(userId);
  const [stepText, setStepText] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState<string | null>(null);
  if (!projects) return null;
  if (projects.length === 0)
    return (
      <Empty
        art="c-laptop"
        title={t("tasks.projectEmpty")}
        body={t("tasks.projectEmptyBody")}
        action={
          <button type="button" className="btn" onClick={onNew}>
            <Glyph name="plus" size={18} stroke={2.6} />
            {t("tasks.newProject")}
          </button>
        }
      />
    );
  return (
    <>
      <div className="project-grid">
        {projects.map((project, index) => (
          <section key={project.id} className={`card project tone-${project.tone ?? "lav"} rise`} style={at(index)}>
            <div className="card-title">
              <h2 className="heading">{project.title}</h2>
              <IconButton glyph="trash" label={t("common.delete")} onClick={() => setConfirm(project.id)} />
            </div>
            {project.detail ? <p className="sub">{project.detail}</p> : null}
            <span className="goal-progress">
              <Bar value={project.progress} tone={(project.tone ?? "lav") as Tone} height={8} />
              <b className="num">{Math.round(project.progress * 100)}%</b>
            </span>
            <small className="tiny">{t("tasks.open", { count: project.open })}</small>
            <div className="steps">
              {project.steps.map((step, stepIndex) => (
                <div key={`${step.title}-${stepIndex}`} className={`step ${step.done ? "is-done" : ""}`}>
                  <CheckButton done={step.done} label={step.title} size={24} onToggle={() => void toggleProjectStep(userId, project.id, stepIndex)} />
                  <span>{step.title}</span>
                </div>
              ))}
            </div>
            {project.tasks.length ? (
              <div className="tlist">
                {project.tasks.map((task) => (
                  <TaskItem key={task.id} task={task} userId={userId} compact onOpen={onOpen} />
                ))}
              </div>
            ) : null}
            <div className="quick-add">
              <TextIn
                value={stepText[project.id] ?? ""}
                onChange={(value) => setStepText({ ...stepText, [project.id]: value })}
                placeholder={t("goals.stepPlaceholder")}
                onEnter={() => {
                  void addProjectStep(userId, project.id, stepText[project.id] ?? "");
                  setStepText({ ...stepText, [project.id]: "" });
                }}
              />
              <IconButton glyph="list" label={t("tasks.add")} onClick={() => onAddTask(project.id)} />
            </div>
          </section>
        ))}
      </div>
      <button type="button" className="btn is-soft is-block" onClick={onNew}>
        <Glyph name="plus" size={18} stroke={2.6} />
        {t("tasks.newProject")}
      </button>
      <Confirm
        open={confirm !== null}
        title={t("common.sure")}
        action={t("common.delete")}
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          if (confirm) void removeProject(userId, confirm);
        }}
      />
    </>
  );
}

function ProjectSheet({ open, onClose, userId }: { open: boolean; onClose: () => void; userId: string }) {
  const { t } = useTranslation();
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [steps, setSteps] = useState("");
  const [tone, setTone] = useState<Tone>("lav");
  useEffect(() => {
    if (open) {
      setTitle("");
      setDetail("");
      setSteps("");
    }
  }, [open]);
  return (
    <Sheet open={open} title={t("tasks.newProject")} closeLabel={t("common.cancel")} onClose={onClose}>
      <h2>{t("tasks.newProject")}</h2>
      <div className="form">
        <Field label={t("tasks.projectName")}>
          <TextIn value={title} onChange={setTitle} autoFocus maxLength={80} />
        </Field>
        <Field label={t("tasks.projectDetail")}>
          <TextIn value={detail} onChange={setDetail} maxLength={160} />
        </Field>
        <Field label={t("tasks.projectSteps")}>
          <TextArea value={steps} onChange={setSteps} rows={4} />
        </Field>
        <Field label={t("goals.color")}>
          <TonePicker value={tone} onPick={setTone} />
        </Field>
        <button
          type="button"
          className="btn is-block"
          disabled={!title.trim()}
          onClick={async () => {
            await addProject(userId, title, detail, steps.split("\n"), tone);
            toast(t("common.saved"), "c-laptop");
            onClose();
          }}
        >
          {t("common.save")}
        </button>
      </div>
    </Sheet>
  );
}
