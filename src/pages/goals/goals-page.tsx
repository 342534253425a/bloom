import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { flatten, horizons, removeCountdown, useCountdowns, useGoalTree, type GoalNode } from "@/entities/goal";
import { useUser } from "@/entities/session";
import { CountdownSheet, GoalSheet, countdownArt } from "@/features/goal/goal-sheet";
import { localeOf } from "@/shared/i18n";
import { formatKey } from "@/shared/lib/date";
import { useIntent } from "@/shared/lib/intent";
import { Empty, IconButton, PageHead, Section, Tabs } from "@/shared/ui/bloom";
import { Glyph } from "@/shared/ui/glyph";
import { Art, Bar, Tile, at, toast } from "@/shared/ui/kit";
import { Tour } from "@/widgets/tour/tour";

export function GoalsPage() {
  const { t } = useTranslation();
  const user = useUser();
  const tree = useGoalTree(user.id);
  const countdowns = useCountdowns(user.id);
  const [tab, setTab] = useState<"goals" | "countdowns">("goals");
  const [goalOpen, setGoalOpen] = useState(false);
  const [cdOpen, setCdOpen] = useState(false);
  useIntent("goal", () => {
    setTab("goals");
    setGoalOpen(true);
  });
  useIntent("countdown", () => {
    setTab("countdowns");
    setCdOpen(true);
  });

  const roots = (tree ?? []).filter((goal) => !goal.doneAt);
  const achieved = flatten(tree ?? []).filter((goal) => goal.doneAt);

  return (
    <div className="page">
      <PageHead
        title={t("goals.title")}
        sub={t("goals.sub")}
        art="o-target-heart"
        help="goals"
        back
        actions={
          <button type="button" data-tour="goals-add" className="btn is-sm desk-only" onClick={() => (tab === "goals" ? setGoalOpen(true) : setCdOpen(true))}>
            <Glyph name="plus" size={18} stroke={2.6} />
            {tab === "goals" ? t("goals.new") : t("countdowns.new")}
          </button>
        }
      />
      <Tabs
        tour="goals-tabs"
        value={tab}
        onChange={setTab}
        options={[
          { id: "goals", label: t("goals.tabGoals") },
          { id: "countdowns", label: `${t("goals.tabCountdowns")}${countdowns?.length ? ` · ${countdowns.length}` : ""}` },
        ]}
      />

      {tab === "goals" ? (
        <>
          <section data-tour="goals-ladder" className="card ladder tone-sun rise" style={at(1)}>
            <div className="ladder-steps">
              {horizons.map((horizon, index) => (
                <span key={horizon} className="ladder-step">
                  {t(`goals.horizonShort.${horizon}`)}
                  {index < horizons.length - 1 ? <Glyph name="chevron" size={14} stroke={2.6} /> : null}
                </span>
              ))}
              <Glyph name="chevron" size={14} stroke={2.6} />
              <span className="ladder-step is-today">{t("common.today")}</span>
            </div>
            <p className="sub">{t("goals.ladderBody")}</p>
          </section>

          {tree && roots.length === 0 ? (
            <Empty
              art="c-hug-star"
              title={t("goals.empty")}
              body={t("goals.emptyBody")}
              action={
                <button type="button" data-tour="goals-add" className="btn" onClick={() => setGoalOpen(true)}>
                  <Glyph name="plus" size={18} stroke={2.6} />
                  {t("goals.new")}
                </button>
              }
            />
          ) : null}

          {horizons.map((horizon) => {
            const list = roots.filter((goal) => goal.horizon === horizon);
            if (!list.length) return null;
            return (
              <Section key={horizon} title={t(`goals.horizon.${horizon}`)}>
                <div className="goal-grid">
                  {list.map((goal, index) => (
                    <GoalCard key={goal.id} goal={goal} index={index} />
                  ))}
                </div>
              </Section>
            );
          })}

          {roots.length ? (
            <button type="button" data-tour="goals-add" className="btn is-soft is-block mob-only" onClick={() => setGoalOpen(true)}>
              <Glyph name="plus" size={18} stroke={2.6} />
              {t("goals.new")}
            </button>
          ) : null}

          {achieved.length ? (
            <Section title={`${t("goals.achieved")} · ${achieved.length}`}>
              <div className="goal-grid">
                {achieved.map((goal, index) => (
                  <GoalCard key={goal.id} goal={goal} index={index} />
                ))}
              </div>
            </Section>
          ) : null}
        </>
      ) : (
        <>
          {countdowns && countdowns.length === 0 ? (
            <Empty
              art="c-wave-sun"
              title={t("countdowns.empty")}
              body={t("countdowns.emptyBody")}
              action={
                <button type="button" className="btn" onClick={() => setCdOpen(true)}>
                  <Glyph name="plus" size={18} stroke={2.6} />
                  {t("countdowns.new")}
                </button>
              }
            />
          ) : null}
          <div className="cd-grid">
            {(countdowns ?? []).map((item, index) => (
              <section key={item.id} className={`card cd-card rise ${item.daysLeft < 0 ? "is-past" : ""} ${item.daysLeft === 0 ? "is-today" : ""}`} style={at(index)}>
                <Tile name={countdownArt(item.kind)} size={48} />
                <div className="cd-copy">
                  <strong>{item.title}</strong>
                  <small>
                    {t(`countdowns.kind.${item.kind}`)} · {formatKey(item.targetDate, localeOf(), { day: "numeric", month: "long", year: "numeric" })}
                  </small>
                </div>
                <div className="cd-num">
                  {item.daysLeft === 0 ? (
                    <b className="cd-today">{t("countdowns.today")}</b>
                  ) : item.daysLeft > 0 ? (
                    <>
                      <b className="num">{item.daysLeft}</b>
                      <small>{t("countdowns.left")}</small>
                    </>
                  ) : (
                    <small>{t("countdowns.past", { count: -item.daysLeft })}</small>
                  )}
                </div>
                <IconButton
                  glyph="trash"
                  label={t("common.delete")}
                  className="cd-del"
                  onClick={() => {
                    void removeCountdown(user.id, item.id);
                    toast(t("common.deleted"), "c-wave");
                  }}
                />
              </section>
            ))}
          </div>
          {countdowns?.length ? (
            <button type="button" className="btn is-soft is-block" onClick={() => setCdOpen(true)}>
              <Glyph name="plus" size={18} stroke={2.6} />
              {t("countdowns.new")}
            </button>
          ) : null}
        </>
      )}

      <Tour id="goals" />
      <GoalSheet open={goalOpen} onClose={() => setGoalOpen(false)} userId={user.id} />
      <CountdownSheet open={cdOpen} onClose={() => setCdOpen(false)} userId={user.id} />
    </div>
  );
}

