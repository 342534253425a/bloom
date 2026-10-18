import { useLiveQuery } from "dexie-react-hooks";
import { dateKey, daysBetween } from "@/shared/lib/date";
import { createId } from "@/shared/lib/id";
import { db, type Countdown, type CountdownKind, type Goal, type GoalHorizon, type Tone } from "@/shared/db";

export const horizons: GoalHorizon[] = ["year", "quarter", "month", "week"];

export function childHorizon(horizon: GoalHorizon): GoalHorizon | null {
  const index = horizons.indexOf(horizon);
  return horizons[index + 1] ?? null;
}

export type GoalNode = Goal & { progress: number; children: GoalNode[]; daysLeft: number | null };

function progressOf(goal: Goal, children: GoalNode[]): number {
  if (goal.doneAt) return 1;
  if (children.length) return children.reduce((sum, child) => sum + child.progress, 0) / children.length;
  if (goal.steps.length) return goal.steps.filter((step) => step.done).length / goal.steps.length;
  return Math.max(0, Math.min(100, goal.manual ?? 0)) / 100;
}

export function buildTree(goals: Goal[], today = dateKey()): GoalNode[] {
  const byParent = new Map<string | null, Goal[]>();
  for (const goal of goals) {
    const parent = goal.parentId && goals.some((item) => item.id === goal.parentId) ? goal.parentId : null;
    byParent.set(parent, [...(byParent.get(parent) ?? []), goal]);
  }
  const build = (goal: Goal): GoalNode => {
    const children = (byParent.get(goal.id) ?? []).sort((a, b) => a.sort - b.sort).map(build);
    return {
      ...goal,
      children,
      progress: progressOf(goal, children),
      daysLeft: goal.due ? daysBetween(today, goal.due) : null,
    };
  };
  return (byParent.get(null) ?? []).sort((a, b) => horizons.indexOf(a.horizon) - horizons.indexOf(b.horizon) || a.sort - b.sort).map(build);
}

export function flatten(nodes: GoalNode[]): GoalNode[] {
  return nodes.flatMap((node) => [node, ...flatten(node.children)]);
}

export function useGoalTree(userId: string) {
  return useLiveQuery(async () => buildTree(await db.goals.where("userId").equals(userId).toArray()), [userId]);
}

export type GoalDraft = {
  title: string;
  why?: string;
  horizon: GoalHorizon;
  icon: string;
  tone: Tone;
  parentId?: string | null;
  due?: string | null;
  steps?: string[];
};

export async function createGoal(userId: string, draft: GoalDraft): Promise<string> {
  const id = createId();
  const count = await db.goals.where("userId").equals(userId).count();
  await db.goals.add({
    id,
    userId,
    title: draft.title.trim(),
    why: draft.why?.trim() || null,
    horizon: draft.horizon,
    icon: draft.icon,
    tone: draft.tone,
    parentId: draft.parentId ?? null,
    steps: (draft.steps ?? []).map((title) => title.trim()).filter(Boolean).map((title) => ({ id: createId(), title, done: false })),
    manual: null,
    due: draft.due || null,
    doneAt: null,
    createdAt: new Date().toISOString(),
    sort: count + 1,
  });
  return id;
}

async function own(userId: string, goalId: string) {
  const goal = await db.goals.get(goalId);
  return goal && goal.userId === userId ? goal : null;
}

export async function updateGoal(userId: string, goalId: string, patch: Partial<Omit<Goal, "id" | "userId">>) {
  if (await own(userId, goalId)) await db.goals.update(goalId, patch);
}

export async function addGoalStep(userId: string, goalId: string, title: string) {
  const goal = await own(userId, goalId);
  if (!goal || !title.trim()) return;
  await db.goals.update(goalId, { steps: [...goal.steps, { id: createId(), title: title.trim(), done: false }] });
}

export async function toggleGoalStep(userId: string, goalId: string, stepId: string) {
  const goal = await own(userId, goalId);
  if (!goal) return;
  const steps = goal.steps.map((step) => (step.id === stepId ? { ...step, done: !step.done } : step));
  const allDone = steps.length > 0 && steps.every((step) => step.done);
  await db.goals.update(goalId, { steps, doneAt: allDone ? (goal.doneAt ?? new Date().toISOString()) : null });
}

export async function removeGoalStep(userId: string, goalId: string, stepId: string) {
  const goal = await own(userId, goalId);
  if (!goal) return;
  await db.goals.update(goalId, { steps: goal.steps.filter((step) => step.id !== stepId) });
}

export async function toggleGoalDone(userId: string, goalId: string) {
  const goal = await own(userId, goalId);
  if (!goal) return;
  await db.goals.update(goalId, { doneAt: goal.doneAt ? null : new Date().toISOString() });
}

export async function deleteGoal(userId: string, goalId: string) {
  const all = await db.goals.where("userId").equals(userId).toArray();
  const doomed = new Set([goalId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const goal of all) {
      if (goal.parentId && doomed.has(goal.parentId) && !doomed.has(goal.id)) {
        doomed.add(goal.id);
        grew = true;
      }
    }
  }
  await db.goals.bulkDelete([...doomed]);
  const linked = (await db.habits.where("userId").equals(userId).toArray()).filter((habit) => habit.goalId && doomed.has(habit.goalId));
  for (const habit of linked) await db.habits.update(habit.id, { goalId: null });
}

/* ---------- Countdowns ---------- */

export const countdownKinds: CountdownKind[] = ["exam", "trip", "birthday", "event"];

export type CountdownView = Countdown & { daysLeft: number };

export function useCountdowns(userId: string) {
  const today = dateKey();
  return useLiveQuery(async (): Promise<CountdownView[]> => {
    const rows = await db.countdowns.where("userId").equals(userId).toArray();
    return rows
      .map((row) => ({ ...row, daysLeft: daysBetween(today, row.targetDate) }))
      .sort((a, b) => (a.daysLeft < 0 ? 1 : 0) - (b.daysLeft < 0 ? 1 : 0) || a.targetDate.localeCompare(b.targetDate));
  }, [userId, today]);
}

export async function addCountdown(userId: string, title: string, kind: CountdownKind, targetDate: string) {
  if (!title.trim() || !targetDate) return;
  await db.countdowns.add({ id: createId(), userId, title: title.trim(), kind, targetDate, createdAt: new Date().toISOString() });
}

export async function removeCountdown(userId: string, id: string) {
  const row = await db.countdowns.get(id);
  if (row?.userId === userId) await db.countdowns.delete(id);
}
