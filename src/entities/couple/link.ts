import type { RealtimeChannel } from "@supabase/supabase-js";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { supabase } from "@/shared/api/supabase";
import { onE2EChange, revealInto } from "@/entities/e2e";

/** Everything Bloom knows about the couple, kept in one live store. */

export type Profile = {
  id: string;
  name: string;
  invite_code: string;
  partner_id: string | null;
  couple_key: string | null;
  paired_at: string | null;
};

export type CoupleItem<T = Record<string, unknown>> = {
  couple_key: string;
  id: string;
  kind: string;
  author: string;
  data: T;
  created_at: string;
  updated_at: string;
};

export type Activity = "home" | "habits" | "tasks" | "focus" | "body" | "reflect" | "goals" | "garden" | "together" | "chat" | "watch" | "stats" | "learn" | "other";

export type Presence = { online: boolean; activity: Activity | null; detail: string | null; since: string | null; away: boolean };

export type CoupleState = {
  status: "idle" | "loading" | "ready" | "error";
  me: Profile | null;
  partner: Profile | null;
  connected: boolean;
  presence: Presence;
  version: number;
};

const offline: Presence = { online: false, activity: null, detail: null, since: null, away: false };

let state: CoupleState = { status: "idle", me: null, partner: null, connected: false, presence: offline, version: 0 };
const items = new Map<string, CoupleItem>();
const listeners = new Set<() => void>();
const bus = new Map<string, Set<(payload: Record<string, unknown>) => void>>();
let channel: RealtimeChannel | null = null;
let profileChannel: RealtimeChannel | null = null;
let userId: string | null = null;
let myPresence: { activity: Activity; detail: string | null; since: string; away: boolean } = { activity: "home", detail: null, since: new Date().toISOString(), away: false };

function set(patch: Partial<CoupleState>) {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}

function bump() {
  set({ version: state.version + 1 });
}

export function getCouple(): CoupleState {
  return state;
}

export function useCouple(): CoupleState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
    () => state,
  );
}

/** Items of one kind, newest last. Re-renders whenever anything shared changes. */
export function useItems<T = Record<string, unknown>>(kind: string): Array<CoupleItem<T>> {
  const { version } = useCouple();
  const cache = useRef<{ version: number; list: Array<CoupleItem<T>> }>({ version: -1, list: [] });
  if (cache.current.version !== version) {
    cache.current = {
      version,
      list: ([...items.values()].filter((item) => item.kind === kind) as Array<CoupleItem<T>>).sort((a, b) => a.created_at.localeCompare(b.created_at)),
    };
  }
  return cache.current.list;
}

export function useItem<T = Record<string, unknown>>(id: string): CoupleItem<T> | null {
  useCouple();
  return (items.get(id) as CoupleItem<T> | undefined) ?? null;
}

/** Current items of one kind, for code outside React (schedulers). */
export function getItems<T = Record<string, unknown>>(kind: string): Array<CoupleItem<T>> {
  return [...items.values()].filter((item) => item.kind === kind) as Array<CoupleItem<T>>;
}

export function getItem<T = Record<string, unknown>>(id: string): CoupleItem<T> | null {
  return (items.get(id) as CoupleItem<T> | undefined) ?? null;
}

// The key arrived on this device (PIN entered): open the messages that were waiting.
onE2EChange(() => {
  for (const item of items.values()) if (item.data?.enc && (item.data.locked || item.data.unreadable)) items.set(item.id, revealInto(items, { ...item, data: { ...item.data, locked: undefined, unreadable: undefined } }, bump));
  bump();
});

/* ---------- Broadcast bus: effects, typing, watch signalling ---------- */

export function onSignal(event: string, handler: (payload: Record<string, unknown>) => void) {
  const set = bus.get(event) ?? new Set();
  set.add(handler);
  bus.set(event, set);
  return () => set.delete(handler);
}

export function useSignal(event: string, handler: (payload: Record<string, unknown>) => void) {
  const latest = useRef(handler);
  latest.current = handler;
  useEffect(() => {
    const off = onSignal(event, (payload) => latest.current(payload));
    return () => {
      off();
    };
  }, [event]);
}

function emitLocal(event: string, payload: Record<string, unknown>) {
  bus.get(event)?.forEach((handler) => handler(payload));
}

export async function signal(event: string, payload: Record<string, unknown> = {}): Promise<boolean> {
  if (!channel || !userId) return false;
  const result = await channel.send({ type: "broadcast", event, payload: { ...payload, from: userId, at: Date.now() } });
  return result === "ok";
}

/* ---------- Shared items ---------- */

