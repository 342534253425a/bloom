import { useSyncExternalStore } from "react";
import type { PublicUser } from "@/entities/user";

export type AuthState =
  | { status: "anonymous" }
  | { status: "authenticated"; user: PublicUser };

let state: AuthState = { status: "anonymous" };
/** Kept so screens that are animating out after sign-out can still render. */
let lastUser: PublicUser | null = null;
const listeners = new Set<() => void>();

export function getAuthState(): AuthState {
  return state;
}

export function setAuthState(next: AuthState) {
  state = next;
  if (next.status === "authenticated") lastUser = next.user;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useAuth(): AuthState {
  return useSyncExternalStore(subscribe, getAuthState, getAuthState);
}

export function useUser(): PublicUser {
  const auth = useAuth();
  if (auth.status === "authenticated") return auth.user;
  if (lastUser) return lastUser;
  throw new Error("Expected a signed-in user");
}
