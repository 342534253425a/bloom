import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { usePresence } from "./kit";

function layerHost(): HTMLElement {
  return document.getElementById("bloom-layer") ?? document.body;
}

/**
 * Bottom sheet with a spring entrance, exit animation and drag-to-dismiss.
 * The legacy signature (open/title/closeLabel/onClose) is kept so older pages keep working.
 */
export function Sheet({
  open,
  title,
  closeLabel,
  onClose,
  children,
  hideClose = false,
}: {
  open: boolean;
  title: string;
  closeLabel: string;
  onClose: () => void;
  children: ReactNode;
  hideClose?: boolean;
}) {
  const { mounted, visible } = usePresence(open, 380);
  const panel = useRef<HTMLDivElement>(null);
  const drag = useRef<{ startY: number; dy: number; id: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (open && visible) panel.current?.focus({ preventScroll: true });
  }, [open, visible]);

  if (!mounted) return null;

  return createPortal(
    <div className={`sheet-root ${visible ? "is-open" : ""}`}>
      <div className="sheet-veil" onClick={onClose} />
      <div
        ref={panel}
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <div
          className="sheet-grip"
          onPointerDown={(event) => {
            drag.current = { startY: event.clientY, dy: 0, id: event.pointerId };
            event.currentTarget.setPointerCapture(event.pointerId);
            if (panel.current) panel.current.style.transition = "none";
          }}
          onPointerMove={(event) => {
            const state = drag.current;
            if (!state || !panel.current) return;
            state.dy = Math.max(0, event.clientY - state.startY);
            panel.current.style.transform = `translateY(${state.dy}px)`;
          }}
          onPointerUp={() => {
            const state = drag.current;
            drag.current = null;
            if (!panel.current) return;
            panel.current.style.transition = "";
            panel.current.style.transform = "";
            if (state && state.dy > 90) onClose();
          }}
          onPointerCancel={() => {
            drag.current = null;
            if (!panel.current) return;
            panel.current.style.transition = "";
            panel.current.style.transform = "";
          }}
        >
          <span />
        </div>
        <div className="sheet-body">
          {children}
          {hideClose ? null : (
            <button className="btn is-ghost is-block" type="button" onClick={onClose}>
              {closeLabel}
            </button>
          )}
        </div>
      </div>
    </div>,
    layerHost(),
  );
}