export async function putItem(id: string, kind: string, data: Record<string, unknown>): Promise<void> {
  const key = state.me?.couple_key;
  if (!key || !userId) throw new Error("not-paired");
  const existing = items.get(id);
  const now = new Date().toISOString();
  const optimistic: CoupleItem = {
    couple_key: key,
    id,
    kind,
    author: existing?.author ?? userId,
    data,
    created_at: existing?.created_at ?? now,
    updated_at: now,
  };
  items.set(id, revealInto(items, optimistic, bump));
  bump();
  const { error } = existing
    ? await supabase.from("couple_items").update({ data, kind }).eq("couple_key", key).eq("id", id)
    : await supabase.from("couple_items").upsert({ couple_key: key, id, kind, data, author: userId }, { onConflict: "couple_key,id" });
  if (error) console.warn("Bloom couple save failed", error.message);
}

export async function removeItem(id: string): Promise<void> {
  const key = state.me?.couple_key;
  if (!key) return;
  items.delete(id);
  bump();
  await supabase.from("couple_items").delete().eq("couple_key", key).eq("id", id);
}

/* ---------- Presence ---------- */

export function setActivity(activity: Activity, detail: string | null = null) {
  if (myPresence.activity === activity && myPresence.detail === detail) return;
  myPresence = { activity, detail, since: activity === myPresence.activity ? myPresence.since : new Date().toISOString(), away: myPresence.away };
  void channel?.track({ ...myPresence });
}

function readPresence() {
  if (!channel || !state.partner) return;
  const all = channel.presenceState() as Record<string, Array<{ activity?: Activity; detail?: string | null; since?: string; away?: boolean }>>;
  const entry = all[state.partner.id]?.at(-1);
  set({
    presence: entry
      ? { online: true, activity: entry.activity ?? null, detail: entry.detail ?? null, since: entry.since ?? null, away: Boolean(entry.away) }
      : offline,
  });
}

/* ---------- Connection lifecycle ---------- */

async function loadProfiles(uid: string, name: string): Promise<{ me: Profile; partner: Profile | null } | null> {
  let { data: me } = await supabase.from("profiles").select("id,name,invite_code,partner_id,couple_key,paired_at").eq("id", uid).maybeSingle();
  if (!me) {
    const { error } = await supabase.from("profiles").insert({ id: uid, name });
    if (error && !error.message.includes("duplicate")) {
      console.warn("Bloom profile create failed", error.message);
      return null;
    }
    ({ data: me } = await supabase.from("profiles").select("id,name,invite_code,partner_id,couple_key,paired_at").eq("id", uid).maybeSingle());
  } else if (name && me.name !== name) {
    await supabase.from("profiles").update({ name }).eq("id", uid);
    me = { ...me, name };
  }
  if (!me) return null;
  let partner: Profile | null = null;
  if (me.partner_id) {
    const { data } = await supabase.from("profiles").select("id,name,invite_code,partner_id,couple_key,paired_at").eq("id", me.partner_id).maybeSingle();
    partner = (data as Profile | null) ?? null;
  }
  return { me: me as Profile, partner };
}

async function loadItems(key: string) {
  const { data, error } = await supabase
    .from("couple_items")
    .select("*")
    .eq("couple_key", key)
    .order("created_at", { ascending: false })
    .limit(1500);
  if (error) {
    console.warn("Bloom couple load failed", error.message);
    return;
  }
  items.clear();
  for (const row of (data ?? []) as CoupleItem[]) items.set(row.id, revealInto(items, row, bump));
}

function joinChannel(key: string, uid: string) {
  const current = supabase.channel(`couple-${key}`, { config: { broadcast: { self: false, ack: false }, presence: { key: uid } } });
  channel = current;
  joinedAt = Date.now();
  current
    .on("broadcast", { event: "*" }, (message) => emitLocal(String(message.event), (message.payload ?? {}) as Record<string, unknown>))
    .on("presence", { event: "sync" }, readPresence)
    .on("postgres_changes", { event: "*", schema: "public", table: "couple_items", filter: `couple_key=eq.${key}` }, (change) => {
      if (change.eventType === "DELETE") {
        const old = change.old as Partial<CoupleItem>;
        if (old.id) items.delete(old.id);
      } else {
        const row = change.new as CoupleItem;
        items.set(row.id, revealInto(items, row, bump));
        if (change.eventType === "INSERT") emitLocal(`item:${row.kind}`, row as unknown as Record<string, unknown>);
      }
      bump();
    })
    .subscribe((status) => {
      if (current !== channel) return;
      set({ connected: status === "SUBSCRIBED" });
      if (status === "SUBSCRIBED") void channel?.track({ ...myPresence });
      // The line dropped (sleep, VPN or Wi-Fi switch): come back by ourselves instead of staying deaf.
      else rejoinSoon(3000);
    });
}

/* ---------- Staying connected ---------- */

