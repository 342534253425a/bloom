import { useSyncExternalStore } from "react";
import { supabase } from "@/shared/api/supabase";
import {
  forgetLocalIdentity,
  forgetSharedKeys,
  loadLocalIdentity,
  newIdentity,
  open,
  samePublic,
  saveLocalIdentity,
  seal,
  unwrapWithPin,
  wrapWithPin,
  type Envelope,
  type Identity,
  type PinBackup,
  type PublicJwk,
} from "@/shared/lib/crypto/e2e";

/**
 * End-to-end encrypted chats: this person's key on this device, the PIN-locked copy on the server,
 * and turning messages into envelopes (on sending) and back (on arrival). The server only ever sees envelopes.
 *
 * "setup"  — no key yet anywhere: Bloom asks to create a PIN;
 * "locked" — a key exists (another device), but not here: Bloom asks for the PIN;
 * "ready"  — messages are encrypted and decrypted on this device.
 */
export type E2EStatus = "off" | "checking" | "setup" | "locked" | "ready";

/** `asking`: the PIN window is open (on its own after sign-in, or when a chat needs the key). */
type E2EState = { status: E2EStatus; fingerprint: string | null; asking: boolean };

let state: E2EState = { status: "off", fingerprint: null, asking: false };
let me: Identity | null = null;
let userId: string | null = null;
const listeners = new Set<() => void>();

function set(patch: Partial<E2EState>) {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}

export function getE2E(): E2EState {
  return state;
}

export function useE2E(): E2EState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
  );
}

/** Opens the PIN window (create a PIN, or enter it on this device). */
export function askPin() {
  if (state.status === "setup" || state.status === "locked") set({ asking: true });
}

export function closePin() {
  set({ asking: false });
}

