import { useSyncExternalStore } from "react";

/** Set when the person arrives from a password-reset email and should choose a new password. */
let recovering = false;
const listeners = new Set<() => void>();

export function setRecovering(next: boolean) {
  recovering = next;
  listeners.forEach((listener) => listener());
}

export function useRecovering() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => recovering,
    () => recovering,
  );
}