let joined: { key: string; uid: string } | null = null;
let rejoinTimer = 0;
let rejoining = false;
let joinedAt = 0;

function rejoinSoon(ms: number) {
  if (!joined || rejoinTimer) return;
  rejoinTimer = window.setTimeout(() => {
    rejoinTimer = 0;
    void rejoin();
  }, ms);
}

async function rejoin() {
  if (!joined || rejoining || state.connected) return;
  rejoining = true;
  const { key, uid } = joined;
  try {
    if (channel) {
      const old = channel;
      channel = null;
      void supabase.removeChannel(old);
    }
    // Catch up on what arrived while the line was down.
    await loadItems(key);
    if (joined?.key === key) {
      joinChannel(key, uid);
      bump();
    }
  } finally {
    rejoining = false;
  }
}

if (typeof window !== "undefined") {
  const check = () => {
    // A slow network may still be joining; give it half a minute before starting over.
    if (joined && !state.connected && Date.now() - joinedAt > 30_000) rejoinSoon(500);
  };
  window.addEventListener("online", check);
  window.addEventListener("focus", check);
  document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && check());
  window.setInterval(check, 20_000);
}

function leaveChannels() {
  joined = null;
  window.clearTimeout(rejoinTimer);
  rejoinTimer = 0;
  if (channel) void supabase.removeChannel(channel);
  if (profileChannel) void supabase.removeChannel(profileChannel);
  channel = null;
  profileChannel = null;
}

/** Load the couple for this person and stay connected. Safe to call again (e.g. after pairing). */
export async function connectCouple(uid: string, name: string): Promise<void> {
  userId = uid;
  set({ status: state.me ? state.status : "loading" });
  const loaded = await loadProfiles(uid, name);
  if (!loaded) {
    set({ status: "error" });
    return;
  }
  leaveChannels();
  set({ me: loaded.me, partner: loaded.partner, presence: offline, connected: false });
  if (loaded.me.couple_key && loaded.partner) {
    items.clear();
    await loadItems(loaded.me.couple_key);
    joinChannel(loaded.me.couple_key, uid);
    joined = { key: loaded.me.couple_key, uid };
  } else {
    items.clear();
  }
  // Notice when the other person pairs with us or unpairs.
  profileChannel = supabase
    .channel(`profile-${uid}`)
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${uid}` }, (change) => {
      const next = change.new as Profile;
      if (next.couple_key !== state.me?.couple_key || next.partner_id !== state.me?.partner_id) void connectCouple(uid, name);
      else set({ me: { ...(state.me as Profile), ...next } });
    })
    .subscribe();
  set({ status: "ready" });
  bump();
}

export function disconnectCouple() {
  leaveChannels();
  items.clear();
  userId = null;
  set({ status: "idle", me: null, partner: null, connected: false, presence: offline });
}

export function markAway(away: boolean) {
  if (myPresence.away === away) return;
  myPresence = { ...myPresence, away };
  void channel?.track({ ...myPresence });
}

/* ---------- Pairing ---------- */

export type PairError = "code-not-found" | "own-code" | "already-paired" | "offline";

export async function pairWith(code: string): Promise<PairError | null> {
  const { error } = await supabase.rpc("pair_with", { code: code.trim().toUpperCase() });
  if (error) {
    const message = error.message;
    if (message.includes("code-not-found")) return "code-not-found";
    if (message.includes("own-code")) return "own-code";
    if (message.includes("already-paired")) return "already-paired";
    return "offline";
  }
  if (userId) await connectCouple(userId, state.me?.name ?? "");
  return null;
}

export async function unpair() {
  await supabase.rpc("unpair");
  if (userId) await connectCouple(userId, state.me?.name ?? "");
}

export async function newInviteCode() {
  const { data } = await supabase.rpc("new_invite_code");
  if (typeof data === "string" && state.me) set({ me: { ...state.me, invite_code: data } });
}

export function myId(): string | null {
  return userId;
}

/** Development only: pretend to be paired so the shared screens can be checked without a second account. */
if (import.meta.env.DEV) {
  (window as unknown as { __bloomCoupleMock?: (name: string) => void }).__bloomCoupleMock = (name: string) => {
    userId = state.me?.id ?? "dev-me";
    set({
      status: "ready",
      me: { id: userId, name: "Me", invite_code: "AB12CD", partner_id: "dev-partner", couple_key: "dev", paired_at: new Date().toISOString() },
      partner: { id: "dev-partner", name, invite_code: "ZZ99ZZ", partner_id: userId, couple_key: "dev", paired_at: new Date().toISOString() },
      connected: true,
      presence: { online: true, activity: "focus", detail: null, since: new Date(Date.now() - 18 * 60000).toISOString(), away: false },
    });
  };
}
