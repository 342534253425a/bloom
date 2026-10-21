import type { RealtimeChannel } from "@supabase/supabase-js";
import { useRef, useSyncExternalStore } from "react";
import type { CoupleItem } from "@/entities/couple";
import { supabase } from "@/shared/api/supabase";
import { onE2EChange, revealInto } from "@/entities/e2e";

/**
 * People besides the partner: friends and family, each with a private chat (like Telegram).
 * The partner stays special and lives in the couple store; this store keeps everyone else, their chats and signals.
 */

export type ContactKind = "friend" | "family";
export type Contact = { id: string; name: string; chatKey: string; kind: ContactKind; since: string; online: boolean };

type ContactsState = { status: "idle" | "loading" | "ready"; list: Contact[]; version: number };

let state: ContactsState = { status: "idle", list: [], version: 0 };
let me: string | null = null;
/** chat_key → (item id → item). Items look like the couple's, with couple_key holding the chat key. */
const chats = new Map<string, Map<string, CoupleItem>>();
const listeners = new Set<() => void>();
const signalHandlers = new Map<string, Set<(chatKey: string, payload: Record<string, unknown>) => void>>();
let feed: RealtimeChannel | null = null;
const rooms = new Map<string, RealtimeChannel>();
const online = new Set<string>();

function set(patch: Partial<ContactsState>) {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}

