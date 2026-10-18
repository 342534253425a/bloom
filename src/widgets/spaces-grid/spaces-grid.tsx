import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useDay } from "@/entities/day";
import { flatten, useGoalTree } from "@/entities/goal";
import { useHabitBoard } from "@/entities/habit";
import { useReview } from "@/entities/journal";
import { usePartner, useSharing } from "@/entities/prefs";
import { usePeriodStats, useProgress } from "@/entities/progress";
import { useTasksOn } from "@/entities/task";
import { spaces, type SpaceKey } from "@/shared/config/spaces";
import { addDays, dateKey } from "@/shared/lib/date";
import { Glyph } from "@/shared/ui/glyph";
import { Tile, at } from "@/shared/ui/kit";

function useSpaceStats(userId: string): Partial<Record<SpaceKey, string>> {
  const { t } = useTranslation();
  const today = dateKey();
  const goals = useGoalTree(userId);
  const board = useHabitBoard(userId);
  const tasks = useTasksOn(userId, today);
  const day = useDay(userId, today);
  const review = useReview(userId, "day", today);
  const week = usePeriodStats(userId, addDays(today, -6), today);
  const partner = usePartner(userId);
  const share = useSharing(userId);
  const progress = useProgress(userId);

  const allGoals = flatten(goals ?? []).filter((goal) => !goal.parentId);
  const avg = allGoals.length ? Math.round((allGoals.reduce((sum, goal) => sum + goal.progress, 0) / allGoals.length) * 100) : null;
  const tops = (tasks ?? []).filter((task) => task.top);
  const open = (tasks ?? []).filter((task) => !task.done).length;
  return {
    goals: avg === null ? t("common.none") : `${allGoals.length} · ${avg}%`,
    habits: board ? `${board.done}/${board.planned} ${t("common.today").toLowerCase()}` : undefined,
    tasks: tasks ? `${open} · ${t("tasks.top")} ${tops.filter((task) => task.done).length}/${tops.length || 3}` : undefined,
    body: day?.mood ? t(`body.moods.${day.mood}`) : "—",
    reflect: review ? "✓" : `2 ${t("common.min")}`,
    stats: week ? `${Math.round(week.rate * 100)}% · ${t("common.week").toLowerCase()}` : undefined,
    together: partner ? partner.name : t("common.private"),
    garden: progress ? `${t("garden.level", { level: progress.level.level })} · ${progress.balance} ${t("common.pts")}` : undefined,
    privacy: share ? (t(`privacy.modes.${share.mode}`, { returnObjects: true }) as string[])[0] : undefined,
  };
}

export function SpacesGrid({ userId, detailed = false }: { userId: string; detailed?: boolean }) {
  const { t } = useTranslation();
  const stats = useSpaceStats(userId);
  return (
    <div className={`spaces ${detailed ? "is-detailed" : ""}`}>
      {spaces.map((space, index) => (
        <Link key={space.key} to={space.to} className={`space card tone-${space.tone} pressable rise`} style={at(index)}>
          <span className="space-top">
            <Tile name={space.art} size={detailed ? 54 : 46} />
            <span className="space-num">{space.number}</span>
          </span>
          <strong className="space-name">{t(`spaces.${space.key}.name`)}</strong>
          <small className="space-short">{t(`spaces.${space.key}.short`)}</small>
          {detailed ? <small className="space-why">{t(`spaces.${space.key}.why`)}</small> : null}
          <span className="space-foot">
            <span className="space-stat">{stats[space.key] ?? "…"}</span>
            <Glyph name="chevron" size={16} stroke={2.4} />
          </span>
        </Link>
      ))}
    </div>
  );
}
