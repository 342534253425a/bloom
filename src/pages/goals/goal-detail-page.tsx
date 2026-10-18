import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { addGoalStep, childHorizon, deleteGoal, flatten, removeGoalStep, toggleGoalDone, toggleGoalStep, updateGoal, useGoalTree } from "@/entities/goal";
import { updateHabit, useHabitBoard } from "@/entities/habit";
import { useUser } from "@/entities/session";
import { HabitItem } from "@/features/habit/habit-item";
import { GoalSheet } from "@/features/goal/goal-sheet";
import { localeOf } from "@/shared/i18n";
import { formatKey } from "@/shared/lib/date";
import { burst, haptic } from "@/shared/lib/motion/fx";
import { Confirm, Empty, IconButton, PageHead, Section, TextIn } from "@/shared/ui/bloom";
import { Glyph } from "@/shared/ui/glyph";
import { CheckButton, Ring, Tile, at, toast } from "@/shared/ui/kit";
import { toneHex } from "@/shared/config/spaces";
import { GoalCard } from "./goals-page";

export function GoalDetailPage() {
  const { t } = useTranslation();
  const user = useUser();
  const navigate = useNavigate();
  const { goalId } = useParams({ from: "/app/goals/$goalId" });
  const tree = useGoalTree(user.id);
  const board = useHabitBoard(user.id);
  const [step, setStep] = useState("");
  const [editing, setEditing] = useState(false);
  const [subOpen, setSubOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [linking, setLinking] = useState(false);

  const all = flatten(tree ?? []);
  const goal = all.find((item) => item.id === goalId);
  if (!tree) return <div className="page" />;
  if (!goal)
    return (
      <div className="page">
        <PageHead title={t("goals.title")} back />
        <Empty art="c-sad-grass" title={t("common.none")} />
      </div>
    );

  const parent = all.find((item) => item.id === goal.parentId) ?? null;
  const smaller = childHorizon(goal.horizon);
  const linked = (board?.cards ?? []).filter((card) => card.goalId === goal.id);
  const unlinked = (board?.cards ?? []).filter((card) => card.goalId !== goal.id);
  const manualOnly = goal.steps.length === 0 && goal.children.length === 0;

  return (
    <div className="page">
      <PageHead
        title={goal.title}
        sub={parent ? t("goals.subFor", { title: parent.title }) : t(`goals.horizon.${goal.horizon}`)}
        back
        actions={
          <button type="button" className="round-btn" aria-label={t("common.edit")} onClick={() => setEditing(true)}>
            <Glyph name="edit" size={20} />
          </button>
        }
      />

      <section className={`card goal-hero tone-${goal.tone} rise`} style={at(1)}>
        <Ring value={goal.progress} size={112} stroke={12} color={toneHex[goal.tone]} track="rgba(255,255,255,.7)">
          <span className="ring-copy">
            <Tile name={goal.icon} size={46} />
          </span>
        </Ring>
        <div className="goal-hero-copy">
          <strong className="display num">{Math.round(goal.progress * 100)}%</strong>
          {goal.why ? <p className="goal-why">“{goal.why}”</p> : null}
          <span className="goal-hero-meta">
            <span className="pill">{t(`goals.horizonShort.${goal.horizon}`)}</span>
            {goal.due ? (
              <span className="pill is-sky">
                <Glyph name="calendar" size={13} />
                {formatKey(goal.due, localeOf(), { day: "numeric", month: "short" })}
                {goal.daysLeft !== null && !goal.doneAt ? ` · ${goal.daysLeft < 0 ? t("goals.overdue") : t("goals.daysLeft", { count: goal.daysLeft })}` : ""}
              </span>
            ) : null}
          </span>
        </div>
      </section>

      {parent ? (
        <Link to="/goals/$goalId" params={{ goalId: parent.id }} className="crumb rise">
          <Glyph name="back" size={16} stroke={2.4} />
          {parent.title}
        </Link>
      ) : null}

      <div className="two-col">
        <div className="side-stack">
          <Section title={t("goals.steps")}>
            <div className="card">
              {goal.steps.length === 0 ? <p className="sub card-note">{t("goals.stepPlaceholder")}</p> : null}
              <div className="steps">
                {goal.steps.map((item) => (
                  <div key={item.id} className={`step ${item.done ? "is-done" : ""}`}>
                    <CheckButton done={item.done} label={item.title} size={26} onToggle={() => void toggleGoalStep(user.id, goal.id, item.id)} />
                    <span>{item.title}</span>
                    <IconButton glyph="close" label={t("common.delete")} onClick={() => void removeGoalStep(user.id, goal.id, item.id)} />
                  </div>
                ))}
              </div>
              <div className="quick-add">
                <TextIn
                  value={step}
                  onChange={setStep}
                  placeholder={t("goals.stepPlaceholder")}
                  onEnter={() => {
                    void addGoalStep(user.id, goal.id, step);
                    setStep("");
                  }}
                />
                <button
                  type="button"
                  className="icon-btn is-solid"
                  aria-label={t("goals.addStep")}
                  disabled={!step.trim()}
                  onClick={() => {
                    void addGoalStep(user.id, goal.id, step);
                    setStep("");
                  }}
                >
                  <Glyph name="plus" size={20} stroke={2.6} />
                </button>
              </div>
            </div>
          </Section>

          {manualOnly ? (
            <Section title={t("goals.manual")}>
              <div className="card">
                <input
                  className="slider"
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={goal.manual ?? 0}
                  onChange={(event) => void updateGoal(user.id, goal.id, { manual: Number(event.target.value) })}
                />
              </div>
            </Section>
          ) : null}

          <button
            type="button"
            className={`btn is-block ${goal.doneAt ? "is-soft" : ""}`}
            onClick={(event) => {
              if (!goal.doneAt) {
                burst(event.currentTarget, { count: 30, spread: 130 });
                haptic([10, 60, 14]);
                toast(t("goals.achieved") + " 🎉", "c-arms-up");
              }
              void toggleGoalDone(user.id, goal.id);
            }}
          >
            <Glyph name={goal.doneAt ? "reset" : "check"} size={20} stroke={2.6} />
            {goal.doneAt ? t("goals.reopen") : t("goals.complete")}
          </button>
        </div>

        <div className="side-stack">
          {smaller ? (
            <Section title={t("goals.subgoals")}>
              {goal.children.length ? (
                <div className="goal-grid is-compact">
                  {goal.children.map((child, index) => (
                    <GoalCard key={child.id} goal={child} index={index} />
                  ))}
                </div>
              ) : null}
              <button type="button" className="btn is-soft is-block" onClick={() => setSubOpen(true)}>
                <Glyph name="plus" size={18} stroke={2.6} />
                {t("goals.addSub", { horizon: t(`goals.horizon.${smaller}`).toLowerCase() })}
              </button>
            </Section>
          ) : null}

          <Section title={t("goals.habits")}>
            <div className="hlist">
              {linked.map((card) => (
                <HabitItem key={card.id} card={card} userId={user.id} />
              ))}
            </div>
            {linked.length === 0 ? <p className="sub">{t("goals.noHabits")}</p> : null}
            {unlinked.length ? (
              linking ? (
                <div className="card link-list">
                  {unlinked.map((card) => (
                    <button
                      key={card.id}
                      type="button"
                      className="row"
                      onClick={() => {
                        void updateHabit(user.id, card.id, { goalId: goal.id });
                        setLinking(false);
                      }}
                    >
                      <Tile name={card.icon ?? "i-sprout"} tone={card.tone ?? "mint"} size={34} />
                      <span className="row-copy">
                        <strong>{card.name}</strong>
                      </span>
                      <Glyph name="link" size={18} />
                    </button>
                  ))}
                </div>
              ) : (
                <button type="button" className="btn is-soft is-sm" onClick={() => setLinking(true)}>
                  <Glyph name="link" size={18} />
                  {t("goals.linkHabit")}
                </button>
              )
            ) : null}
          </Section>

          <button type="button" className="btn is-danger is-block" onClick={() => setConfirm(true)}>
            <Glyph name="trash" size={18} />
            {t("common.delete")}
          </button>
        </div>
      </div>

      <GoalSheet open={editing} onClose={() => setEditing(false)} userId={user.id} goal={goal} />
      <GoalSheet open={subOpen} onClose={() => setSubOpen(false)} userId={user.id} parent={goal} horizon={smaller ?? "week"} />
      <Confirm
        open={confirm}
        title={`${t("common.delete")} «${goal.title}»?`}
        body={t("goals.deleteBody")}
        action={t("common.delete")}
        onClose={() => setConfirm(false)}
        onConfirm={() => {
          void deleteGoal(user.id, goal.id).then(() => {
            toast(t("common.deleted"), "c-wave");
            void navigate({ to: parent ? "/goals/$goalId" : "/goals", params: parent ? { goalId: parent.id } : undefined } as never);
          });
        }}
      />
    </div>
  );
}
