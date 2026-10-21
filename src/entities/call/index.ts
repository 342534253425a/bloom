import { useSyncExternalStore } from "react";
import { getCouple, getItem, myId, onSignal as onSignalFromPartner, type TurnData } from "@/entities/couple";
import { contactByKey, contactConversation, getContacts, onChatSignal, partnerConversation, send as sendTo, type Conversation } from "@/entities/chat";
import { supabase } from "@/shared/api/supabase";
import { createId } from "@/shared/lib/id";
import { iceServers } from "@/shared/lib/webrtc/share";
import { captureScreenSound, canSwitchScreenSound, lastScreenSound } from "@/shared/lib/webrtc/screen-sound";
import type { ScreenSound } from "@/shared/lib/native";
import { CallLink, openCamera, openMic, openScreen, type CallSignal, type RemoteMedia } from "@/shared/lib/webrtc/call";

/**
 * Calls like Telegram's — with the partner, family or friends: ring → accept / decline → talk → hang up.
 * Ringing travels both as a live signal and as a shared "call" item (the item makes the server
 * push "… is calling" to a phone or computer where Bloom is closed). Every device of a person
 * rings; the one that answers takes the call and the others stop.
 */

export type CallPhase = "idle" | "outgoing" | "incoming" | "connecting" | "active" | "ended";
export type EndReason = "hangup" | "declined" | "missed" | "busy" | "lost" | "failed" | "media";
export type CallLog = { video: boolean; status: "ended" | "missed" | "declined"; seconds: number };
export type CallItem = { by: string; video: boolean; state: "ringing" | "accepted" | "ended"; at: string };

export type CallState = {
  phase: CallPhase;
  id: string | null;
  /** Who the call is with. */
  peer: { id: string; name: string; partner: boolean } | null;
  /** Started as a video call. */
  video: boolean;
  caller: boolean;
  mic: boolean;
  cam: boolean;
  screen: boolean;
  /** Sound sent with the shared screen (Windows app); null where it can't be switched. */
  screenSound: ScreenSound | null;
  facing: "user" | "environment";
  remote: { mic: boolean; cam: boolean; screen: boolean };
  link: RTCPeerConnectionState | "idle";
  answeredAt: number | null;
  ended: EndReason | null;
  minimized: boolean;
  emoji: string[];
  local: MediaStream | null;
  /** Your own shared screen, shown as its own picture. */
  localScreen: MediaStream | null;
  media: RemoteMedia | null;
};

const RING_MS = 45_000;
const device = createId();

const initial: CallState = {
  phase: "idle",
  id: null,
  peer: null,
  video: false,
  caller: false,
  mic: true,
  cam: false,
  screen: false,
  screenSound: null,
  facing: "user",
  remote: { mic: true, cam: false, screen: false },
  link: "idle",
  answeredAt: null,
  ended: null,
  minimized: false,
  emoji: [],
  local: null,
  localScreen: null,
  media: null,
};

let state: CallState = initial;
const listeners = new Set<() => void>();
function set(patch: Partial<CallState>) {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}

export function useCall(): CallState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
  );
}

export function getCall(): CallState {
  return state;
}

/* ------------------------------------------------------------------ media & connection */

let link: CallLink | null = null;
/** The chat the current call belongs to (signals, the ringing item and the call record go there). */
let conv: Conversation | null = null;

function peerOf(target: Conversation) {
  return { id: target.peer.id, name: target.peer.name, partner: target.isPartner };
}
let peerDevice: string | null = null;
let micTrack: MediaStreamTrack | null = null;
let camTrack: MediaStreamTrack | null = null;
let screenTracks: { video: MediaStreamTrack; audio: MediaStreamTrack | null } | null = null;
const timers = new Set<number>();
let ringTimer = 0;
let lostTimer = 0;

function later(fn: () => void, ms: number) {
  const id = window.setTimeout(() => {
    timers.delete(id);
    fn();
  }, ms);
  timers.add(id);
  return id;
}

