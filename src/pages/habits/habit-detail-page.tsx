import { useNavigate, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { deleteHabit, moveHabit, tapHabit, updateHabit, useHabitStory } from "@/entities/habit";
import { useUser } from "@/entities/session";
import { HabitCheck } from "@/features/habit/habit-item";
import { HabitSheet } from "@/features/habit/habit-sheet";
import { localeOf } from "@/shared/i18n";
import { formatKey } from "@/shared/lib/date";
import { haptic } from "@/shared/lib/motion/fx";
import { Confirm, Empty, PageHead, Stat } from "@/shared/ui/bloom";
import { Glyph } from "@/shared/ui/glyph";
import { Tile, Toggle, at, toast, type Tone } from "@/shared/ui/kit";
import { Legend } from "./habits-page";

export function HabitDetailPage() {
  const { t } = useTranslation();
  const user = useUser();
  const navigate = useNavigate();
  const { habitId } = useParams({ from: "/app/habits/$habitId" });
  const story = useHabitStory(user.id, habitId);
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const weekdays = t("common.weekdays", { returnObjects: true }) as string[];

  if (story === undefined) return <div className="page" />;
  if (story === null)
    return (
      <div className="page">
        <PageHead title={t("habits.title")} back />
        <Empty art="c-sad-grass" title={t("common.none")} />
      </div>
    );

  const { habit, card, cells } = story;
  const tone = (habit.tone ?? "mint") as Tone;
  const weeks: Array<typeof cells> = [];
  for (let index = 0; index < cells.length; index += 7) weeks.push(cells.slice(index, index + 7));
  const days = habit.days?.length ? habit.days.map((day) => weekdays[day]).join(" · ") : t("habits.everyDay");

  return (
    <div className="page">
      <PageHead
        title={habit.name}
        sub={`${days}${card.target > 1 ? ` · ${t("habits.perDay", { count: card.target })}` : ""}`}
        back
        actions={
          <button type="button" className="round-btn" aria-label={t("common.edit")} onClick={() => setEditing(true)}>
            <Glyph name="edit" size={20} />
          </button>
        }
      />

      <section className={`card detail-hero tone-${tone} rise`} style={at(1)}>
        <Tile name={habit.icon ?? "i-sprout"} size={72} />
        <div className="detail-hero-copy">
          <strong className="heading">{card.doneToday ? t("habits.legendDone") : t("common.today")}</strong>
          {habit.minimum ? (
            <small>
              {t("habits.minimum")}: {habit.minimum}
            </small>
          ) : null}
        </div>
        <HabitCheck card={card} userId={user.id} size={64} />
      </section>

      <div className="stat-grid rise" style={at(2)}>
        <Stat value={card.streak} label={t("habits.streak")} tone="peach" art="m-flame" />
        <Stat value={card.best} label={t("habits.best")} tone="sun" art="b-mountain" />
        <Stat value={`${Math.round(card.rate30 * 100)}%`} label={t("habits.rate")} tone="mint" />
        <Stat value={story.total} label={t("habits.total")} tone="lav" />
      </div>

      <section className="card rise" style={at(3)}>
        <div className="card-title">
          <h2 className="heading">{t("habits.heatmap")}</h2>
        </div>
        <div className="heat-wrap">
          <div className="heat-days">
            {weekdays.map((name, index) => (
              <span key={name}>{index % 2 === 0 ? name : ""}</span>
            ))}
          </div>
          <div className="heat">
            {weeks.map((week) => (
              <div key={week[0]!.key} className="heat-col">
                {week.map((cell) => (
                  <button
                    key={cell.key}
                    type="button"
                    className={`heat-cell is-${cell.state} is-${tone}`}
                    title={`${formatKey(cell.key, localeOf(), { day: "numeric", month: "short" })} · ${t(`habits.legend${cell.state === "done" ? "Done" : cell.state === "min" ? "Min" : cell.state === "rest" ? "Rest" : "Missed"}`)}`}
                    disabled={cell.state === "future" || cell.state === "off"}
                    onClick={async () => {
                      await tapHabit(user.id, habit.id, cell.key);
                      haptic(6);
                    }}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
        <Legend />
        <p className="tiny">{t("habits.weekHint")}</p>
      </section>

      <section className="card rows-card rise" style={at(4)}>
        <div className="row">
          <Tile name="i-zzz" tone="sky" size={40} />
          <span className="row-copy">
            <strong>{t("habits.pause")}</strong>
            <small>{t("habits.pauseBody")}</small>
          </span>
          <Toggle on={Boolean(habit.vacation)} label={t("habits.pause")} onChange={(vacation) => void updateHabit(user.id, habit.id, { vacation })} />
        </div>
        <button type="button" className="row" onClick={() => void moveHabit(user.id, habit.id, -1)}>
          <Glyph name="arrowUp" size={20} />
          <span className="row-copy">
            <strong>{t("habits.moveUp")}</strong>
          </span>
        </button>
        <button type="button" className="row" onClick={() => void moveHabit(user.id, habit.id, 1)}>
          <Glyph name="arrowDown" size={20} />
          <span className="row-copy">
            <strong>{t("habits.moveDown")}</strong>
          </span>
        </button>
        <button type="button" className="row is-danger" onClick={() => setConfirm(true)}>
          <Glyph name="trash" size={20} />
          <span className="row-copy">
            <strong>{t("common.delete")}</strong>
          </span>
        </button>
      </section>

      <HabitSheet open={editing} onClose={() => setEditing(false)} userId={user.id} habit={habit} />
      <Confirm
        open={confirm}
        title={`${t("common.delete")} «${habit.name}»?`}
        body={t("habits.deleteBody")}
        action={t("common.delete")}
        onClose={() => setConfirm(false)}
        onConfirm={() => {
          void deleteHabit(user.id, habit.id).then(() => {
            toast(t("common.deleted"), "c-wave");
            void navigate({ to: "/habits" });
          });
        }}
      />
    </div>
  );
}
