import { useState } from "react";
import { useTranslation } from "react-i18next";
import { usePrefs } from "@/entities/prefs";
import { usePeriodStats, useProgress, type Insight } from "@/entities/progress";
import { useUser } from "@/entities/session";
import { localeOf } from "@/shared/i18n";
import { dateKey, formatKey, monthOf, weekOf } from "@/shared/lib/date";
import { Empty, PageHead, Section, Stat, Tabs } from "@/shared/ui/bloom";
import { Columns, Line } from "@/shared/ui/charts";
import { Glyph } from "@/shared/ui/glyph";
import { Art, Bar, Ring, Tile, at, toast } from "@/shared/ui/kit";
import { shell } from "@/shared/lib/native";
import { Tour } from "@/widgets/tour/tour";

const insightArt: Record<Insight["kind"], string> = {
  bestTime: "o-sun",
  skipped: "c-sad-grass",
  strongest: "m-flame",
  bestDay: "i-sun",
  sleepMood: "i-moon",
  focusDay: "o-headphones",
};

export async function shareText(text: string, t: (key: string) => string) {
  try {
    if (shell === "android") {
      const { Share } = await import("@capacitor/share");
      await Share.share({ text });
      return;
    }
    if (navigator.share) {
      await navigator.share({ text });
      return;
    }
  } catch {
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    toast(t("common.copied"), "c-hug-heart");
  } catch {
    window.prompt("", text);
  }
}

