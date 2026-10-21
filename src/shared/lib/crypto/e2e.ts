/**
 * End-to-end encryption primitives (WebCrypto only, nothing leaves the device unencrypted):
 * - each person has an ECDH P-256 key pair; the private key lives on the device and, for new devices,
 *   on the server wrapped with a key derived from the person's PIN (PBKDF2-SHA-256, 600 000 rounds, AES-GCM);
 * - two people share a message key: ECDH → HKDF-SHA-256 → AES-256-GCM;
 * - every envelope carries both public keys, so it can be opened later even after either side gets a new key;
 * - files get their own random AES-256-GCM key, which travels inside the encrypted message.
 */

export type PublicJwk = { kty: "EC"; crv: "P-256"; x: string; y: string };
export type Envelope = { v: 1; a: PublicJwk; b: PublicJwk; iv: string; ct: string };
export type PinBackup = { wrapped: string; salt: string; iv: string; iterations: number };
export type FileSecret = { k: string; iv: string; mime: string };

const ECDH = { name: "ECDH", namedCurve: "P-256" } as const;
const PIN_ROUNDS = 600_000;
const enc = new TextEncoder();
const dec = new TextDecoder();

export function toB64(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let text = "";
  for (let i = 0; i < view.length; i += 0x8000) text += String.fromCharCode(...view.subarray(i, i + 0x8000));
  return btoa(text);
}

export function fromB64(text: string): Uint8Array<ArrayBuffer> {
  const raw = atob(text);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function random(length: number) {
  return crypto.getRandomValues(new Uint8Array(new ArrayBuffer(length)));
}

export function samePublic(a: PublicJwk | null | undefined, b: PublicJwk | null | undefined) {
  return Boolean(a && b && a.x === b.x && a.y === b.y);
}

/* ---------- identity ---------- */

export type Identity = { privateKey: CryptoKey; publicJwk: PublicJwk };

/** A new key pair. The private key is extractable only so it can be wrapped with the PIN once. */
export async function newIdentity(): Promise<{ identity: Identity; pkcs8: ArrayBuffer }> {
  const pair = (await crypto.subtle.generateKey(ECDH, true, ["deriveBits"])) as CryptoKeyPair;
  const jwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  const pkcs8 = await crypto.subtle.exportKey("pkcs8", pair.privateKey);
  const privateKey = await crypto.subtle.importKey("pkcs8", pkcs8, ECDH, false, ["deriveBits"]);
  return { identity: { privateKey, publicJwk: { kty: "EC", crv: "P-256", x: jwk.x!, y: jwk.y! } }, pkcs8 };
}

async function pinKey(pin: string, salt: Uint8Array<ArrayBuffer>, iterations: number) {
  const base = await crypto.subtle.importKey("raw", enc.encode(pin.normalize("NFKC")), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

/** The private key locked with the PIN, for the server copy. */
export async function wrapWithPin(pkcs8: ArrayBuffer, pin: string): Promise<PinBackup> {
  const salt = random(16);
  const iv = random(12);
  const key = await pinKey(pin, salt, PIN_ROUNDS);
  const wrapped = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, pkcs8);
  return { wrapped: toB64(wrapped), salt: toB64(salt), iv: toB64(iv), iterations: PIN_ROUNDS };
}

/** Opens the server copy with the PIN; a wrong PIN throws. */
export async function unwrapWithPin(backup: PinBackup, pin: string, publicJwk: PublicJwk): Promise<Identity> {
  const key = await pinKey(pin, fromB64(backup.salt), backup.iterations);
  const pkcs8 = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(backup.iv) }, key, fromB64(backup.wrapped));
  const privateKey = await crypto.subtle.importKey("pkcs8", pkcs8, ECDH, false, ["deriveBits"]);
  return { privateKey, publicJwk };
}

/* ---------- shared keys ---------- */

const shared = new Map<string, Promise<CryptoKey>>();

/** The AES key two people share (the same from both sides). */
function sharedKey(me: Identity, other: PublicJwk): Promise<CryptoKey> {
  const id = `${me.publicJwk.x}|${other.x}`;
  let key = shared.get(id);
  if (!key) {
    key = (async () => {
      const otherKey = await crypto.subtle.importKey("jwk", { ...other, ext: true }, ECDH, false, []);
      const bits = await crypto.subtle.deriveBits({ name: "ECDH", public: otherKey }, me.privateKey, 256);
      const hkdf = await crypto.subtle.importKey("raw", bits, "HKDF", false, ["deriveKey"]);
      return crypto.subtle.deriveKey(
        { name: "HKDF", hash: "SHA-256", salt: enc.encode("bloom-e2e-v1"), info: enc.encode("bloom-chat-message") },
        hkdf,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"],
      );
    })();
    shared.set(id, key);
  }
  return key;
}

export function forgetSharedKeys() {
  shared.clear();
}

/** Encrypts a JSON value for the two of us. */
export async function seal(me: Identity, other: PublicJwk, value: unknown): Promise<Envelope> {
  const key = await sharedKey(me, other);
  const iv = random(12);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(JSON.stringify(value)));
  return { v: 1, a: me.publicJwk, b: other, iv: toB64(iv), ct: toB64(ct) };
}

/** Opens an envelope written by either of us; throws when it isn't ours or was changed. */
export async function open<T>(me: Identity, envelope: Envelope): Promise<T> {
  const other = samePublic(envelope.a, me.publicJwk) ? envelope.b : samePublic(envelope.b, me.publicJwk) ? envelope.a : null;
  if (!other) throw new Error("not-for-this-key");
  const key = await sharedKey(me, other);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(envelope.iv) }, key, fromB64(envelope.ct));
  return JSON.parse(dec.decode(plain)) as T;
}

/* ---------- files ---------- */

export async function encryptFile(blob: Blob): Promise<{ blob: Blob; secret: FileSecret }> {
  const raw = random(32);
  const iv = random(12);
  const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt"]);
  const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, await blob.arrayBuffer());
  const mime = blob.type.split(";")[0] || "application/octet-stream";
  // The stored file keeps a harmless type label (the storage only accepts media types); its bytes are unreadable.
  return { blob: new Blob([data], { type: mime }), secret: { k: toB64(raw), iv: toB64(iv), mime } };
}

export async function decryptFile(data: ArrayBuffer, secret: FileSecret): Promise<Blob> {
  const key = await crypto.subtle.importKey("raw", fromB64(secret.k), "AES-GCM", false, ["decrypt"]);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(secret.iv) }, key, data);
  return new Blob([plain], { type: secret.mime });
}

/* ---------- the private key on this device ---------- */

const DB = "bloom-e2e";
const STORE = "keys";

function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const request = run(db.transaction(STORE, mode).objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Saved as a non-extractable CryptoKey: even code on this page can use it but can't read it out. */
export async function saveLocalIdentity(userId: string, identity: Identity) {
  await tx("readwrite", (store) => store.put(identity, userId));
}

export async function loadLocalIdentity(userId: string): Promise<Identity | null> {
  try {
    return ((await tx("readonly", (store) => store.get(userId))) as Identity | undefined) ?? null;
  } catch {
    return null;
  }
}

export async function forgetLocalIdentity(userId: string) {
  try {
    await tx("readwrite", (store) => store.delete(userId));
  } catch {
    /* nothing stored */
  }
}
