import { useEffect, useRef } from "react";

/** A one-shot "open the create form" request passed from the + sheet to the page it navigates to. */
export type Intent = "task" | "habit" | "goal" | "countdown" | "journal" | "good" | "mood" | "procrastinate" | "project" | "reward";

let pending: Intent | null = null;
const listeners = new Set<() => void>();

export function requestIntent(intent: Intent) {
  pending = intent;
  listeners.forEach((listener) => listener());
}

export function useIntent(intent: Intent, handler: () => void) {
  const latest = useRef(handler);
  latest.current = handler;
  useEffect(() => {
    let timer = 0;
    const check = () => {
      if (pending !== intent) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (pending !== intent) return;
        pending = null;
        latest.current();
      }, 140);
    };
    check();
    listeners.add(check);
    return () => {
      listeners.delete(check);
      window.clearTimeout(timer);
    };
  }, [intent]);
}
