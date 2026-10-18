import { Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { clearHabitDay, logMinimum, tapHabit, type HabitCard } from "@/entities/habit";
import { pointRules } from "@/entities/progress";
import { burst, haptic, pop } from "@/shared/lib/motion/fx";
import { Glyph } from "@/shared/ui/glyph";
import { Art, Tile, toast, type Tone } from "@/shared/ui/kit";
import { Sheet } from "@/shared/ui/sheet";

export function HabitCheck({ card, userId, size = 46 }: { card: HabitCard; userId: string; size?: number }) {
  const { t } = useTranslation();
  const ref = useRef<HTMLButtonElement>(null);
  const counted = card.target > 1;
  const ratio = card.doneToday ? 1 : Math.min(1, card.count / card.target);
  const stroke = 4;
  const radius = (size - stroke) / 2;
  const length = 2 * Math.PI * radius;
  return (
    <button
      ref={ref}
      type="button"
      data-tour="habits-check"
      className={`hcheck is-${card.tone ?? "mint"} ${card.doneToday ? "is-done" : ""} ${card.minToday ? "is-min" : ""}`}
      style={{ width: size, height: size }}
      aria-pressed={card.doneToday}
      aria-label={card.name}
      onClick={async (event) => {
        event.preventDefault();
        event.stopPropagation();
        pop(ref.current, 1.16);
        const result = await tapHabit(userId, card.id);
        if (result === "done") {
          burst(ref.current, { count: 14, spread: 40 });
          haptic([8, 40, 10]);
          toast(t("habits.checked", { points: pointRules.habit }), "c-arms-up");
        } else if (result === "progress") {
          haptic(6);
          toast(t("habits.progress", { count: card.count + 1, target: card.target }), "c-mug");
        } else haptic(4);
      }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={radius} className="hcheck-track" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          className="hcheck-ring"
          strokeWidth={stroke}
          strokeDasharray={length}
          strokeDashoffset={length * (1 - ratio)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      {card.doneToday ? (
        <Glyph name="check" size={size * 0.46} stroke={3} className="hcheck-mark" />
      ) : counted ? (
        <span className="hcheck-count num">
          {card.count}
          <small>/{card.target}</small>
        </span>
      ) : (
        <Glyph name="plus" size={size * 0.38} stroke={2.4} className="hcheck-plus" />
      )}
    </button>
  );
}

export function HabitItem({ card, userId, showWeek = false }: { card: HabitCard; userId: string; showWeek?: boolean }) {
  const { t } = useTranslation();
  const [menu, setMenu] = useState(false);
  const tone = (card.tone ?? "mint") as Tone;
  const resting = card.vacation;
  const sub = card.minToday
    ? `${t("habits.minimum")} · ${card.minimum ?? ""}`
    : !card.plannedToday && !card.doneToday
      ? t("habits.notToday")
      : card.target > 1
        ? t("habits.perDay", { count: card.target })
        : card.minimum
          ? `${t("habits.minimum")}: ${card.minimum}`
          : t(`spaces.habits.name`);
  return (
    <div data-tour="habits-item" className={`hitem ${card.doneToday ? "is-done" : ""} ${resting ? "is-rest" : ""}`}>
      <Link to="/habits/$habitId" params={{ habitId: card.id }} className="hitem-main">
        <Tile name={card.icon ?? "i-sprout"} tone={tone} size={46} />
        <span className="hitem-copy">
          <strong>{card.name}</strong>
          <small>
            {card.streak > 0 ? (
              <span className="streak-chip">
                <Glyph name="flame" size={13} fill />
                {card.streak}
              </span>
            ) : null}
            <span className="hitem-sub">{sub}</span>
          </small>
          {showWeek ? (
            <span className="mini-week" aria-hidden="true">
              {card.week.map((day) => (
                <i key={day.key} className={`is-${day.state}`} />
              ))}
            </span>
          ) : null}
        </span>
      </Link>
      <button type="button" data-tour="habits-menu" className="hitem-more" aria-label={t("common.more")} onClick={() => setMenu(true)}>
        <Glyph name="more" size={18} />
      </button>
      <HabitCheck card={card} userId={userId} />

      <Sheet open={menu} title={card.name} closeLabel={t("common.close")} onClose={() => setMenu(false)}>
        <div className="menu-head">
          <Tile name={card.icon ?? "i-sprout"} tone={tone} size={56} />
          <div>
            <h2>{card.name}</h2>
            <p className="sub">
              {t("habits.streak")}: {t("common.days", { count: card.streak })} · {t("habits.best")}: {card.best}
            </p>
          </div>
        </div>
        {card.minimum ? (
          <button
            type="button"
            className="menu-action is-min"
            onClick={async () => {
              await logMinimum(userId, card.id);
              setMenu(false);
              haptic([8, 40, 10]);
              toast(t("habits.minimumDone"), "c-hug-heart");
            }}
          >
            <Art name="c-sit-calm" />
            <span>
              <strong>{t("habits.doMinimum", { text: card.minimum })}</strong>
              <small>{t("habits.minimumHint")}</small>
            </span>
          </button>
        ) : null}
        {card.count > 0 || card.doneToday ? (
          <button
            type="button"
            className="menu-action"
            onClick={async () => {
              await clearHabitDay(userId, card.id);
              setMenu(false);
            }}
          >
            <Glyph name="reset" size={20} />
            <span>
              <strong>{t("habits.clear")}</strong>
            </span>
          </button>
        ) : null}
        <Link to="/habits/$habitId" params={{ habitId: card.id }} className="menu-action" onClick={() => setMenu(false)}>
          <Glyph name="chart" size={20} />
          <span>
            <strong>{t("common.open")}</strong>
            <small>
              {t("habits.heatmap")} · {t("common.edit")}
            </small>
          </span>
        </Link>
      </Sheet>
    </div>
  );
}
