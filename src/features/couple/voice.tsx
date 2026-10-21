import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { FileSecret } from "@/shared/lib/crypto/e2e";
import { canRecord, fileUrl, formatDuration, startRecording, type Recorder, type Recording } from "@/shared/lib/media";
import { haptic } from "@/shared/lib/motion/fx";
import { Glyph } from "@/shared/ui/glyph";
import { toast } from "@/shared/ui/kit";

let playing: HTMLAudioElement | null = null;

/** A compact voice player: play/pause, progress, and speed (slow speeds for language practice). */
export function VoicePlayer({
  path,
  secret,
  duration,
  speeds = [1, 1.5, 2],
  tone = "light",
  label,
}: {
  path: string;
  /** The file key of an end-to-end encrypted voice message. */
  secret?: FileSecret | null;
  duration: number;
  speeds?: number[];
  tone?: "light" | "dark";
  label?: string;
}) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "playing" | "paused">("idle");
  const [time, setTime] = useState(0);
  const [speed, setSpeed] = useState(speeds[0] ?? 1);

  useEffect(
    () => () => {
      audio.current?.pause();
    },
    [],
  );

  async function toggle() {
    if (audio.current && state === "playing") {
      audio.current.pause();
      return;
    }
    if (!audio.current) {
      setState("loading");
      const url = await fileUrl(path, secret);
      if (!url) {
        setState("idle");
        return;
      }
      const element = new Audio(url);
      element.preload = "auto";
      element.onplay = () => setState("playing");
      element.onpause = () => setState("paused");
      element.onended = () => {
        setState("idle");
        setTime(0);
      };
      element.ontimeupdate = () => setTime(element.currentTime);
      audio.current = element;
    }
    if (playing && playing !== audio.current) playing.pause();
    playing = audio.current;
    audio.current.playbackRate = speed;
    // Keep pitch natural when slowed down.
    (audio.current as HTMLAudioElement & { preservesPitch?: boolean }).preservesPitch = true;
    await audio.current.play().catch(() => setState("idle"));
  }

  function cycleSpeed() {
    const next = speeds[(speeds.indexOf(speed) + 1) % speeds.length] ?? 1;
    setSpeed(next);
    if (audio.current) audio.current.playbackRate = next;
  }

  const progress = duration ? Math.min(1, time / duration) : 0;
  const bars = 22;
  return (
    <span className={`voice is-${tone}`}>
      <button type="button" className="voice-play" onClick={(event) => {
        event.stopPropagation();
        void toggle();
      }} aria-label={state === "playing" ? "Pause" : "Play"}>
        {state === "loading" ? <span className="spinner" /> : <Glyph name={state === "playing" ? "pause" : "play"} size={16} stroke={2.6} />}
      </button>
      <span className="voice-wave" aria-hidden="true">
        {Array.from({ length: bars }, (_, index) => (
          <i key={index} className={index / bars < progress ? "is-on" : ""} style={{ height: `${30 + ((index * 37) % 70)}%` }} />
        ))}
      </span>
      <span className="voice-time">{formatDuration(state === "idle" ? duration : time)}</span>
      {speeds.length > 1 ? (
        <button type="button" className="voice-speed" onClick={(event) => {
          event.stopPropagation();
          cycleSpeed();
        }}>
          {speed}×
        </button>
      ) : null}
      {label ? <span className="voice-label">{label}</span> : null}
    </span>
  );
}

/** Tap to start, tap again to finish. Shows a live level meter while recording. */
export function RecordButton({
  onDone,
  compact = false,
  label,
}: {
  onDone: (recording: Recording) => void | Promise<void>;
  compact?: boolean;
  label?: string;
}) {
  const { t } = useTranslation();
  const [recorder, setRecorder] = useState<Recorder | null>(null);
  const [level, setLevel] = useState(0);
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (!recorder) return;
    let frame = 0;
    const tick = () => {
      setLevel(recorder.level());
      setSeconds((Date.now() - recorder.startedAt) / 1000);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [recorder]);

  if (!canRecord()) return null;

  async function toggle() {
    if (recorder) {
      const result = await recorder.stop();
      setRecorder(null);
      haptic(8);
      if (result) await onDone(result);
      return;
    }
    try {
      setRecorder(await startRecording());
      haptic(10);
    } catch {
      toast(t("couple.chat.micBlocked"), "c-frown");
    }
  }

  return (
    <span className={`rec ${recorder ? "is-on" : ""} ${compact ? "is-compact" : ""}`}>
      {recorder ? (
        <>
          <button
            type="button"
            className="rec-cancel"
            aria-label={t("common.cancel")}
            onClick={() => {
              recorder.cancel();
              setRecorder(null);
            }}
          >
            <Glyph name="close" size={16} stroke={2.6} />
          </button>
          <span className="rec-live">
            <i style={{ transform: `scale(${1 + level * 1.4})` }} />
            {formatDuration(seconds)}
          </span>
        </>
      ) : null}
      <button type="button" className="rec-btn" aria-label={label ?? t("couple.chat.voice")} onClick={() => void toggle()}>
        <Glyph name={recorder ? "check" : "mic"} size={compact ? 18 : 20} stroke={2.4} />
        {label && !compact && !recorder ? <span>{label}</span> : null}
      </button>
    </span>
  );
}