function localStream(): MediaStream {
  // Your own corner shows the camera; only the screen when the camera is off.
  return new MediaStream([...(micTrack ? [micTrack] : []), ...(camTrack ? [camTrack] : screenTracks ? [screenTracks.video] : [])]);
}

function send(action: string, extra: Record<string, unknown> = {}) {
  void conv?.signal("call", { id: state.id, action, device, to: peerDevice, ...extra });
}

function sendMedia() {
  send("media", { mic: state.mic, cam: state.cam, screen: state.screen });
}

/** The relay (TURN) the server hands out, fetched ahead of a call and kept for a few hours. */
let relay: { servers: RTCIceServer[]; until: number } | null = null;
let relayLoading: Promise<void> | null = null;

function loadRelay(): Promise<void> {
  if (relay && relay.until > Date.now()) return Promise.resolve();
  relayLoading ??= Promise.race([
    supabase.functions.invoke("push", { body: { type: "turn" } }).then(({ data }) => {
      const list = (data as { iceServers?: RTCIceServer[] } | null)?.iceServers;
      if (Array.isArray(list)) relay = { servers: list, until: Date.now() + (list.length ? 6 * 3600_000 : 10 * 60_000) };
    }),
    new Promise<void>((resolve) => window.setTimeout(resolve, 5000)),
  ])
    .catch(() => undefined)
    .finally(() => {
      relayLoading = null;
    });
  return relayLoading;
}

function servers(): RTCIceServer[] {
  return [...iceServers(getItem<TurnData>("turn")?.data ?? null), ...(relay?.servers ?? [])];
}

async function startMedia(video: boolean) {
  micTrack = await openMic();
  if (video) camTrack = await openCamera({ facing: state.facing }).catch(() => null);
  set({ mic: true, cam: Boolean(camTrack), local: localStream() });
}

function stopMedia() {
  for (const track of [micTrack, camTrack, screenTracks?.video, screenTracks?.audio]) track?.stop();
  micTrack = camTrack = null;
  screenTracks = null;
}

function makeLink(caller: boolean) {
  link?.close();
  link = new CallLink(
    (message) => send("rtc", { rtc: message }),
    servers(),
    caller,
    (media) => set({ media: { ...media } }),
    (linkState) => onLinkState(linkState),
  );
  void link.setTrack("mic", micTrack);
  void link.setTrack("video", camTrack);
  void link.setTrack("screen", screenTracks?.video ?? null);
  void link.setTrack("screenAudio", screenTracks?.audio ?? null);
}

function onLinkState(linkState: RTCPeerConnectionState) {
  set({ link: linkState });
  if (linkState === "connected") {
    window.clearTimeout(lostTimer);
    lostTimer = 0;
    if (state.phase !== "active") set({ phase: "active", answeredAt: state.answeredAt ?? Date.now() });
    void link?.keyEmoji().then((emoji) => set({ emoji }));
    sendMedia();
  }
  if ((linkState === "disconnected" || linkState === "failed") && state.phase !== "ended") {
    // Try new network routes (Wi-Fi ↔ mobile, VPN changes); give up after half a minute.
    if (state.caller) later(() => link?.state !== "connected" && void link?.offer(true), linkState === "failed" ? 0 : 2500);
    if (!lostTimer) lostTimer = window.setTimeout(() => link?.state !== "connected" && finish("lost", true), 30_000);
  }
}

/* ------------------------------------------------------------------ actions */

export type StartError = "not-paired" | "busy" | "media";

