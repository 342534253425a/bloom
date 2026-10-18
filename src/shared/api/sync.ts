import { useSyncExternalStore } from "react";
import { db } from "@/shared/db";
import { supabase } from "./supabase";

/**
 * Local-first sync. Every write to Dexie is mirrored into an outbox by table hooks and pushed
 * to Supabase; changes from other devices are pulled by `updated_at` and applied locally.
 */

export const syncedTables = [
  "habits",
  "habitLogs",
  "days",
  "goals",
  "focusSessions",
  "journalEntries",
  "countdowns",
  "tasks",
  "projects",
  "priorities",
  "wishes",
  "redemptions",
  "reviews",
  "reminders",
  "notes",
  "vocab",
  "preferences",
  "sharing",
  "partners",
] as const;

type Pending = { tbl: string; id: string; data: Record<string, unknown> | null };
type Row = { tbl: string; id: string; data: Record<string, unknown> | null; deleted: boolean; updated_at: string };

export type SyncState = { status: "off" | "syncing" | "synced" | "offline" | "error"; lastSync: string | null; pending: number };

let userId: string | null = null;
let outbox = new Map<string, Pending>();
let state: SyncState = { status: "off", lastSync: null, pending: 0 };
const listeners = new Set<() => void>();
/** Keys being written by a pull, so the hooks do not echo them back. */
const applying = new Set<string>();
let pushTimer = 0;
let pullTimer = 0;
let running = false;
let hooked = false;

const outboxKey = (uid: string) => `bloom.outbox.${uid}`;
const cursorKey = (uid: string) => `bloom.cursor.${uid}`;
const keyOf = (tbl: string, id: string) => `${tbl}:${id}`;

function emit(patch: Partial<SyncState>) {
  state = { ...state, ...patch, pending: outbox.size };
  listeners.forEach((listener) => listener());
}

export function useSyncState(): SyncState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
    () => state,
  );
}

function saveOutbox() {
  if (!userId) return;
  try {
    localStorage.setItem(outboxKey(userId), JSON.stringify([...outbox.values()]));
  } catch {
    /* storage full or blocked; the outbox still lives in memory */
  }
}

function loadOutbox(uid: string) {
  try {
    const raw = localStorage.getItem(outboxKey(uid));
    const list = raw ? (JSON.parse(raw) as Pending[]) : [];
    outbox = new Map(list.map((item) => [keyOf(item.tbl, item.id), item]));
  } catch {
    outbox = new Map();
  }
}

function ownerOf(tbl: string, row: Record<string, unknown> | undefined): string | null {
  if (!row) return null;
  if (tbl === "preferences" || tbl === "sharing" || tbl === "partners") return String(row.id ?? "");
  return typeof row.userId === "string" ? row.userId : null;
}

function enqueue(tbl: string, id: unknown, data: Record<string, unknown> | null, owner: string | null) {
  if (typeof id !== "string") return;
  const key = keyOf(tbl, id);
  if (applying.has(key)) return;
  if (!userId || owner !== userId) return;
  outbox.set(key, { tbl, id, data: data ? (JSON.parse(JSON.stringify(data)) as Record<string, unknown>) : null });
  saveOutbox();
  emit({});
  schedulePush();
}

/** Installs Dexie hooks once; they only queue rows owned by the signed-in person. */
function installHooks() {
  if (hooked) return;
  hooked = true;
  for (const name of syncedTables) {
    const table = db.table(name);
    table.hook("creating", function (primKey, obj) {
      const row = obj as Record<string, unknown>;
      enqueue(name, primKey ?? row.id, row, ownerOf(name, row));
    });
    table.hook("updating", function (mods, primKey, obj) {
      const merged: Record<string, unknown> = { ...(obj as Record<string, unknown>) };
      for (const [field, value] of Object.entries(mods as Record<string, unknown>)) {
        if (value === undefined) delete merged[field];
        else merged[field] = value;
      }
      enqueue(name, primKey, merged, ownerOf(name, merged));
    });
    table.hook("deleting", function (primKey, obj) {
      enqueue(name, primKey, null, ownerOf(name, obj as Record<string, unknown>));
    });
  }
}

function schedulePush(delay = 800) {
  window.clearTimeout(pushTimer);
  pushTimer = window.setTimeout(() => void push(), delay);
}