export function GoalCard({ goal, index }: { goal: GoalNode; index: number }) {
  const { t } = useTranslation();
  const steps = goal.steps.length;
  return (
    <Link to="/goals/$goalId" data-tour="goals-card" params={{ goalId: goal.id }} className={`card goal-card tone-${goal.tone} pressable rise ${goal.doneAt ? "is-done" : ""}`} style={at(index + 2)}>
      <span className="goal-card-top">
        <Tile name={goal.icon} size={48} />
        <span className="pill">{t(`goals.horizonShort.${goal.horizon}`)}</span>
        {goal.doneAt ? <Art name="b-mountain" className="goal-badge" /> : null}
      </span>
      <strong className="goal-title">{goal.title}</strong>
      {goal.why ? <small className="goal-why">{goal.why}</small> : null}
      <span className="goal-progress">
        <Bar value={goal.progress} tone={goal.tone} height={8} />
        <b className="num">{Math.round(goal.progress * 100)}%</b>
      </span>
      <small className="goal-meta">
        {goal.children.length ? `${t("goals.subgoals")}: ${goal.children.length}` : steps ? t("goals.stepsDone", { done: goal.steps.filter((step) => step.done).length, total: steps }) : ""}
        {goal.daysLeft !== null && !goal.doneAt ? ` · ${goal.daysLeft < 0 ? t("goals.overdue") : t("goals.daysLeft", { count: goal.daysLeft })}` : ""}
      </small>
    </Link>
  );
}
