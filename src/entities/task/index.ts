import { useLiveQuery } from "dexie-react-hooks";
import { dateKey } from "@/shared/lib/date";
import { createId } from "@/shared/lib/id";
import { db, type Project, type Quadrant, type Task, type TaskArea, type Tone } from "@/shared/db";

export const quadrants: Quadrant[] = ["now", "plan", "delegate", "later"];
export const areas: TaskArea[] = ["personal", "work", "study", "wellness"];

function sortTasks(rows: Task[]) {
  return rows.sort(
    (a, b) =>
      Number(a.done) - Number(b.done) ||
      Number(Boolean(b.top)) - Number(Boolean(a.top)) ||
      (a.clock ?? "99").localeCompare(b.clock ?? "99") ||
      a.sort - b.sort,
  );
}

export function useTasksOn(userId: string, key = dateKey()) {
  return useLiveQuery(async () => sortTasks((await db.tasks.where("userId").equals(userId).toArray()).filter((task) => task.dateKey === key)), [userId, key]);
}

/** Open tasks from earlier days that were not finished. */
export function useOverdue(userId: string) {
  const today = dateKey();
  return useLiveQuery(
    async () => sortTasks((await db.tasks.where("userId").equals(userId).toArray()).filter((task) => !task.done && task.dateKey < today)),
    [userId, today],
  );
}

export function useAllTasks(userId: string) {
  return useLiveQuery(() => db.tasks.where("userId").equals(userId).toArray(), [userId]);
}

export type TaskDraft = {
  title: string;
  area?: TaskArea;
  dateKey?: string;
  top?: boolean;
  quadrant?: Quadrant | null;
  clock?: string | null;
  minutes?: number | null;
  projectId?: string | null;
  detail?: string | null;
};

export async function addTask(userId: string, draft: TaskDraft): Promise<void> {
  const title = draft.title.trim();
  if (!title) return;
  const current = await db.tasks.where("userId").equals(userId).toArray();
  const sort = current.reduce((max, task) => Math.max(max, task.sort), 0) + 1;
  await db.tasks.add({
    id: createId(),
    userId,
    title,
    area: draft.area ?? "personal",
    done: false,
    dateKey: draft.dateKey ?? dateKey(),
    clock: draft.clock ?? null,
    minutes: draft.minutes ?? null,
    detail: draft.detail ?? null,
    sort,
    top: draft.top ?? false,
    quadrant: draft.quadrant ?? null,
    projectId: draft.projectId ?? null,
    doneAt: null,
  });
}

async function own(userId: string, id: string) {
  const task = await db.tasks.get(id);
  return task && task.userId === userId ? task : null;
}

export async function toggleTask(userId: string, id: string) {
  const task = await own(userId, id);
  if (!task) return;
  await db.tasks.update(id, { done: !task.done, doneAt: task.done ? null : new Date().toISOString() });
}

export async function updateTask(userId: string, id: string, patch: Partial<Omit<Task, "id" | "userId">>) {
  if (await own(userId, id)) await db.tasks.update(id, patch);
}

export async function removeTask(userId: string, id: string) {
  if (await own(userId, id)) await db.tasks.delete(id);
}

/** Make a task one of today's Top 3, bumping it to today. */
export async function setTop(userId: string, id: string, top: boolean) {
  const task = await own(userId, id);
  if (!task) return;
  if (top) {
    const today = dateKey();
    const tops = (await db.tasks.where("userId").equals(userId).toArray()).filter((row) => row.top && row.dateKey === today && row.id !== id);
    if (tops.length >= 3) return false;
    await db.tasks.update(id, { top: true, dateKey: today });
    return true;
  }
  await db.tasks.update(id, { top: false });
  return true;
}

export async function moveToToday(userId: string, id: string) {
  await updateTask(userId, id, { dateKey: dateKey() });
}

/* ---------- Projects ---------- */

export type ProjectView = Project & { progress: number; open: number; tasks: Task[] };

export function useProjects(userId: string) {
  return useLiveQuery(async (): Promise<ProjectView[]> => {
    const rows = await db.projects.where("userId").equals(userId).toArray();
    const tasks = await db.tasks.where("userId").equals(userId).toArray();
    return rows
      .map((project) => {
        const linked = tasks.filter((task) => task.projectId === project.id);
        const total = project.steps.length + linked.length;
        const done = project.steps.filter((step) => step.done).length + linked.filter((task) => task.done).length;
        return { ...project, tasks: linked, progress: total ? done / total : 0, open: total - done };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [userId]);
}

export async function addProject(userId: string, title: string, detail: string, steps: string[], tone: Tone = "lav", due: string | null = null) {
  const trimmed = title.trim();
  if (!trimmed) return;
  await db.projects.add({
    id: createId(),
    userId,
    title: trimmed,
    detail: detail.trim(),
    steps: steps.map((step) => step.trim()).filter(Boolean).map((step) => ({ title: step, done: false })),
    tone,
    due,
    createdAt: new Date().toISOString(),
  });
}

export async function toggleProjectStep(userId: string, projectId: string, index: number) {
  const project = await db.projects.get(projectId);
  if (project?.userId !== userId) return;
  await db.projects.update(projectId, { steps: project.steps.map((step, i) => (i === index ? { ...step, done: !step.done } : step)) });
}

export async function addProjectStep(userId: string, projectId: string, title: string) {
  const project = await db.projects.get(projectId);
  if (project?.userId !== userId || !title.trim()) return;
  await db.projects.update(projectId, { steps: [...project.steps, { title: title.trim(), done: false }] });
}

export async function removeProject(userId: string, projectId: string) {
  const project = await db.projects.get(projectId);
  if (project?.userId !== userId) return;
  await db.projects.delete(projectId);
  const linked = (await db.tasks.where("userId").equals(userId).toArray()).filter((task) => task.projectId === projectId);
  for (const task of linked) await db.tasks.update(task.id, { projectId: null });
}
