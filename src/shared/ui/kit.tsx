import { useRouter } from "@tanstack/react-router";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from "react";
import { art, type ArtName } from "@/shared/lib/art";
import { burst, haptic, pop, useMounted } from "@/shared/lib/motion/fx";
import { Glyph, type GlyphName } from "./glyph";

export type Tone = "mint" | "pink" | "lav" | "sky" | "sun" | "peach" | "cream" | "coral";

/** Stagger index for the `.rise` entrance. */
export function at(index: number): CSSProperties {
  return { "--i": index } as CSSProperties;
}

export function Art({
  name,
  className,
  alt = "",
  eager = false,
  style,
}: {
  name: ArtName | (string & {});
  className?: string;
  alt?: string;
  eager?: boolean;
  style?: CSSProperties;
}) {
  const [ready, setReady] = useState(false);
  return (
    <img
      className={`art ${ready ? "is-ready" : ""} ${className ?? ""}`}
      src={art(name as ArtName)}
      alt={alt}
      draggable={false}
      decoding="async"
      loading={eager ? "eager" : "lazy"}
      onLoad={() => setReady(true)}
      ref={(node) => {
        if (node?.complete && node.naturalWidth > 0 && !ready) setReady(true);
      }}
      style={style}
    />
  );
}

export function TopBar({
  title,
  subtitle,
  back = false,
  action,
  center = false,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  back?: boolean;
  action?: ReactNode;
  center?: boolean;
}) {
  const router = useRouter();
  return (
    <header className={`topbar ${center ? "is-center" : ""} ${back ? "has-back" : ""}`}>
      {back ? (
        <button
          className="round-btn"
          type="button"
          aria-label="←"
          onClick={() => {
            if (window.history.length > 1) router.history.back();
            else void router.navigate({ to: "/" });
          }}
        >
          <Glyph name="back" size={22} stroke={2.2} />
        </button>
      ) : null}
      <div className="topbar-copy">
        <h1 className="title">{title}</h1>
        {subtitle ? <p className="sub">{subtitle}</p> : null}
      </div>
      {action ? <div className="topbar-action">{action}</div> : center && back ? <span className="round-spacer" /> : null}
    </header>
  );
}

export function RoundButton({
  glyph,
  label,
  onClick,
  tone,
  badge = false,
}: {
  glyph: GlyphName;
  label: string;
  onClick?: () => void;
  tone?: Tone;
  badge?: boolean;
}) {
  return (
    <button className={`round-btn ${tone ? `is-${tone}` : ""}`} type="button" aria-label={label} onClick={onClick}>
      <Glyph name={glyph} size={21} stroke={2.1} />
      {badge ? <span className="round-badge" /> : null}
    </button>
  );
}

export function SectionHead({ title, action, style }: { title: ReactNode; action?: ReactNode; style?: CSSProperties }) {
  return (
    <div className="section-head rise" style={style}>
      <h2 className="heading">{title}</h2>
      {action}
    </div>
  );
}

export function Tile({ name, tone, size = 44, className }: { name: ArtName | (string & {}); tone?: Tone; size?: number; className?: string }) {
  return (
    <span className={`tile ${tone ? `is-${tone}` : ""} ${className ?? ""}`} style={{ width: size, height: size }}>
      <Art name={name} />
    </span>
  );
}