async function push() {
  if (!userId || outbox.size === 0) return;
  if (!navigator.onLine) {
    emit({ status: "offline" });
    return;
  }
  emit({ status: "syncing" });
  const batch = [...outbox.values()].slice(0, 400);
  const rows = batch.map((item) => ({ user_id: userId, tbl: item.tbl, id: item.id, data: item.data, deleted: item.data === null }));
  const { error } = await supabase.from("records").upsert(rows, { onConflict: "user_id,tbl,id" });
  if (error) {
    console.warn("Bloom sync push failed", error.message);
    emit({ status: navigator.onLine ? "error" : "offline" });
    schedulePush(15_000);
    return;
  }
  for (const item of batch) {
    const key = keyOf(item.tbl, item.id);
    // Only drop it if nothing newer was queued while we were sending.
    if (outbox.get(key) === item) outbox.delete(key);
  }
  saveOutbox();
  emit({ status: "synced", lastSync: new Date().toISOString() });
  if (outbox.size) schedulePush(50);
}

async function pull(): Promise<boolean> {
  if (!userId || !navigator.onLine) {
    if (userId) emit({ status: "offline" });
    return false;
  }
  const uid = userId;
  let cursor = localStorage.getItem(cursorKey(uid)) ?? "1970-01-01T00:00:00Z";
  for (let page = 0; page < 50; page += 1) {
    const { data, error } = await supabase
      .from("records")
      .select("tbl,id,data,deleted,updated_at")
      .gt("updated_at", cursor)
      .order("updated_at", { ascending: true })
      .limit(1000);
    if (error) {
      console.warn("Bloom sync pull failed", error.message);
      emit({ status: "error" });
      return false;
    }
    const rows = (data ?? []) as Row[];
    if (rows.length === 0) break;
    await apply(rows);
    cursor = rows.at(-1)!.updated_at;
    localStorage.setItem(cursorKey(uid), cursor);
    if (rows.length < 1000) break;
  }
  emit({ status: outbox.size ? "syncing" : "synced", lastSync: new Date().toISOString() });
  return true;
}

async function apply(rows: Row[]) {
  const byTable = new Map<string, Row[]>();
  for (const row of rows) {
    if (!(syncedTables as readonly string[]).includes(row.tbl)) continue;
    // A local change waiting to be sent is newer than what the server had.
    if (outbox.has(keyOf(row.tbl, row.id))) continue;
    byTable.set(row.tbl, [...(byTable.get(row.tbl) ?? []), row]);
  }
  for (const [tbl, list] of byTable) {
    const keys = list.map((row) => keyOf(tbl, row.id));
    keys.forEach((key) => applying.add(key));
    try {
      const table = db.table(tbl);
      const puts = list.filter((row) => !row.deleted && row.data).map((row) => row.data!);
      const deletes = list.filter((row) => row.deleted || !row.data).map((row) => row.id);
      await db.transaction("rw", table, async () => {
        if (puts.length) await table.bulkPut(puts);
        if (deletes.length) await table.bulkDelete(deletes);
      });
    } finally {
      keys.forEach((key) => applying.delete(key));
    }
  }
}

async function cycle() {
  if (running) return;
  running = true;
  try {
    await push();
    await pull();
  } finally {
    running = false;
  }
}

const onOnline = () => void cycle();
const onVisible = () => {
  if (document.visibilityState === "visible") void cycle();
};

/** Starts syncing for this person. Resolves after the first pull so the UI opens with their data. */
export async function startSync(uid: string): Promise<void> {
  installHooks();
  if (userId === uid) return;
  stopSync();
  userId = uid;
  loadOutbox(uid);
  emit({ status: "syncing", lastSync: null });
  window.addEventListener("online", onOnline);
  document.addEventListener("visibilitychange", onVisible);
  pullTimer = window.setInterval(() => void cycle(), 30_000);
  await Promise.race([cycle(), new Promise((resolve) => window.setTimeout(resolve, 6000))]);
}

export function stopSync() {
  window.clearInterval(pullTimer);
  window.clearTimeout(pushTimer);
  window.removeEventListener("online", onOnline);
  document.removeEventListener("visibilitychange", onVisible);
  userId = null;
  outbox = new Map();
  emit({ status: "off", lastSync: null });
}

export function syncNow() {
  return cycle();
}

/** Forget the local copy and pull everything again (used after a restore on another device). */
export async function resetCursor(uid: string) {
  localStorage.removeItem(cursorKey(uid));
  await cycle();
}

/** Queue every local row of this person, e.g. right after moving old on-device data into the account. */
export async function pushEverything(uid: string) {
  for (const name of syncedTables) {
    const table = db.table(name);
    const rows =
      name === "preferences" || name === "sharing" || name === "partners"
        ? [await table.get(uid)].filter(Boolean)
        : await table.where("userId").equals(uid).toArray();
    for (const row of rows as Array<Record<string, unknown>>) {
      outbox.set(keyOf(name, String(row.id)), { tbl: name, id: String(row.id), data: JSON.parse(JSON.stringify(row)) as Record<string, unknown> });
    }
  }
  saveOutbox();
  emit({});
  schedulePush(100);
}