/** Calls the partner, or anyone else when their chat is given. */
export async function startCall(video: boolean, target?: Conversation | null): Promise<StartError | null> {
  const to = target ?? partnerConversation();
  if (!to) return "not-paired";
  if (state.phase !== "idle" && state.phase !== "ended") return "busy";
  reset();
  conv = to;
  set({ phase: "outgoing", video, caller: true, id: `call:${createId()}`, facing: "user", peer: peerOf(to) });
  void loadRelay();
  try {
    await startMedia(video);
  } catch {
    finish("media", false);
    return "media";
  }
  // The person may have cancelled while the camera was starting.
  const now = getCall();
  if (now.phase !== "outgoing" || !now.id) return null;
  const id = now.id;
  await to.put(id, "call", { by: myId() ?? "", video, state: "ringing", at: new Date().toISOString() } satisfies CallItem).catch(() => undefined);
  const ring = () => {
    if (state.phase === "outgoing" && state.id === id) {
      send("ring", { video, name: getCouple().me?.name ?? "" });
      later(ring, 2500);
    }
  };
  ring();
  ringTimer = window.setTimeout(() => state.phase === "outgoing" && state.id === id && finish("missed", true), RING_MS);
  return null;
}

/** Answers a ringing call, with or without the camera. */
export async function acceptCall(video: boolean): Promise<StartError | null> {
  if (state.phase !== "incoming") return null;
  set({ phase: "connecting" });
  try {
    await Promise.all([startMedia(video), loadRelay()]);
  } catch {
    decline();
    return "media";
  }
  if (getCall().phase !== "connecting") return null;
  makeLink(false);
  send("accept");
  return null;
}

export function decline() {
  if (state.phase !== "incoming") return;
  send("decline");
  finish("declined", false);
}

/** Hangs up (or cancels an outgoing call). */
export function hangUp() {
  if (state.phase === "idle" || state.phase === "ended") return;
  if (state.phase === "incoming") return decline();
  send("end");
  finish(state.phase === "outgoing" ? "missed" : "hangup", true);
}

export function toggleMic() {
  if (!micTrack) return;
  micTrack.enabled = !micTrack.enabled;
  set({ mic: micTrack.enabled });
  sendMedia();
}

export async function toggleCamera(): Promise<boolean> {
  if (camTrack) {
    camTrack.stop();
    camTrack = null;
    await link?.setTrack("video", null);
    set({ cam: false, local: localStream() });
  } else {
    try {
      camTrack = await openCamera({ facing: state.facing });
    } catch {
      return false;
    }
    await link?.setTrack("video", camTrack);
    set({ cam: true, local: localStream() });
  }
  sendMedia();
  return true;
}

/** Phones: front ↔ back camera. */
export async function flipCamera() {
  const facing = state.facing === "user" ? "environment" : "user";
  set({ facing });
  if (!camTrack) return;
  camTrack.stop();
  camTrack = await openCamera({ facing }).catch(() => null);
  await link?.setTrack("video", camTrack);
  set({ cam: Boolean(camTrack), local: localStream() });
}

/** Switches the microphone or camera to another device (computers with several). */
export async function switchDevice(kind: "mic" | "cam", deviceId: string) {
  if (kind === "mic") {
    const next = await openMic(deviceId);
    next.enabled = state.mic;
    micTrack?.stop();
    micTrack = next;
    await link?.setTrack("mic", next);
  } else {
    const next = await openCamera({ deviceId });
    camTrack?.stop();
    camTrack = next;
    await link?.setTrack("video", next);
    set({ cam: true });
  }
  set({ local: localStream() });
  sendMedia();
}

/** Shares the screen (with its sound where possible) instead of the camera, and back. */
export async function toggleScreen(): Promise<boolean> {
  if (screenTracks) {
    stopScreen();
    return true;
  }
  try {
    screenTracks = await openScreen();
  } catch {
    return false;
  }
  screenTracks.video.addEventListener("ended", stopScreen, { once: true });
  // The camera stays on next to the screen, like a stream.
  await link?.setTrack("screen", screenTracks.video);
  await link?.setTrack("screenAudio", screenTracks.audio);
  set({ screen: true, localScreen: new MediaStream([screenTracks.video]), screenSound: canSwitchScreenSound() ? (screenTracks.audio ? lastScreenSound() : { pc: false, bloom: false }) : null, local: localStream() });
  sendMedia();
  return true;
}

