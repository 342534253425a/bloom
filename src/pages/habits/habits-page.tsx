import { useState } from "react";
import { useTranslation } from "react-i18next";
import { tapHabit, useHabitBoard } from "@/entities/habit";
import { setVacation } from "@/entities/prefs";
import { useUser } from "@/entities/session";
import { HabitItem } from "@/features/habit/habit-item";
import { HabitSheet } from "@/features/habit/habit-sheet";
import { localeOf } from "@/shared/i18n";
import { formatKey } from "@/shared/lib/date";
import { useIntent } from "@/shared/lib/intent";
import { haptic } from "@/shared/lib/motion/fx";
import { Empty, PageHead, Section } from "@/shared/ui/bloom";
import { Glyph } from "@/shared/ui/glyph";
import { Ring, Tile, Toggle, at, toast } from "@/shared/ui/kit";
import { Tour } from "@/widgets/tour/tour";

export function HabitsPage() {
  const { t } = useTranslation();
  const user = useUser();
  const board = useHabitBoard(user.id);
  const [open, setOpen] = useState(false);
  useIntent("habit", () => setOpen(true));

  const weekdays = t("common.weekdays", { returnObjects: true }) as string[];
  const weekKeys = board?.cards[0]?.week.map((day) => day.key) ?? [];

  return (
    <div className="page">
      <PageHead
        title={t("habits.title")}
        sub={t("habits.sub")}
        art="i-sprout"
        help="habits"
        actions={
          <button type="button" className="btn is-sm desk-only" onClick={() => setOpen(true)}>
            <Glyph name="plus" size={18} stroke={2.6} />
            {t("habits.new")}
          </button>
        }
      />

      {board && board.cards.length === 0 ? (
        <Empty
          art="c-watering"
          title={t("habits.empty")}
          body={t("habits.emptyBody")}
          action={
            <button type="button" className="btn" onClick={() => setOpen(true)}>
              <Glyph name="plus" size={18} stroke={2.6} />
              {t("habits.new")}
            </button>
          }
        />
      ) : null}

      {board && board.cards.length > 0 ? (
        <>
          <section data-tour="habits-hero" className="card habits-hero tone-mint rise" style={at(1)}>
            <Ring value={board.planned ? board.done / board.planned : 0} size={96} stroke={11}>
              <span className="ring-copy">
                <strong className="num">
                  {board.done}/{board.planned}
                </strong>
                <small>{t("habits.today")}</small>
              </span>
            </Ring>
            <div className="habits-hero-copy">
              <strong className="heading">{t("habits.doneOf", { done: board.done, total: board.planned })}</strong>
              <span className="streak-chip is-big">
                <Glyph name="flame" size={16} fill />
                {t("habits.streak")}: {t("common.days", { count: board.bestStreak })}
              </span>
            </div>
          </section>

          <div className="two-col">
            <Section title={t("habits.today")}>
              <div className="hlist is-cards">
                {board.cards.map((card) => (
                  <HabitItem key={card.id} card={card} userId={user.id} showWeek />
                ))}
              </div>
              <button type="button" data-tour="habits-add" className="btn is-soft is-block" onClick={() => setOpen(true)}>
                <Glyph name="plus" size={18} stroke={2.6} />
                {t("habits.new")}
              </button>
            </Section>

            <div className="side-stack">
              <Section title={t("habits.week")}>
                <div className="card week-grid-card" data-tour="habits-week">
                  <p className="tiny">{t("habits.weekHint")}</p>
                  <div className="week-grid">
                    <span />
                    {weekKeys.map((key) => (
                      <span key={key} className={`wg-head ${key === board.today ? "is-today" : ""}`}>
                        {weekdays[(new Date(`${key}T12:00:00`).getDay() + 6) % 7]}
                        <b>{key.slice(8)}</b>
                      </span>
                    ))}
                    {board.cards.map((card) => (
                      <WeekRow key={card.id} name={card.name} icon={card.icon ?? "i-sprout"} tone={card.tone ?? "mint"}>
                        {card.week.map((day) => (
                          <button
                            key={day.key}
                            type="button"
                            className={`wg-cell is-${day.state} is-${card.tone ?? "mint"}`}
                            disabled={day.state === "future"}
                            aria-label={`${card.name} ${day.key}`}
                            onClick={async () => {
                              const result = await tapHabit(user.id, card.id, day.key);
                              haptic(6);
                              if (result === "done" && day.key !== board.today) {
                                toast(t("habits.makeup", { date: formatKey(day.key, localeOf(), { day: "numeric", month: "short" }) }), "c-hug-star");
                              }
                            }}
                          >
                            {day.state === "done" || day.state === "min" ? <Glyph name="check" size={14} stroke={3} /> : day.state === "rest" ? <Glyph name="palm" size={13} /> : null}
                          </button>
                        ))}
                      </WeekRow>
                    ))}
                  </div>
                  <Legend />
                </div>
              </Section>

              <section className="card vacation-card rise" data-tour="habits-vacation">
                <Tile name="i-plane" tone="sky" size={44} />
                <span className="row-copy">
                  <strong>{t("habits.vacation")}</strong>
                  <small>{t("habits.vacationBody")}</small>
                </span>
                <Toggle
                  on={board.vacation}
                  label={t("habits.vacation")}
                  onChange={(on) => {
                    void setVacation(user.id, on);
                    toast(on ? t("habits.vacationOn") : t("habits.vacationOff"), on ? "c-sleep-cloud" : "c-wave-sun");
                  }}
                />
              </section>
            </div>
          </div>
        </>
      ) : null}

      <Tour id="habits" />
      <HabitSheet open={open} onClose={() => setOpen(false)} userId={user.id} />
    </div>
  );
}

function WeekRow({ name, icon, tone, children }: { name: string; icon: string; tone: string; children: React.ReactNode }) {
  return (
    <>
      <span className="wg-name">
        <Tile name={icon} tone={tone as never} size={26} />
        <span>{name}</span>
      </span>
      {children}
    </>
  );
}

export function Legend() {
  const { t } = useTranslation();
  return (
    <div className="legend">
      <span>
        <i className="is-done" /> {t("habits.legendDone")}
      </span>
      <span>
        <i className="is-min" /> {t("habits.legendMin")}
      </span>
      <span>
        <i className="is-missed" /> {t("habits.legendMissed")}
      </span>
      <span>
        <i className="is-rest" /> {t("habits.legendRest")}
      </span>
    </div>
  );
}