/** Stores re-open their envelopes when the key arrives on this device (after the PIN). */
export function onE2EChange(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Short code of a public key, to compare on two screens if ever needed. */
function fingerprintOf(jwk: PublicJwk) {
  return `${jwk.x.slice(0, 4)}·${jwk.y.slice(0, 4)}`.toUpperCase();
}

type BackupRow = PinBackup & { public: PublicJwk };

/** The server copy, or null when there is none; throws when the server couldn't be asked (offline). */
async function backupRow(full: boolean): Promise<BackupRow | null> {
  if (!userId) return null;
  const { data, error } = await supabase
    .from("e2e_backups")
    .select(full ? "wrapped,salt,iv,iterations,public" : "public")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return (data as BackupRow | null) ?? null;
}

async function publishPublicKey(jwk: PublicJwk) {
  if (userId) await supabase.from("profiles").update({ e2e_public: jwk }).eq("id", userId);
}

/** After sign-in: finds this person's key here or on the server. */
export async function startE2E(uid: string) {
  if (userId === uid && state.status !== "off") return;
  userId = uid;
  set({ status: "checking" });
  let local: Identity | null;
  let backup: BackupRow | null;
  try {
    [local, backup] = await Promise.all([loadLocalIdentity(uid), backupRow(false)]);
  } catch {
    // Offline: never guess "no key yet" (a new key would lock the old messages away). Try again shortly.
    window.setTimeout(() => {
      if (userId === uid && state.status === "checking") {
        userId = null;
        void startE2E(uid);
      }
    }, 10_000);
    return;
  }
  if (userId !== uid) return;
  if (local && backup && samePublic(local.publicJwk, backup.public)) {
    me = local;
    set({ status: "ready", fingerprint: fingerprintOf(local.publicJwk) });
    // Make sure partners and contacts can encrypt to this key.
    void publishPublicKey(local.publicJwk);
    return;
  }
  if (local && !samePublic(local.publicJwk, backup?.public)) await forgetLocalIdentity(uid);
  me = null;
  // Asked once after sign-in; "Later" closes it until a chat needs the key.
  set({ status: backup ? "locked" : "setup", fingerprint: null, asking: true });
}

/** First time: a new key, kept on this device and, locked with the PIN, on the server. */
export async function createKey(pin: string, replace = false) {
  if (!userId) throw new Error("signed-out");
  // An existing key is only ever replaced on purpose ("Forgot the PIN?").
  if (!replace && (await backupRow(false))) {
    set({ status: "locked" });
    throw new Error("key-exists");
  }
  const { identity, pkcs8 } = await newIdentity();
  const backup = await wrapWithPin(pkcs8, pin);
  const { error } = await supabase.from("e2e_backups").upsert({ user_id: userId, ...backup, public: identity.publicJwk, updated_at: new Date().toISOString() });
  if (error) throw error;
  await publishPublicKey(identity.publicJwk);
  await saveLocalIdentity(userId, identity);
  forgetSharedKeys();
  me = identity;
  set({ status: "ready", fingerprint: fingerprintOf(identity.publicJwk), asking: false });
}

export type UnlockError = "wrong-pin" | "no-backup" | "offline";

/** A new device: the PIN opens the server copy of the key. */
export async function unlock(pin: string): Promise<UnlockError | null> {
  if (!userId) return "offline";
  let backup: BackupRow | null;
  try {
    backup = await backupRow(true);
  } catch {
    return "offline";
  }
  if (!backup) return "no-backup";
  let identity: Identity;
  try {
    identity = await unwrapWithPin(backup, pin, backup.public);
  } catch {
    return "wrong-pin";
  }
  await saveLocalIdentity(userId, identity);
  me = identity;
  set({ status: "ready", fingerprint: fingerprintOf(identity.publicJwk), asking: false });
  void publishPublicKey(identity.publicJwk);
  return null;
}

/** Forgot the PIN: a brand-new key. Messages encrypted with the old one can no longer be read. */
export async function resetKey(pin: string) {
  await createKey(pin, true);
}

/** Signing out: the key leaves this device (the PIN brings it back). */
export async function stopE2E() {
  if (userId) await forgetLocalIdentity(userId);
  me = null;
  userId = null;
  forgetSharedKeys();
  set({ status: "off", fingerprint: null, asking: false });
}

/* ------------------------------------------------------------------ the other side's key */

const peers = new Map<string, { jwk: PublicJwk | null; at: number }>();

export async function peerKey(peerId: string, fresh = false): Promise<PublicJwk | null> {
  const cached = peers.get(peerId);
  if (cached && !fresh && Date.now() - cached.at < 60_000) return cached.jwk;
  const { data } = await supabase.from("profiles").select("e2e_public").eq("id", peerId).maybeSingle();
  const jwk = ((data as { e2e_public?: PublicJwk | null } | null)?.e2e_public ?? null) as PublicJwk | null;
  peers.set(peerId, { jwk, at: Date.now() });
  return jwk;
}

/** True when messages to this person are encrypted (both have keys). */
export async function encryptedWith(peerId: string): Promise<boolean> {
  return state.status === "ready" && Boolean(await peerKey(peerId));
}

/* ------------------------------------------------------------------ messages */

/** What goes inside the envelope. Reactions, pins, edits and call times stay outside (they carry no content). */
const SECRET = ["text", "sticker", "photo", "video", "voice", "file", "topic", "forwarded"] as const;

/** Envelope → its opened content, so our own messages and re-saves don't need to decrypt again. */
const opened = new Map<string, Record<string, unknown>>();

export class E2ELockedError extends Error {
  constructor() {
    super("e2e-locked");
  }
}

/** Turns a message into what the server may see: everything secret goes into an envelope for the two of us. */
export async function sealMessage(peerId: string, data: Record<string, unknown>): Promise<Record<string, unknown>> {
  // Right after start the key is still being looked up: wait for it a moment.
  if (state.status === "checking")
    await new Promise<void>((resolve) => {
      const done = () => {
        if (state.status === "checking") return;
        off();
        window.clearTimeout(timer);
        resolve();
      };
      const off = onE2EChange(done);
      const timer = window.setTimeout(() => {
        off();
        resolve();
      }, 6000);
    });
  // A key exists but not on this device: never send in the clear by accident.
  if (state.status === "locked" || state.status === "checking") throw new E2ELockedError();
  const secret: Record<string, unknown> = {};
  const rest: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(data)) {
    if ((SECRET as readonly string[]).includes(field)) secret[field] = value;
    else if (field !== "enc" && field !== "locked" && field !== "unreadable") rest[field] = value;
  }
  const before = data.enc as Envelope | undefined;
  if (!me) return before ? { ...rest, enc: before } : data;
  const peer = await peerKey(peerId);
  // The other side has no key yet: the message goes as before, unencrypted.
  if (!peer) return before ? { ...rest, enc: before } : { ...rest, ...secret };
  // Unchanged content (a reaction, a pin): keep the same envelope.
  if (before && JSON.stringify(opened.get(before.ct)) === JSON.stringify(secret) && samePublic(before.a, me.publicJwk)) return { ...rest, enc: before };
  const envelope = await seal(me, peer, secret);
  opened.set(envelope.ct, secret);
  return { ...rest, enc: envelope };
}

type Item = { id: string; data: Record<string, unknown> };

/** The opened message right away, when it is already known; null when it still has to be decrypted. */
export function revealNow<T extends Item>(item: T): T | null {
  const envelope = item.data?.enc as Envelope | undefined;
  if (!envelope) return item;
  const content = opened.get(envelope.ct);
  return content ? { ...item, data: { ...item.data, ...content } } : null;
}

/** Decrypts a message (or marks it as locked / unreadable). */
export async function reveal<T extends Item>(item: T): Promise<T> {
  const now = revealNow(item);
  if (now) return now;
  const envelope = item.data.enc as Envelope;
  if (!me) return { ...item, data: { ...item.data, locked: true } };
  try {
    const content = await open<Record<string, unknown>>(me, envelope);
    opened.set(envelope.ct, content);
    return { ...item, data: { ...item.data, ...content } };
  } catch {
    return { ...item, data: { ...item.data, unreadable: true } };
  }
}

/** For the stores: put the opened message into `target` now if possible, otherwise as soon as it is decrypted. */
export function revealInto<T extends Item>(target: Map<string, T>, item: T, changed: () => void): T {
  const now = revealNow(item);
  if (now) return now;
  void reveal(item).then((done) => {
    if (target.get(item.id) !== item) return;
    target.set(item.id, done);
    changed();
  });
  return item;
}
