import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { savePrefs, usePrefs } from "@/entities/prefs";
import { useUser } from "@/entities/session";
import { tours, type TourId } from "@/shared/config/tours";
import { haptic } from "@/shared/lib/motion/fx";
import { Glyph } from "@/shared/ui/glyph";
import { Art } from "@/shared/ui/kit";

/* ---------- Manual replay ("show the tour again") ---------- */

let requested: TourId | null = null;
const listeners = new Set<() => void>();

export function replayTour(id: TourId) {
  requested = id;
  listeners.forEach((listener) => listener());
}

function useRequested() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => requested,
    () => requested,
  );
}

/* ---------- Geometry ---------- */

type Box = { top: number; left: number; width: number; height: number };

function findTarget(name: string): HTMLElement | null {
  const nodes = document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`);
  for (const node of nodes) {
    const rect = node.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) return node;
  }
  return null;
}

function layerBox(): DOMRect {
  return (document.getElementById("bloom-layer") ?? document.body).getBoundingClientRect();
}

const PAD = 8;

/**
 * A guided walk through one space. Shows itself the first time the space is opened
 * (for people who chose the guided start), and again whenever `replayTour(id)` is called.
 */
export function Tour({ id }: { id: TourId }) {
  const { t } = useTranslation();
  const user = useUser();
  const prefs = usePrefs(user.id);
  const asked = useRequested();
  const [active, setActive] = useState(false);
  const [step, setStep] = useState(0);
  const [hole, setHole] = useState<Box | null>(null);
  const [card, setCard] = useState<{ top: number; left: number; width: number } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const direction = useRef<1 | -1>(1);
  const steps = tours[id];
  const current = steps[step];

  const auto = Boolean(prefs && prefs.onboarded && prefs.tours === "on" && !prefs.toursSeen.includes(id));

  useEffect(() => {
    if (!auto || active) return;
    const timer = window.setTimeout(() => {
      setStep(0);
      setActive(true);
    }, 900);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto]);

  useEffect(() => {
    if (asked !== id) return;
    requested = null;
    setStep(0);
    setActive(true);
  }, [asked, id]);

  function close() {
    setActive(false);
    setHole(null);
    setCard(null);
    if (prefs && !prefs.toursSeen.includes(id)) void savePrefs(user.id, { toursSeen: [...prefs.toursSeen, id] });
  }

  function go(next: number) {
    haptic(5);
    direction.current = next > step ? 1 : -1;
    if (next >= steps.length) {
      close();
      return;
    }
    setStep(Math.max(0, next));
  }

  // Bring the highlighted element into view, or skip the step when it is not on screen right now.
  useEffect(() => {
    if (!active || !current) return;
    setHole(null);
    if (!current.target) return;
    const node = findTarget(current.target);
    if (!node) {
      const next = step + direction.current;
      if (next < 0 || next >= steps.length) close();
      else setStep(next);
      return;
    }
    const tall = node.getBoundingClientRect().height > window.innerHeight * 0.55;
    node.scrollIntoView({ block: tall ? "start" : "center", behavior: "smooth" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, step]);

  // Follow the element while the page scrolls or resizes.
  useEffect(() => {
    if (!active || !current?.target) return;
    let frame = 0;
    const tick = () => {
      const node = findTarget(current.target!);
      if (node) {
        const rect = node.getBoundingClientRect();
        const base = layerBox();
        const next = { top: rect.top - base.top - PAD, left: rect.left - base.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 };
        setHole((prev) =>
          prev && Math.abs(prev.top - next.top) < 0.5 && Math.abs(prev.left - next.left) < 0.5 && Math.abs(prev.width - next.width) < 0.5 && Math.abs(prev.height - next.height) < 0.5 ? prev : next,
        );
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active, current]);

  // Place the card next to the highlighted element, or in the middle for intro steps.
  useLayoutEffect(() => {
    if (!active) return;
    const base = layerBox();
    const width = Math.min(380, base.width - 24);
    const height = cardRef.current?.offsetHeight ?? 220;
    if (!current?.target || !hole) {
      setCard({ top: Math.max(12, (base.height - height) / 2), left: (base.width - width) / 2, width });
      return;
    }
    const below = hole.top + hole.height + 12;
    const above = hole.top - height - 12;
    let top = below + height <= base.height - 12 ? below : above >= 12 ? above : base.height - height - 12;
    top = Math.max(12, top);
    const left = Math.min(Math.max(12, hole.left + hole.width / 2 - width / 2), base.width - width - 12);
    setCard({ top, left, width });
  }, [active, hole, current, step]);

  if (!active || !current) return null;
  const layer = document.getElementById("bloom-layer");
  if (!layer) return null;
  const intro = current.kind === "intro";
  const list = intro ? (t(`tour.${id}.${current.key}.list`, { returnObjects: true }) as string[]) : [];
  const last = step === steps.length - 1;

  return createPortal(
    <div className="tour-root" role="dialog" aria-modal="true" aria-label={t(`tour.${id}.${current.key}.t`)}>
      {hole ? <div className="tour-hole" style={hole} /> : <div className="tour-dim" />}
      <div className={`tour-card ${intro ? "is-intro" : ""}`} ref={cardRef} style={card ? { top: card.top, left: card.left, width: card.width } : { visibility: "hidden" }} key={step}>
        <button type="button" className="tour-skip" onClick={close}>
          {t("tour.skip")}
        </button>
        {intro ? <Art name={current.art ?? "c-hold-daisy"} className="tour-card-art float" eager /> : null}
        <p className="eyebrow">{intro ? t("tour.whatHere") : `${step} / ${steps.length - 1}`}</p>
        <h3 className="heading">{t(`tour.${id}.${current.key}.t`)}</h3>
        <p className="tour-text">{t(`tour.${id}.${current.key}.b`)}</p>
        {list.length ? (
          <ul className="tour-list">
            {list.map((item) => (
              <li key={item}>
                <Glyph name="check" size={14} stroke={3} />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="tour-nav">
          {step > 0 ? (
            <button type="button" className="btn is-ghost is-sm" onClick={() => go(step - 1)}>
              {t("common.back")}
            </button>
          ) : (
            <span />
          )}
          <button type="button" className="btn is-sm" onClick={() => go(step + 1)}>
            {intro ? t("tour.showMe") : last ? t("tour.done") : t("common.next")}
            {!last ? <Glyph name="chevron" size={16} stroke={2.6} /> : null}
          </button>
        </div>
      </div>
    </div>,
    layer,
  );
}
