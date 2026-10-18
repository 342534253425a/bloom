import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  pauseTogether,
  resumeTogether,
  sharedRemaining,
  startTogether,
  startTogetherBreak,
  stopTogether,
  useCouple,
  useItem,
  type FocusData,
} from "@/entities/couple";
import { usePrefs } from "@/entities/prefs";
import { formatClock } from "@/shared/lib/date";
import { burst, haptic } from "@/shared/lib/motion/fx";
import { Field, TextIn } from "@/shared/ui/bloom";
import { Glyph } from "@/shared/ui/glyph";
import { Art, toast } from "@/shared/ui/kit";

/** The shared Pomodoro: same timer on both screens; either partner can pause, resume or stop it. */
export function SharedFocusStage({ userId }: { userId: string }) {
  const { t } = useTranslation();
  const couple = useCouple();
  const prefs = usePrefs(userId);
  const item = useItem<FocusData>("focus");
  const data = item?.data;
  const [now, setNow] = useState(Date.now());
  const [label, setLabel] = useState("");
  const ring = useRef<HTMLDivElement>(null);
  const name = couple.partner?.name || "♥";
  const active = Boolean(data && data.phase !== "idle");
  const paused = active && data?.pausedLeft != null;
  const isBreak = data?.phase === "break";
  const total = data ? (isBreak ? data.breakMinutes : data.minutes) * 60_000 : (prefs?.focusMinutes ?? 25) * 60_000;
  const remaining = active ? sharedRemaining(data, now) : total;
  const progress = active ? 1 - remaining / total : 0;
  const starter = data?.by === couple.me?.id ? t("couple.you") : name;
  const size = 260;
  const stroke = 14;
  const radius = (size - stroke) / 2;
  const length = 2 * Math.PI * radius;

  useEffect(() => {
    if (!active || paused) return;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [active, paused]);

  // When time is up, close the session (both devices may do it; the log id is the same, so it is stored once).
  useEffect(() => {
    if (!active || paused || remaining > 0 || !data) return;
    if (data.phase === "focus") {
      burst(ring.current, { count: 30, spread: 140 });
      haptic([10, 60, 10, 60, 14]);
      toast(t("couple.focus.done"), "c-arms-up");
      void stopTogether(data.minutes);
    } else {
      toast(t("focus.breakOver"), "c-wave-sun");
      void stopTogether(0);
    }
  }, [active, paused, remaining, data, t]);

  return (
    <section className={`card focus-stage is-shared rise ${isBreak ? "is-break" : ""} ${active && !paused ? "is-running" : ""}`}>
      <span className="pill is-pink">
        👥 {active ? `${isBreak ? t("couple.focus.onBreak") : t("couple.focus.focusing")} · ${t("couple.focus.startedBy", { name: starter })}` : t("couple.focus.withName", { name })}
      </span>
      <div className="timer" ref={ring} style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
          <circle cx={size / 2} cy={size / 2} r={radius} className="timer-track" strokeWidth={stroke} />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            className="timer-value"
            strokeWidth={stroke}
            strokeDasharray={length}
            strokeDashoffset={length * (1 - progress)}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </svg>
        <div className="timer-center">
          <span className="timer-duo">
            <Art name="c-laptop" />
            <Art name="c-headphones" />
          </span>
          <strong className="num timer-time">{formatClock(remaining)}</strong>
          {data?.label && active ? <small className="timer-label">{data.label}</small> : null}
        </div>
      </div>
      <p className="sub center">{active ? (paused ? t("focus.paused") : t("couple.focus.body")) : t("couple.focus.idleBody", { name, minutes: prefs?.focusMinutes ?? 25 })}</p>

      {!active ? (
        <div className="focus-setup">
          <Field label={t("focus.label")}>
            <TextIn value={label} onChange={setLabel} placeholder={t("focus.labelPlaceholder")} maxLength={80} />
          </Field>
          <button
            type="button"
            className="btn is-pink is-block"
            onClick={() => {
              haptic(10);
              void startTogether(prefs?.focusMinutes ?? 25, prefs?.breakMinutes ?? 5, label || null);
            }}
          >
            <Glyph name="play" size={20} />
            {t("couple.focus.start", { minutes: prefs?.focusMinutes ?? 25 })}
          </button>
        </div>
      ) : (
        <div className="btn-row is-center">
          {paused ? (
            <button type="button" className="btn is-pink" onClick={() => void resumeTogether()}>
              <Glyph name="play" size={20} />
              {t("focus.resume")}
            </button>
          ) : (
            <button type="button" className="btn is-soft" onClick={() => void pauseTogether()}>
              <Glyph name="pause" size={20} stroke={2.6} />
              {t("focus.pause")}
            </button>
          )}
          {!isBreak ? (
            <button type="button" className="btn is-soft" onClick={() => void startTogetherBreak()}>
              ☕ {t("couple.focus.breakNow")}
            </button>
          ) : null}
          <button
            type="button"
            className="btn is-ghost"
            onClick={() => void stopTogether(isBreak ? 0 : Math.round((total - remaining) / 60_000))}
          >
            {t("couple.focus.stop")}
          </button>
        </div>
      )}
    </section>
  );
}
