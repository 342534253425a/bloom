import { useEffect, useRef, useState } from "react";

export function motionOk(): boolean {
  return typeof window !== "undefined" && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function haptic(pattern: number | number[] = 8) {
  try {
    if ("vibrate" in navigator) navigator.vibrate(pattern);
  } catch {
    /* not supported */
  }
}

const palette = ["#36c89c", "#ffc23d", "#ff8ba0", "#9f88ef", "#5aaff0", "#b3e9d3"];

/** A soft burst of petals from the centre of an element. */
export function burst(target: Element | null, options: { count?: number; spread?: number; colors?: string[] } = {}) {
  if (!target || !motionOk()) return;
  const { count = 14, spread = 46, colors = palette } = options;
  const rect = target.getBoundingClientRect();
  const host = document.body;
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  for (let index = 0; index < count; index += 1) {
    const dot = document.createElement("span");
    const size = 5 + Math.random() * 6;
    const round = Math.random() > 0.45;
    dot.style.cssText = `position:fixed;left:${cx}px;top:${cy}px;width:${size}px;height:${round ? size : size * 1.6}px;border-radius:${round ? "50%" : "40% 60% 50% 50%"};background:${colors[index % colors.length]};pointer-events:none;z-index:9999;will-change:transform,opacity;`;
    host.appendChild(dot);
    const angle = (Math.PI * 2 * index) / count + Math.random() * 0.5;
    const distance = spread * (0.6 + Math.random() * 0.7);
    const x = Math.cos(angle) * distance;
    const y = Math.sin(angle) * distance - 10;
    const animation = dot.animate(
      [
        { transform: "translate(-50%,-50%) scale(0.4) rotate(0deg)", opacity: 1 },
        { transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) scale(1) rotate(${Math.random() * 220}deg)`, opacity: 1, offset: 0.55 },
        { transform: `translate(calc(-50% + ${x * 1.15}px), calc(-50% + ${y + 24}px)) scale(0.6) rotate(${Math.random() * 360}deg)`, opacity: 0 },
      ],
      { duration: 760 + Math.random() * 280, easing: "cubic-bezier(.22,1,.36,1)" },
    );
    animation.onfinish = () => dot.remove();
  }
}

/** Little elastic squeeze for buttons and badges. */
export function pop(target: Element | null, scale = 1.12) {
  if (!target || !motionOk()) return;
  target.animate(
    [{ transform: "scale(1)" }, { transform: `scale(${scale})` }, { transform: "scale(0.98)" }, { transform: "scale(1)" }],
    { duration: 520, easing: "cubic-bezier(.34,1.56,.64,1)" },
  );
}

export function shake(target: Element | null) {
  if (!target || !motionOk()) return;
  target.animate(
    [
      { transform: "translateX(0)" },
      { transform: "translateX(-7px)" },
      { transform: "translateX(6px)" },
      { transform: "translateX(-4px)" },
      { transform: "translateX(2px)" },
      { transform: "translateX(0)" },
    ],
    { duration: 420, easing: "ease-out" },
  );
}

/** Animates a number from its previous value to the next one. */
export function useCountUp(value: number, duration = 900): number {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      if (!motionOk() || value === 0) {
        from.current = value;
        setShown(value);
        return;
      }
      from.current = 0;
    }
    const start = from.current;
    if (start === value || !motionOk()) {
      from.current = value;
      setShown(value);
      return;
    }
    let frame = 0;
    const began = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - began) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setShown(Math.round(start + (value - start) * eased));
      if (progress < 1) frame = requestAnimationFrame(tick);
      else from.current = value;
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      from.current = value;
    };
  }, [value, duration]);

  return shown;
}

/** Delays a boolean so CSS transitions can play on first paint. */
export function useMounted(delay = 60): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setOn(true), delay);
    return () => window.clearTimeout(timer);
  }, [delay]);
  return on;
}