function stopScreen() {
  if (!screenTracks) return;
  screenTracks.video.stop();
  screenTracks.audio?.stop();
  screenTracks = null;
  void link?.setTrack("screen", null);
  void link?.setTrack("screenAudio", null);
  set({ screen: false, localScreen: null, screenSound: null, local: localStream() });
  sendMedia();
}

/** Switches the shared screen's sound (computer without Bloom / Bloom's own) while sharing. */
export async function setScreenSound(sound: ScreenSound) {
  if (!screenTracks) return;
  set({ screenSound: sound });
  // Windows won't open a new sound capture while the old one runs, so the old one stops first.
  screenTracks.audio?.stop();
  screenTracks.audio = null;
  const track = await captureScreenSound(sound).catch(() => null);
  if (!screenTracks) {
    track?.stop();
    return;
  }
  if ((sound.pc || sound.bloom) && !track) set({ screenSound: { pc: false, bloom: false } });
  screenTracks.audio = track;
  await link?.setTrack("screenAudio", track);
}

/** Connection numbers for the "weak connection" hint. */
export function callStats() {
  return link ? link.stats() : Promise.resolve(null);
}

export function setMinimized(minimized: boolean) {
  set({ minimized });
}

/** Closes the "call ended" screen. */
export function dismissCall() {
  if (state.phase === "ended") reset();
}

function reset() {
  timers.forEach((id) => window.clearTimeout(id));
  timers.clear();
  window.clearTimeout(ringTimer);
  window.clearTimeout(lostTimer);
  ringTimer = lostTimer = 0;
  link?.close();
  link = null;
  peerDevice = null;
  stopMedia();
  state = initial;
  listeners.forEach((listener) => listener());
}

/** Ends the call here; the caller writes it into the chat (like Telegram's call messages). */
function finish(reason: EndReason, log: boolean) {
  if (state.phase === "idle" || state.phase === "ended") return;
  const { id, caller, video, answeredAt } = state;
  link?.close();
  link = null;
  stopMedia();
  window.clearTimeout(ringTimer);
  window.clearTimeout(lostTimer);
  set({ phase: "ended", ended: reason, local: null, localScreen: null, media: null, link: "closed", minimized: false });
  later(dismissCall, reason === "busy" || reason === "declined" ? 2600 : 1800);
  if (!id) return;
  const where = conv;
  if (!where) return;
  const item = where.getItem<CallItem>(id);
  if (item && item.data.state !== "ended") void where.put(id, "call", { ...item.data, state: "ended" }).catch(() => undefined);
  if (caller && log && reason !== "busy" && reason !== "media") {
    const seconds = answeredAt ? Math.round((Date.now() - answeredAt) / 1000) : 0;
    const status: CallLog["status"] = reason === "declined" ? "declined" : answeredAt ? "ended" : "missed";
    void sendTo(where, null, { call: { video, status, seconds } });
  }
}

/* ------------------------------------------------------------------ signals from the partner */

type Incoming = { id?: string; action?: string; device?: string; to?: string | null; from?: string; video?: boolean; rtc?: CallSignal; mic?: boolean; cam?: boolean; screen?: boolean };

function ring(from: Conversation, id: string, video: boolean, callerDevice: string | undefined) {
  if (state.phase !== "idle" && state.phase !== "ended") {
    if (state.id !== id) void from.signal("call", { id, action: "busy", device, to: callerDevice ?? null });
    return;
  }
  reset();
  conv = from;
  set({ phase: "incoming", id, video, caller: false, peer: peerOf(from) });
  void loadRelay();
  // Stop ringing if the caller gives up without telling us (closed app, lost network).
  window.clearTimeout(ringTimer);
  ringTimer = window.setTimeout(() => state.phase === "incoming" && state.id === id && finish("missed", false), RING_MS);
}

let started = false;