export function Ring({
  value,
  size = 96,
  stroke = 10,
  color = "var(--mint)",
  track = "var(--mint-100)",
  children,
  className,
}: {
  value: number;
  size?: number;
  stroke?: number;
  color?: string;
  track?: string;
  children?: ReactNode;
  className?: string;
}) {
  const mounted = useMounted(80);
  const radius = (size - stroke) / 2;
  const length = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const offset = length * (1 - (mounted ? clamped : 0));
  return (
    <div className={`ring ${className ?? ""}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={track} strokeWidth={stroke} />
        <circle
          className="ring-value"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={length}
          strokeDashoffset={clamped === 0 ? length : offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ opacity: clamped === 0 ? 0 : 1 }}
        />
      </svg>
      {children ? <div className="ring-center">{children}</div> : null}
    </div>
  );
}

export function Bar({ value, tone = "mint", height = 8 }: { value: number; tone?: Tone; height?: number }) {
  const mounted = useMounted(80);
  const clamped = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  return (
    <div className={`bar is-${tone}`} style={{ height }} role="presentation">
      <span style={{ transform: `scaleX(${mounted ? clamped : 0})` }} />
    </div>
  );
}

export function CheckButton({
  done,
  onToggle,
  label,
  size = 30,
  tone = "mint",
}: {
  done: boolean;
  onToggle: () => void;
  label: string;
  size?: number;
  tone?: Tone;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <button
      ref={ref}
      type="button"
      className={`check is-${tone} ${done ? "is-done" : ""}`}
      style={{ width: size, height: size }}
      aria-pressed={done}
      aria-label={label}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!done) {
          burst(ref.current, { count: 12, spread: 34 });
          haptic(10);
        }
        pop(ref.current, 1.18);
        onToggle();
      }}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6.5 12.5 10.2 16l7.3-8" />
      </svg>
    </button>
  );
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (next: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      className={`toggle ${on ? "is-on" : ""}`}
      onClick={() => {
        haptic(6);
        onChange(!on);
      }}
    >
      <span />
    </button>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  tone = "mint",
}: {
  options: ReadonlyArray<{ id: T; label: ReactNode }>;
  value: T;
  onChange: (next: T) => void;
  label: string;
  tone?: Tone;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState<{ x: number; w: number } | null>(null);

  useLayoutEffect(() => {
    const node = root.current;
    if (!node) return;
    const measure = () => {
      const active = node.querySelector<HTMLButtonElement>(`[data-id="${CSS.escape(value)}"]`);
      if (!active) return;
      setThumb({ x: active.offsetLeft, w: active.offsetWidth });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [value, options.length]);

  return (
    <div className={`segmented is-${tone}`} role="tablist" aria-label={label} ref={root}>
      {thumb ? <span className="segmented-thumb" style={{ transform: `translateX(${thumb.x}px)`, width: thumb.w }} /> : null}
      {options.map((option) => (
        <button
          key={option.id}
          data-id={option.id}
          role="tab"
          type="button"
          aria-selected={option.id === value}
          className={option.id === value ? "is-on" : ""}
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

export function Chips<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: ReadonlyArray<{ id: T; label: ReactNode }>;
  value: T;
  onChange: (next: T) => void;
  label: string;
}) {
  return (
    <div className="chips" role="tablist" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          role="tab"
          aria-selected={option.id === value}
          className={`chip ${option.id === value ? "is-on" : ""}`}
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Stepper({
  value,
  onChange,
  min = 0,
  max = 99,
  label,
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  label: string;
}) {
  return (
    <div className="stepper" aria-label={label} role="group">
      <button type="button" aria-label="−" disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))}>
        <Glyph name="minus" size={18} stroke={2.4} />
      </button>
      <span className="num" key={value}>
        {value}
      </span>
      <button type="button" aria-label="+" disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))}>
        <Glyph name="plus" size={18} stroke={2.4} />
      </button>
    </div>
  );
}

/* ---------- Toasts ---------- */

type ToastItem = { id: number; message: string; art: ArtName };
let toasts: ToastItem[] = [];
const toastListeners = new Set<() => void>();
let toastSeed = 0;

function emitToasts() {
  toastListeners.forEach((listener) => listener());
}

export function toast(message: string, artName: ArtName = "c-wave") {
  const id = ++toastSeed;
  toasts = [...toasts.slice(-1), { id, message, art: artName }];
  emitToasts();
  window.setTimeout(() => {
    toasts = toasts.filter((item) => item.id !== id);
    emitToasts();
  }, 2600);
}

export function ToastHost() {
  const items = useSyncExternalStore(
    (listener) => {
      toastListeners.add(listener);
      return () => toastListeners.delete(listener);
    },
    () => toasts,
    () => toasts,
  );
  return (
    <div className="toast-host" aria-live="polite">
      {items.map((item) => (
        <div className="toast" key={item.id} role="status">
          <Art name={item.art} eager />
          <span>{item.message}</span>
        </div>
      ))}
    </div>
  );
}

/** Keeps a value alive for exit animations. */
export function usePresence(open: boolean, duration = 320) {
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (open) {
      setMounted(true);
      const frame = requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
      return () => cancelAnimationFrame(frame);
    }
    setVisible(false);
    const timer = window.setTimeout(() => setMounted(false), duration);
    return () => window.clearTimeout(timer);
  }, [open, duration]);
  return { mounted, visible };
}
