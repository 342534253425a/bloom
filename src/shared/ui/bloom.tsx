import { useRouter } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { Mood, Tone as ToneKey } from "@/shared/db";
import { tones, type HelpKey } from "@/shared/config/spaces";
import { haptic, pop } from "@/shared/lib/motion/fx";
import { moodArt } from "@/shared/lib/art/look";
import { Glyph, type GlyphName } from "./glyph";
import { Art, Tile, type Tone } from "./kit";
import { Sheet } from "./sheet";
import { replayTour } from "@/widgets/tour/tour";

/* ---------- Page head with a help "?" ---------- */

export function PageHead({
  title,
  sub,
  art,
  help,
  back = false,
  actions,
}: {
  title: ReactNode;
  sub?: ReactNode;
  art?: string;
  help?: HelpKey;
  back?: boolean;
  actions?: ReactNode;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <header className="phead rise">
      {back ? (
        <button
          type="button"
          className="round-btn phead-back"
          aria-label={t("common.back")}
          onClick={() => {
            if (window.history.length > 1) router.history.back();
            else void router.navigate({ to: "/" });
          }}
        >
          <Glyph name="back" size={22} stroke={2.2} />
        </button>
      ) : null}
      {art ? <Tile name={art} size={52} className="phead-art" /> : null}
      <div className="phead-copy">
        <h1 className="title">{title}</h1>
        {sub ? <p className="sub">{sub}</p> : null}
      </div>
      <div className="phead-actions">
        {actions}
        {help ? (
          <button type="button" className="round-btn is-help" data-tour="help" aria-label={t("common.help")} onClick={() => setOpen(true)}>
            <Glyph name="help" size={22} stroke={2} />
          </button>
        ) : null}
      </div>
      {help ? <HelpSheet topic={help} open={open} onClose={() => setOpen(false)} /> : null}
    </header>
  );
}