export function StatsPage() {
  const { t } = useTranslation();
  const user = useUser();
  const prefs = usePrefs(user.id);
  const [period, setPeriod] = useState<"week" | "month">("week");
  const today = dateKey();
  const keys = period === "week" ? weekOf(today, prefs?.weekStart ?? "monday") : monthOf(today);
  const stats = usePeriodStats(user.id, keys[0]!, keys.at(-1)!);
  const progress = useProgress(user.id);
  const weekdays = t("common.weekdays", { returnObjects: true }) as string[];
  const longDays = t("common.weekdaysLong", { returnObjects: true }) as string[];

  const label = (key: string) => (period === "week" ? weekdays[(new Date(`${key}T12:00:00`).getDay() + 6) % 7]! : key.slice(8).replace(/^0/, ""));
  const full = (key: string) => formatKey(key, localeOf(), { weekday: "long", day: "numeric", month: "short" });
  const shownDays = keys.map((key) => stats?.days.find((day) => day.key === key) ?? { key, rate: null, focus: 0, mood: null, energy: null });

  const delta = stats && stats.previousRate !== null ? Math.round((stats.rate - stats.previousRate) * 100) : null;

  function insightText(insight: Insight): string {
    switch (insight.kind) {
      case "bestTime":
        return t("stats.insight.bestTime", { part: t(`stats.parts.${insight.part}`), share: Math.round(insight.share * 100) });
      case "skipped":
        return t("stats.insight.skipped", { name: insight.name, rate: Math.round(insight.rate * 100) });
      case "strongest":
        return t("stats.insight.strongest", { name: insight.name, streak: insight.streak });
      case "bestDay":
        return t("stats.insight.bestDay", { day: longDays[insight.weekday], rate: Math.round(insight.rate * 100) });
      case "sleepMood":
        return t("stats.insight.sleepMood");
      case "focusDay":
        return t("stats.insight.focusDay", { day: longDays[insight.weekday], minutes: insight.minutes });
    }
  }

  const reportTitle =
    period === "week"
      ? t("stats.reportWeek", { date: formatKey(keys[0]!, localeOf(), { day: "numeric", month: "long" }) })
      : t("stats.reportMonth", { date: formatKey(today, localeOf(), { month: "long", year: "numeric" }) });

  const summary = stats
    ? t("stats.shareText", {
        period: period === "week" ? t("stats.periodWeek") : t("stats.periodMonth"),
        rate: Math.round(stats.rate * 100),
        tasks: stats.tasksDone,
        focus: stats.focusMinutes,
        streak: progress?.currentBest ?? 0,
      })
    : "";

  return (
    <div className="page">
      <Tour id="stats" />
      <PageHead title={t("stats.title")} sub={t("stats.sub")} art="i-bars" help="stats" back />
      <Tabs
        tour="stats-period"
        value={period}
        onChange={setPeriod}
        options={[
          { id: "week", label: t("stats.week") },
          { id: "month", label: t("stats.month") },
        ]}
      />

      {!stats ? null : (
        <>
          <section data-tour="stats-report" className="card report tone-lav rise" style={at(1)}>
            <Ring value={stats.rate} size={112} stroke={12} color="var(--lav)" track="rgba(255,255,255,.75)">
              <span className="ring-copy">
                <strong className="num">{Math.round(stats.rate * 100)}%</strong>
                <small>{t("stats.completion")}</small>
              </span>
            </Ring>
            <div className="report-copy">
              <p className="eyebrow">{t("stats.report")}</p>
              <strong className="heading">{reportTitle}</strong>
              {delta !== null ? (
                <span className={`pill ${delta >= 0 ? "" : "is-pink"}`}>
                  <Glyph name={delta >= 0 ? "arrowUp" : "arrowDown"} size={13} stroke={2.6} />
                  {t("stats.vsLast", { delta: `${delta >= 0 ? "+" : ""}${delta}%` })}
                </span>
              ) : null}
              <p className="sub">{summary}</p>
              <button type="button" className="btn is-sm is-soft" onClick={() => void shareText(summary, t)}>
                <Glyph name="share" size={18} />
                {t("stats.share")}
              </button>
            </div>
          </section>

          <div className="stat-grid" data-tour="stats-tiles">
            <Stat value={progress?.currentBest ?? 0} label={t("stats.streak")} tone="peach" art="m-flame" />
            <Stat value={progress?.bestStreak ?? 0} label={t("stats.best")} tone="sun" art="b-mountain" />
            <Stat value={`${Math.round((stats.focusMinutes / 60) * 10) / 10} ${t("common.h")}`} label={t("stats.focus")} tone="pink" />
            <Stat value={stats.tasksDone} label={t("stats.tasks")} tone="sky" />
            <Stat value={stats.checkInDays} label={t("stats.checkIns")} tone="mint" />
            <Stat value={progress?.level.level ?? 1} label={`${t("stats.level")} · ${progress?.earned ?? 0} ${t("common.pts")}`} tone="lav" />
          </div>

          <div className="two-col" data-tour="stats-charts">
            <section className="card rise">
              <div className="card-title">
                <h2 className="heading">{t("stats.trend")}</h2>
              </div>
              <Columns
                data={shownDays.map((day) => ({ label: label(day.key), value: day.rate === null ? null : Math.round(day.rate * 100), title: full(day.key) }))}
                max={100}
                format={(value) => `${value}%`}
              />
            </section>
            <section className="card rise">
              <div className="card-title">
                <h2 className="heading">{t("stats.focusTrend")}</h2>
              </div>
              <Columns data={shownDays.map((day) => ({ label: label(day.key), value: day.focus, title: full(day.key) }))} format={(value) => `${value} ${t("common.min")}`} color="var(--pink)" />
            </section>
            <section className="card rise">
              <div className="card-title">
                <h2 className="heading">{t("body.mood")}</h2>
                <span className="tiny">1–5</span>
              </div>
              <Line data={shownDays.map((day) => ({ label: label(day.key), value: day.mood, title: full(day.key) }))} min={1} max={5} format={(value) => `${value}/5`} color="var(--sun-600)" />
            </section>
            <section className="card rise">
              <div className="card-title">
                <h2 className="heading">{t("body.energy")}</h2>
                <span className="tiny">1–5</span>
              </div>
              <Line data={shownDays.map((day) => ({ label: label(day.key), value: day.energy, title: full(day.key) }))} min={1} max={5} format={(value) => `${value}/5`} color="var(--lav)" />
            </section>
          </div>

          <div className="two-col">
            <Section title={t("stats.insights")} tour="stats-insights">
              {stats.insights.length === 0 ? (
                <div className="card all-done">
                  <Art name="c-calm-sparkles" />
                  <span>{t("stats.noInsights")}</span>
                </div>
              ) : (
                <div className="insights">
                  {stats.insights.map((insight, index) => (
                    <div key={insight.kind} className="card insight rise" style={at(index)}>
                      <Tile name={insightArt[insight.kind]} size={44} />
                      <p>{insightText(insight)}</p>
                    </div>
                  ))}
                </div>
              )}
            </Section>
            <Section title={t("stats.perHabit")}>
              {stats.perHabit.length === 0 ? (
                <Empty art="c-watering" title={t("stats.empty")} />
              ) : (
                <section className="card">
                  {stats.perHabit.map((row) => (
                    <div key={row.id} className="rate-row">
                      <Tile name={row.icon} tone={row.tone as never} size={32} />
                      <span>{row.name}</span>
                      <Bar value={row.rate} tone={row.tone as never} height={7} />
                      <b className="num">
                        {row.done}/{row.planned}
                      </b>
                    </div>
                  ))}
                </section>
              )}
            </Section>
          </div>

          {progress ? (
            <Section title={`${t("stats.badges")} · ${progress.badges.filter((badge) => badge.earned).length}/${progress.badges.length}`}>
              <div className="badge-strip">
                {progress.badges.map((badge) => {
                  const [name] = t(`garden.badge.${badge.id}`, { returnObjects: true }) as string[];
                  return (
                    <span key={badge.id} className={`badge-mini ${badge.earned ? "is-on" : ""}`} title={name}>
                      <Art name={badge.art} />
                    </span>
                  );
                })}
              </div>
            </Section>
          ) : null}
        </>
      )}
    </div>
  );
}