function bump() {
  set({ version: state.version + 1 });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getContacts(): ContactsState {
  return state;
}

export function useContacts(): ContactsState {
  return useSyncExternalStore(subscribe, () => state, () => state);
}

export function contactById(id: string): Contact | undefined {
  return state.list.find((contact) => contact.id === id);
}

export function contactByKey(chatKey: string): Contact | undefined {
  return state.list.find((contact) => contact.chatKey === chatKey);
}

/* ---------- Items of one chat ---------- */

function chat(chatKey: string) {
  let map = chats.get(chatKey);
  if (!map) {
    map = new Map();
    chats.set(chatKey, map);
  }
  return map;
}

export function getChatItems<T>(chatKey: string, kind: string): Array<CoupleItem<T>> {
  return [...chat(chatKey).values()].filter((item) => item.kind === kind) as Array<CoupleItem<T>>;
}

export function getChatItem<T>(chatKey: string, id: string): CoupleItem<T> | null {
  return (chat(chatKey).get(id) as CoupleItem<T> | undefined) ?? null;
}

export function useChatItems<T>(chatKey: string, kind: string): Array<CoupleItem<T>> {
  const { version } = useContacts();
  const cache = useRef<{ version: number; key: string; list: Array<CoupleItem<T>> }>({ version: -1, key: "", list: [] });
  if (cache.current.version !== version || cache.current.key !== chatKey) {
    cache.current = { version, key: chatKey, list: getChatItems<T>(chatKey, kind).sort((a, b) => a.created_at.localeCompare(b.created_at)) };
  }
  return cache.current.list;
}

export function useChatItem<T>(chatKey: string, id: string): CoupleItem<T> | null {
  useContacts();
  return getChatItem<T>(chatKey, id);
}

export async function putChatItem(chatKey: string, id: string, kind: string, data: Record<string, unknown>) {
  if (!me) throw new Error("signed-out");
  const existing = chat(chatKey).get(id);
  const now = new Date().toISOString();
  chat(chatKey).set(id, revealInto(chat(chatKey), { couple_key: chatKey, id, kind, author: existing?.author ?? me, data, created_at: existing?.created_at ?? now, updated_at: now }, bump));
  bump();
  const { data: saved, error } = await supabase
    .from("chat_items")
    .upsert({ chat_key: chatKey, id, kind, data, ...(existing ? {} : { author: me }) }, { onConflict: "chat_key,id" })
    .select()
    .single();
  if (error) throw error;
  if (saved) chat(chatKey).set(id, revealInto(chat(chatKey), toItem(saved as Row), bump));
  bump();
}

export async function removeChatItem(chatKey: string, id: string) {
  chat(chatKey).delete(id);
  bump();
  await supabase.from("chat_items").delete().eq("chat_key", chatKey).eq("id", id);
}

type Row = { chat_key: string; id: string; kind: string; author: string; data: Record<string, unknown>; created_at: string; updated_at: string };

function toItem(row: Row): CoupleItem {
  return { couple_key: row.chat_key, id: row.id, kind: row.kind, author: row.author, data: row.data, created_at: row.created_at, updated_at: row.updated_at };
}

// The key arrived on this device (PIN entered): open the messages that were waiting.
onE2EChange(() => {
  for (const map of chats.values())
    for (const item of map.values())
      if (item.data?.enc && (item.data.locked || item.data.unreadable)) map.set(item.id, revealInto(map, { ...item, data: { ...item.data, locked: undefined, unreadable: undefined } }, bump));
  bump();
});

/* ---------- Signals (typing, calls) in one chat ---------- */

export function onChatSignal(event: string, handler: (chatKey: string, payload: Record<string, unknown>) => void) {
  const set = signalHandlers.get(event) ?? new Set();
  set.add(handler);
  signalHandlers.set(event, set);
  return () => {
    set.delete(handler);
  };
}

function emit(event: string, chatKey: string, payload: Record<string, unknown>) {
  signalHandlers.get(event)?.forEach((handler) => handler(chatKey, payload));
}

export async function chatSignal(chatKey: string, event: string, payload: Record<string, unknown> = {}): Promise<boolean> {
  const room = rooms.get(chatKey);
  if (!room || !me) return false;
  const result = await room.send({ type: "broadcast", event, payload: { ...payload, from: me, at: Date.now() } });
  return result === "ok";
}

/* ---------- Loading and staying connected ---------- */

async function load() {
  if (!me) return;
  const { data: rows } = await supabase.from("contacts").select("other,chat_key,kind,created_at").eq("owner", me);
  const links = (rows ?? []) as Array<{ other: string; chat_key: string; kind: ContactKind; created_at: string }>;
  const ids = links.map((link) => link.other);
  const names = new Map<string, string>();
  if (ids.length) {
    const { data: people } = await supabase.from("profiles").select("id,name").in("id", ids);
    for (const person of (people ?? []) as Array<{ id: string; name: string }>) names.set(person.id, person.name);
  }
  const keys = links.map((link) => link.chat_key);
  if (keys.length) {
    const { data: items } = await supabase.from("chat_items").select("*").in("chat_key", keys).order("created_at", { ascending: false }).limit(4000);
    for (const key of keys) chat(key).clear();
    for (const row of (items ?? []) as Row[]) chat(row.chat_key).set(row.id, revealInto(chat(row.chat_key), toItem(row), bump));
  }
  set({
    status: "ready",
    list: links.map((link) => ({ id: link.other, name: names.get(link.other) || "…", chatKey: link.chat_key, kind: link.kind, since: link.created_at, online: online.has(link.other) })),
  });
  syncRooms();
  bump();
}

/** One live room per contact: typing, calls, and whether they are online now. */
function syncRooms() {
  const wanted = new Set(state.list.map((contact) => contact.chatKey));
  for (const [key, room] of rooms) {
    if (!wanted.has(key)) {
      void supabase.removeChannel(room);
      rooms.delete(key);
    }
  }
  for (const contact of state.list) {
    if (rooms.has(contact.chatKey) || !me) continue;
    const key = contact.chatKey;
    const room = supabase.channel(`chat-${key}`, { config: { broadcast: { self: false, ack: false }, presence: { key: me } } });
    room
      .on("broadcast", { event: "*" }, (message) => emit(String(message.event), key, (message.payload ?? {}) as Record<string, unknown>))
      .on("presence", { event: "sync" }, () => {
        const here = Object.keys(room.presenceState()).includes(contact.id);
        if (here) online.add(contact.id);
        else online.delete(contact.id);
        set({ list: state.list.map((item) => (item.chatKey === key ? { ...item, online: here } : item)) });
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void room.track({ at: Date.now() });
      });
    rooms.set(key, room);
  }
}

/** Starts after sign-in (the app shell calls it once). */
export async function connectContacts(uid: string) {
  if (me === uid && feed) return;
  disconnectContacts();
  me = uid;
  set({ status: "loading" });
  // Messages of every chat this person is in arrive here (row-level security filters the rest).
  feed = supabase
    .channel(`contacts-${uid}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "chat_items" }, (change) => {
      if (change.eventType === "DELETE") {
        const old = change.old as Partial<Row>;
        if (old.id) for (const map of chats.values()) map.delete(old.id);
      } else {
        const row = change.new as Row;
        chat(row.chat_key).set(row.id, revealInto(chat(row.chat_key), toItem(row), bump));
        if (change.eventType === "INSERT") emit(`item:${row.kind}`, row.chat_key, row as unknown as Record<string, unknown>);
      }
      bump();
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "contacts", filter: `owner=eq.${uid}` }, () => void load())
    .subscribe((status) => {
      // After a dropped connection, catch up on what was missed.
      if (status === "SUBSCRIBED" && state.status === "ready") void load();
    });
  await load();
}

export function disconnectContacts() {
  if (feed) void supabase.removeChannel(feed);
  feed = null;
  for (const room of rooms.values()) void supabase.removeChannel(room);
  rooms.clear();
  chats.clear();
  online.clear();
  me = null;
  set({ status: "idle", list: [], version: state.version + 1 });
}

/* ---------- Adding and managing people ---------- */

export type AddError = "code-not-found" | "own-code" | "is-partner" | "offline";

export async function addContact(code: string): Promise<AddError | null> {
  const { error } = await supabase.rpc("add_contact", { code: code.trim().toUpperCase() });
  if (error) {
    for (const known of ["code-not-found", "own-code", "is-partner"] as const) if (error.message.includes(known)) return known;
    return "offline";
  }
  await load();
  return null;
}

export async function removeContact(id: string) {
  await supabase.rpc("remove_contact", { person: id });
  await load();
}

export async function setContactKind(id: string, kind: ContactKind) {
  set({ list: state.list.map((contact) => (contact.id === id ? { ...contact, kind } : contact)) });
  await supabase.rpc("set_contact_kind", { person: id, new_kind: kind });
}