export function HelpSheet({ topic, open, onClose }: { topic: HelpKey; open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const steps = t(`help.${topic}.steps`, { returnObjects: true }) as string[];
  const name = topic === "focus" ? t("focus.title") : t(`spaces.${topic}.name`);
  const why = topic === "focus" ? null : t(`spaces.${topic}.why`);
  return (
    <Sheet open={open} title={name} closeLabel={t("common.gotIt")} onClose={onClose}>
      <div className="help">
        <Art name="c-hold-daisy" className="help-art float" eager />
        <p className="eyebrow">{t("common.help")}</p>
        <h2>{name}</h2>
        <p className="help-what">{t(`help.${topic}.what`)}</p>
        {why ? (
          <div className="help-why">
            <Glyph name="heart" size={18} />
            <span>
              <b>{t("common.why")}: </b>
              {why}
            </span>
          </div>
        ) : null}
        <p className="eyebrow">{t("common.howTo")}</p>
        <ol className="help-steps">
          {steps.map((step, index) => (
            <li key={step}>
              <span className="help-num">{index + 1}</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
        <button
          type="button"
          className="btn is-soft is-block"
          onClick={() => {
            onClose();
            window.setTimeout(() => replayTour(topic), 400);
          }}
        >
          <Glyph name="sparkle" size={18} />
          {t("tour.replay")}
        </button>
        <div className="help-tip">
          <Glyph name="sparkle" size={18} />
          <span>
            <b>{t("common.tip")}: </b>
            {t(`help.${topic}.tip`)}
          </span>
        </div>
      </div>
    </Sheet>
  );
}

/* ---------- Building blocks ---------- */

export function Section({ title, action, children, className, tour }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; tour?: string }) {
  return (
    <section className={`sect ${className ?? ""}`} data-tour={tour}>
      {title || action ? (
        <div className="sect-head">
          {title ? <h2 className="heading">{title}</h2> : <span />}
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function Empty({ art, title, body, action }: { art: string; title: ReactNode; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <Art name={art} className="empty-art float" />
      <strong className="heading">{title}</strong>
      {body ? <p className="sub">{body}</p> : null}
      {action}
    </div>
  );
}

export function Field({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint ? <small className="field-hint">{hint}</small> : null}
    </label>
  );
}

export function TextIn({
  value,
  onChange,
  placeholder,
  type = "text",
  onEnter,
  autoFocus,
  maxLength = 160,
  inputMode,
  min,
  max,
  step,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  type?: "text" | "date" | "time" | "number" | "search";
  onEnter?: () => void;
  autoFocus?: boolean;
  maxLength?: number;
  inputMode?: "decimal" | "numeric" | "text";
  min?: number | string;
  max?: number | string;
  step?: number | string;
}) {
  return (
    <span className="input">
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        maxLength={maxLength}
        inputMode={inputMode}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && onEnter) {
            event.preventDefault();
            onEnter();
          }
        }}
      />
    </span>
  );
}

export function TextArea({ value, onChange, placeholder, rows = 3, maxLength = 4000 }: { value: string; onChange: (next: string) => void; placeholder?: string; rows?: number; maxLength?: number }) {
  return (
    <span className="input is-area">
      <textarea value={value} rows={rows} placeholder={placeholder} maxLength={maxLength} onChange={(event) => onChange(event.target.value)} />
    </span>
  );
}

export function Confirm({
  open,
  title,
  body,
  action,
  danger = true,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  body?: string;
  action: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Sheet open={open} title={title} closeLabel={t("common.cancel")} onClose={onClose}>
      <Art name="c-frown" className="sheet-hero float" eager />
      <h2>{title}</h2>
      {body ? <p className="sub">{body}</p> : null}
      <button
        type="button"
        className={`btn is-block ${danger ? "is-coral" : ""}`}
        onClick={() => {
          onConfirm();
          onClose();
        }}
      >
        {action}
      </button>
    </Sheet>
  );
}

export function IconButton({ glyph, label, onClick, tone, className }: { glyph: GlyphName; label: string; onClick: () => void; tone?: Tone; className?: string }) {
  return (
    <button type="button" className={`icon-btn ${tone ? `is-${tone}` : ""} ${className ?? ""}`} aria-label={label} title={label} onClick={onClick}>
      <Glyph name={glyph} size={19} stroke={2.1} />
    </button>
  );
}

/* ---------- Pickers ---------- */

export const moodList: Mood[] = ["happy", "calm", "okay", "tired", "anxious", "sad"];

export function MoodPicker({ value, onPick, compact = false }: { value: Mood | null | undefined; onPick: (mood: Mood) => void; compact?: boolean }) {
  const { t } = useTranslation();
  return (
    <div className={`mood-row ${compact ? "is-compact" : ""}`} role="radiogroup" aria-label={t("body.mood")}>
      {moodList.map((mood) => (
        <button
          key={mood}
          type="button"
          role="radio"
          aria-checked={value === mood}
          className={`mood-btn ${value === mood ? "is-on" : ""} ${value && value !== mood ? "is-dim" : ""}`}
          onClick={(event) => {
            pop(event.currentTarget, 1.15);
            haptic(8);
            onPick(mood);
          }}
        >
          <Art name={moodArt[mood]} />
          <span>{t(`body.moods.${mood}`)}</span>
        </button>
      ))}
    </div>
  );
}

export function EnergyPicker({ value, onPick }: { value: number | null | undefined; onPick: (level: number) => void }) {
  const { t } = useTranslation();
  const labels = t("body.energyLevels", { returnObjects: true }) as string[];
  return (
    <div className="energy-pick" role="radiogroup" aria-label={t("body.energy")}>
      {[1, 2, 3, 4, 5].map((level) => (
        <button
          key={level}
          type="button"
          role="radio"
          aria-checked={value === level}
          title={labels[level - 1]}
          className={`energy-dot ${value && value >= level ? "is-on" : ""} ${value === level ? "is-current" : ""}`}
          onClick={(event) => {
            pop(event.currentTarget, 1.2);
            haptic(6);
            onPick(level);
          }}
        >
          <Glyph name="bolt" size={16} fill={Boolean(value && value >= level)} />
          <span>{level}</span>
        </button>
      ))}
      <span className="energy-label">{value ? labels[value - 1] : "—"}</span>
    </div>
  );
}

export function IconPicker({ icons, value, onPick }: { icons: string[]; value: string; onPick: (icon: string) => void }) {
  return (
    <div className="icon-pick">
      {icons.map((icon) => (
        <button key={icon} type="button" className={`icon-opt ${icon === value ? "is-on" : ""}`} aria-pressed={icon === value} onClick={() => onPick(icon)}>
          <Art name={icon} />
        </button>
      ))}
    </div>
  );
}

export function TonePicker({ value, onPick }: { value: ToneKey; onPick: (tone: ToneKey) => void }) {
  return (
    <div className="tone-pick">
      {tones.map((tone) => (
        <button key={tone} type="button" aria-label={tone} aria-pressed={tone === value} className={`tone-opt is-${tone} ${tone === value ? "is-on" : ""}`} onClick={() => onPick(tone)}>
          {tone === value ? <Glyph name="check" size={16} stroke={3} /> : null}
        </button>
      ))}
    </div>
  );
}

export function DaysPicker({ value, onChange }: { value: number[]; onChange: (days: number[]) => void }) {
  const { t } = useTranslation();
  const names = t("common.weekdays", { returnObjects: true }) as string[];
  const all = value.length === 0 || value.length === 7;
  return (
    <div className="days-pick">
      <div className="chips is-wrap">
        <button type="button" className={`chip ${all ? "is-on" : ""}`} onClick={() => onChange([])}>
          {t("habits.everyDay")}
        </button>
        <button type="button" className={`chip ${!all && value.join() === "0,1,2,3,4" ? "is-on" : ""}`} onClick={() => onChange([0, 1, 2, 3, 4])}>
          {t("habits.weekdays")}
        </button>
      </div>
      <div className="day-dots">
        {names.map((name, index) => {
          const on = all || value.includes(index);
          return (
            <button
              key={name}
              type="button"
              aria-pressed={on}
              className={`day-dot ${on ? "is-on" : ""}`}
              onClick={() => {
                const base = all ? [0, 1, 2, 3, 4, 5, 6] : value;
                const next = base.includes(index) ? base.filter((day) => day !== index) : [...base, index].sort();
                onChange(next.length === 7 ? [] : next.length === 0 ? [index] : next);
              }}
            >
              {name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function Tabs<T extends string>({ value, options, onChange, tour }: { value: T; options: Array<{ id: T; label: ReactNode }>; onChange: (next: T) => void; tour?: string }) {
  return (
    <div className="tabs" role="tablist" data-tour={tour}>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          role="tab"
          aria-selected={option.id === value}
          className={`tab ${option.id === value ? "is-on" : ""}`}
          onClick={() => {
            if (option.id !== value) haptic(5);
            onChange(option.id);
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Stat({ value, label, tone = "mint", art }: { value: ReactNode; label: ReactNode; tone?: Tone; art?: string }) {
  return (
    <div className={`stat tone-${tone}`}>
      {art ? <Art name={art} className="stat-art" /> : null}
      <strong className="num">{value}</strong>
      <small>{label}</small>
    </div>
  );
}