/** Listens for calls; call once after sign-in (CallHost does). */
export function listenForCalls() {
  if (started) return;
  started = true;
  const partnerSignal = (event: string, handler: (from: Conversation, payload: Record<string, unknown>) => void) =>
    onSignalFromPartner(event, (payload) => {
      const from = partnerConversation();
      if (from) handler(from, payload);
    });
  const contactSignal = (event: string, handler: (from: Conversation, payload: Record<string, unknown>) => void) =>
    onChatSignal(event, (chatKey, payload) => {
      const contact = contactByKey(chatKey);
      if (contact) handler(contactConversation(contact), payload);
    });
  const onCall = (from: Conversation, raw: Record<string, unknown>) => {
    const message = raw as Incoming;
    const me = myId();
    if (!message.id || !message.action) return;
    // Another device of mine answered or declined: stop ringing here.
    if (message.from === me) {
      if (message.device !== device && state.phase === "incoming" && state.id === message.id && ["accept", "decline"].includes(message.action)) reset();
      return;
    }
    if (message.to && message.to !== device) return;
    const mine = state.id === message.id;
    switch (message.action) {
      case "ring":
        if (!mine) ring(from, message.id, Boolean(message.video), message.device);
        else if (state.phase === "incoming") {
          window.clearTimeout(ringTimer);
          ringTimer = window.setTimeout(() => state.phase === "incoming" && finish("missed", false), 6000);
        }
        break;
      case "accept":
        if (mine && state.phase === "outgoing" && state.caller) {
          peerDevice = message.device ?? null;
          window.clearTimeout(ringTimer);
          set({ phase: "connecting" });
          const item = from.getItem<CallItem>(message.id);
          if (item) void from.put(message.id, "call", { ...item.data, state: "accepted" }).catch(() => undefined);
          void loadRelay().then(() => {
            if (state.phase !== "connecting" || state.id !== message.id) return;
            makeLink(true);
            void link?.offer();
          });
        }
        break;
      case "decline":
        if (mine && state.phase === "outgoing") finish("declined", true);
        break;
      case "busy":
        if (mine && state.phase === "outgoing") finish("busy", true);
        break;
      case "end":
        if (mine) finish(state.phase === "incoming" ? "missed" : "hangup", true);
        break;
      case "rtc":
        if (!mine || !message.rtc) return;
        if (!peerDevice && message.device) peerDevice = message.device;
        if (!link && !state.caller && state.phase === "connecting") makeLink(false);
        void link?.handle(message.rtc);
        break;
      case "media":
        if (mine) set({ remote: { mic: message.mic !== false, cam: Boolean(message.cam), screen: Boolean(message.screen) } });
        break;
    }
  };
  // Opened from a "… is calling" notification: the call item is already there.
  const onItem = (from: Conversation, row: Record<string, unknown>) => {
    const item = row as unknown as { id: string; author: string; data: CallItem };
    if (item.author !== myId() && item.data?.state === "ringing" && Date.now() - Date.parse(item.data.at) < RING_MS) ring(from, item.id, item.data.video, undefined);
  };
  partnerSignal("call", onCall);
  contactSignal("call", onCall);
  partnerSignal("item:call", onItem);
  contactSignal("item:call", onItem);
}

/** A call that is still ringing for me (e.g. right after opening Bloom from the notification). */
export function checkRinging() {
  const me = myId();
  if (!me || state.phase !== "idle") return;
  const chats = [partnerConversation(), ...getContacts().list.map(contactConversation)].filter((item): item is Conversation => Boolean(item));
  for (const from of chats) {
    const ringing = from.getItems<CallItem>("call").find((item) => item.author !== me && item.data.state === "ringing" && Date.now() - Date.parse(item.data.at) < RING_MS);
    if (ringing) return ring(from, ringing.id, ringing.data.video, undefined);
  }
}


/** Development only: show a call screen in any state without a second device. */
if (import.meta.env.DEV) (window as unknown as { __bloomCallPreview?: (patch: Partial<CallState>) => void }).__bloomCallPreview = (patch) => set(patch);
