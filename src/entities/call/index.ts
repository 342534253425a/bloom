import type { RealtimeChannel } from "@supabase/supabase-js";
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
 * Calls like Telegram's — with the partner, family or friends, and with several people at once.
 *
 * Ringing goes through the private chat of the two people (a live signal plus a "call" item, so the server can
 * push "… is calling" when Bloom is closed). Everyone in a call meets in a room: a live channel whose secret name
 * only the invited know. There each person's device connects to every other one directly (a mesh, fine for a few
 * people); of each pair, the device with the smaller id makes the offers, so the two never collide.
 * Any participant may invite the partner or a contact — the invitation is the permission to join.
 */

export type CallPhase = "idle" | "outgoing" | "incoming" | "connecting" | "active" | "ended";
export type EndReason = "hangup" | "declined" | "missed" | "busy" | "lost" | "failed" | "media";
export type CallLog = { video: boolean; status: "ended" | "missed" | "declined"; seconds: number };
export type CallItem = { by: string; video: boolean; state: "ringing" | "accepted" | "ended"; at: string; room?: string; group?: boolean };

/** Someone else in the call (one of their devices). */
export type Participant = {
  key: string;
  user: string;
  name: string;
  link: RTCPeerConnectionState | "new";
  remote: { mic: boolean; cam: boolean; screen: boolean };
  media: RemoteMedia | null;
};

export type CallState = {
  phase: CallPhase;
  id: string | null;
  /** Who the call is with (the first person; see \`people\` for everyone). */
  peer: { id: string; name: string; partner: boolean } | null;
  /** Everyone else in the call. */
  people: Participant[];
  /** Invited and still ringing (names). */
  inviting: string[];
  /** This call was an invitation into a group call. */
  group: boolean;
  /** Started as a video call. */
  video: boolean;
  caller: boolean;
  mic: boolean;
  cam: boolean;
  screen: boolean;
  /** Sound sent with the shared screen (Windows app); null where it can't be switched. */
  screenSound: ScreenSound | null;
  facing: "user" | "environment";
  /** The first person's media, kept for the one-to-one screens. */
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
  people: [],
  inviting: [],
  group: false,
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

/* ------------------------------------------------------------------ media */

let micTrack: MediaStreamTrack | null = null;
let camTrack: MediaStreamTrack | null = null;
let screenTracks: { video: MediaStreamTrack; audio: MediaStreamTrack | null } | null = null;
const timers = new Set<number>();
let ringTimer = 0;

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

/* ------------------------------------------------------------------ the room: everyone in the call */

let room: string | null = null;
let channel: RealtimeChannel | null = null;
/** One direct connection per other device in the room. */
const links = new Map<string, CallLink>();
/** Who is where: device → person. */
const members = new Map<string, { user: string; name: string }>();
const lostTimers = new Map<string, number>();
/** Someone else was in the call at some point (so being left alone ends it). */
let hadCompany = false;

function myName() {
  return getCouple().me?.name || "♥";
}

function roomSend(event: string, payload: Record<string, unknown>) {
  void channel?.send({ type: "broadcast", event, payload: { ...payload, from: device } });
}

function sendMedia() {
  roomSend("media", { mic: state.mic, cam: state.cam, screen: state.screen });
}

/** Rebuilds the list of people (and the one-to-one fields from the first person). */
function publishPeople(patch: Partial<Record<string, Partial<Participant>>> = {}) {
  const current = new Map(state.people.map((person) => [person.key, person]));
  const people: Participant[] = [];
  for (const [key, who] of members) {
    const before = current.get(key);
    people.push({
      key,
      user: who.user,
      name: who.name,
      link: before?.link ?? "new",
      remote: before?.remote ?? { mic: true, cam: false, screen: false },
      media: before?.media ?? null,
      ...(patch[key] ?? {}),
    });
  }
  const first = people[0];
  const anyConnected = people.some((person) => person.link === "connected");
  set({
    people,
    remote: first?.remote ?? initial.remote,
    media: first?.media ?? null,
    link: first ? (anyConnected ? "connected" : first.link === "new" ? "connecting" : first.link) : state.link,
    peer: first ? { id: first.user, name: people.map((person) => person.name).join(", "), partner: first.user === getCouple().partner?.id } : state.peer,
  });
}

function makeLink(key: string) {
  const offerer = device < key;
  const peerLink = new CallLink(
    (message) => roomSend("rtc", { to: key, rtc: message }),
    servers(),
    offerer,
    (media) => publishPeople({ [key]: { media: { ...media } } }),
    (linkState) => onLinkState(key, linkState),
  );
  links.set(key, peerLink);
  void peerLink.setTrack("mic", micTrack);
  void peerLink.setTrack("video", camTrack);
  void peerLink.setTrack("screen", screenTracks?.video ?? null);
  void peerLink.setTrack("screenAudio", screenTracks?.audio ?? null);
  if (offerer) void peerLink.offer();
  return peerLink;
}

function dropLink(key: string) {
  links.get(key)?.close();
  links.delete(key);
  window.clearTimeout(lostTimers.get(key));
  lostTimers.delete(key);
  members.delete(key);
}

function onLinkState(key: string, linkState: RTCPeerConnectionState) {
  publishPeople({ [key]: { link: linkState } });
  const peerLink = links.get(key);
  if (linkState === "connected") {
    window.clearTimeout(lostTimers.get(key));
    lostTimers.delete(key);
    if (state.phase !== "active") set({ phase: "active", answeredAt: state.answeredAt ?? Date.now() });
    // The key emoji only make sense between two people.
    if (links.size === 1) void peerLink?.keyEmoji().then((emoji) => set({ emoji }));
    else if (state.emoji.length) set({ emoji: [] });
    sendMedia();
  }
  if ((linkState === "disconnected" || linkState === "failed") && state.phase !== "ended") {
    // Try new network routes (Wi-Fi ↔ mobile, VPN changes); give up on this person after half a minute.
    if (device < key) later(() => links.get(key)?.state !== "connected" && void links.get(key)?.offer(true), linkState === "failed" ? 0 : 2500);
    if (!lostTimers.has(key))
      lostTimers.set(
        key,
        window.setTimeout(() => {
          if (links.get(key)?.state === "connected") return;
          dropLink(key);
          publishPeople();
          aloneCheck("lost");
        }, 30_000),
      );
  }
}

/** Everyone else left: the call is over. */
function aloneCheck(reason: EndReason) {
  if (hadCompany && members.size === 0 && !ringing.size && state.phase !== "ended" && state.phase !== "idle") finish(reason, true);
}

function syncMembers() {
  if (!channel) return;
  const present = channel.presenceState() as Record<string, Array<{ user?: string; name?: string }>>;
  const seen = new Set<string>();
  for (const [key, metas] of Object.entries(present)) {
    if (key === device) continue;
    seen.add(key);
    const meta = metas[0] ?? {};
    const known = members.has(key) && members.get(key)!.user !== "";
    members.set(key, { user: String(meta.user ?? ""), name: String(meta.name ?? "♥") });
    if (!known) {
      hadCompany = true;
      // An invited person came in: stop ringing them.
      for (const [convKey, ring] of ringing) if (ring.user === meta.user) stopRinging(convKey);
      if (state.phase === "outgoing") {
        window.clearTimeout(ringTimer);
        set({ phase: "connecting" });
      }
      if (!links.has(key)) makeLink(key);
    }
  }
  for (const key of [...members.keys()]) if (!seen.has(key)) dropLink(key);
  publishPeople();
  aloneCheck("hangup");
}

function joinRoom(name: string) {
  leaveRoom();
  room = name;
  hadCompany = false;
  const current = supabase.channel(`call-${name}`, { config: { broadcast: { self: false, ack: false }, presence: { key: device } } });
  channel = current;
  current
    .on("presence", { event: "sync" }, () => current === channel && syncMembers())
    .on("broadcast", { event: "rtc" }, ({ payload }) => {
      const message = payload as { from?: string; to?: string; rtc?: CallSignal };
      if (current !== channel || message.to !== device || !message.from || !message.rtc) return;
      // An offer can arrive before the room has shown who sent it: answer anyway, the name follows.
      if (!members.has(message.from)) {
        members.set(message.from, { user: "", name: "…" });
        hadCompany = true;
        publishPeople();
      }
      const peerLink = links.get(message.from) ?? makeLink(message.from);
      void peerLink.handle(message.rtc);
    })
    .on("broadcast", { event: "media" }, ({ payload }) => {
      const message = payload as { from?: string; mic?: boolean; cam?: boolean; screen?: boolean };
      if (current !== channel || !message.from || !members.has(message.from)) return;
      publishPeople({ [message.from]: { remote: { mic: message.mic !== false, cam: Boolean(message.cam), screen: Boolean(message.screen) } } });
    })
    .on("broadcast", { event: "leave" }, ({ payload }) => {
      const from = (payload as { from?: string }).from;
      if (current !== channel || !from) return;
      dropLink(from);
      publishPeople();
      aloneCheck("hangup");
    })
    .subscribe((status) => {
      if (status === "SUBSCRIBED") void current.track({ user: myId() ?? "", name: myName(), at: Date.now() });
    });
}

function leaveRoom() {
  if (channel) {
    roomSend("leave", {});
    void supabase.removeChannel(channel);
  }
  channel = null;
  room = null;
  for (const key of [...links.keys()]) dropLink(key);
  members.clear();
}

function forEachLink(run: (peerLink: CallLink) => void | Promise<void>) {
  return Promise.all([...links.values()].map((peerLink) => run(peerLink)));
}

/* ------------------------------------------------------------------ ringing (through each person's private chat) */

/** Calls still ringing, by chat: whom, which device answered nothing yet. */
const ringing = new Map<string, { conv: Conversation; user: string; name: string; timer: number }>();
/** The chat a call came through (or started in): the call record and "busy" replies go there. */
let home: Conversation | null = null;

function signalIn(conv: Conversation, action: string, extra: Record<string, unknown> = {}) {
  void conv.signal("call", { id: state.id, action, device, room, ...extra });
}

function startRinging(conv: Conversation, group: boolean) {
  const id = state.id;
  if (!id || ringing.has(conv.key)) return;
  void conv.put(id, "call", { by: myId() ?? "", video: state.video, state: "ringing", at: new Date().toISOString(), room: room ?? undefined, group } satisfies CallItem).catch(() => undefined);
  const tick = () => {
    if (!ringing.has(conv.key) || state.id !== id) return;
    signalIn(conv, "ring", { video: state.video, name: myName(), group });
    later(tick, 2500);
  };
  ringing.set(conv.key, {
    conv,
    user: conv.peer.id,
    name: conv.peer.name,
    timer: window.setTimeout(() => {
      stopRinging(conv.key, "missed");
      // Nobody came to a one-to-one call.
      if (!hadCompany && !ringing.size && state.phase === "outgoing") finish("missed", true);
    }, RING_MS),
  });
  set({ inviting: [...ringing.values()].map((ring) => ring.name) });
  tick();
}

function stopRinging(convKey: string, outcome: "missed" | "answered" | "declined" = "answered") {
  const ring = ringing.get(convKey);
  if (!ring) return;
  window.clearTimeout(ring.timer);
  ringing.delete(convKey);
  set({ inviting: [...ringing.values()].map((item) => item.name) });
  const id = state.id;
  if (!id) return;
  if (outcome !== "answered") signalIn(ring.conv, "end");
  const item = ring.conv.getItem<CallItem>(id);
  if (item && item.data.state === "ringing") void ring.conv.put(id, "call", { ...item.data, state: outcome === "answered" ? "accepted" : "ended" }).catch(() => undefined);
}

/* ------------------------------------------------------------------ actions */

export type StartError = "not-paired" | "busy" | "media";

/** Calls the partner, or anyone else when their chat is given. */
export async function startCall(video: boolean, target?: Conversation | null): Promise<StartError | null> {
  const to = target ?? partnerConversation();
  if (!to) return "not-paired";
  if (state.phase !== "idle" && state.phase !== "ended") return "busy";
  reset();
  home = to;
  set({ phase: "outgoing", video, caller: true, id: `call:${createId()}`, facing: "user", peer: { id: to.peer.id, name: to.peer.name, partner: to.isPartner } });
  void loadRelay();
  try {
    await startMedia(video);
  } catch {
    finish("media", false);
    return "media";
  }
  // The person may have cancelled while the camera was starting.
  if (getCall().phase !== "outgoing") return null;
  joinRoom(createId() + createId());
  startRinging(to, false);
  return null;
}

/** Invites someone else into this call (the partner or a contact); any participant may. */
export function inviteToCall(to: Conversation) {
  if (state.phase === "idle" || state.phase === "ended" || state.phase === "incoming" || !room) return;
  if (state.people.some((person) => person.user === to.peer.id) || ringing.has(to.key)) return;
  startRinging(to, true);
}

let pendingRoom: string | null = null;

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
  if (home) signalIn(home, "accept", { room: pendingRoom });
  if (pendingRoom) joinRoom(pendingRoom);
  return null;
}

export function decline() {
  if (state.phase !== "incoming") return;
  if (home) signalIn(home, "decline", { room: pendingRoom });
  finish("declined", false);
}

/** Hangs up (or cancels an outgoing call); the others in a group call carry on. */
export function hangUp() {
  if (state.phase === "idle" || state.phase === "ended") return;
  if (state.phase === "incoming") return decline();
  for (const convKey of [...ringing.keys()]) stopRinging(convKey, "missed");
  finish(state.phase === "outgoing" && !hadCompany ? "missed" : "hangup", true);
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
    await forEachLink((peerLink) => peerLink.setTrack("video", null));
    set({ cam: false, local: localStream() });
  } else {
    try {
      camTrack = await openCamera({ facing: state.facing });
    } catch {
      return false;
    }
    await forEachLink((peerLink) => peerLink.setTrack("video", camTrack));
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
  await forEachLink((peerLink) => peerLink.setTrack("video", camTrack));
  set({ cam: Boolean(camTrack), local: localStream() });
}

/** Switches the microphone or camera to another device (computers with several). */
export async function switchDevice(kind: "mic" | "cam", deviceId: string) {
  if (kind === "mic") {
    const next = await openMic(deviceId);
    next.enabled = state.mic;
    micTrack?.stop();
    micTrack = next;
    await forEachLink((peerLink) => peerLink.setTrack("mic", next));
  } else {
    const next = await openCamera({ deviceId });
    camTrack?.stop();
    camTrack = next;
    await forEachLink((peerLink) => peerLink.setTrack("video", next));
    set({ cam: true });
  }
  set({ local: localStream() });
  sendMedia();
}

/** Shares the screen (with its sound where possible) next to the camera, and back. */
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
  const tracks = screenTracks;
  await forEachLink(async (peerLink) => {
    await peerLink.setTrack("screen", tracks.video);
    await peerLink.setTrack("screenAudio", tracks.audio);
  });
  set({ screen: true, localScreen: new MediaStream([tracks.video]), screenSound: canSwitchScreenSound() ? (tracks.audio ? lastScreenSound() : { pc: false, bloom: false }) : null, local: localStream() });
  sendMedia();
  return true;
}

function stopScreen() {
  if (!screenTracks) return;
  screenTracks.video.stop();
  screenTracks.audio?.stop();
  screenTracks = null;
  void forEachLink(async (peerLink) => {
    await peerLink.setTrack("screen", null);
    await peerLink.setTrack("screenAudio", null);
  });
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
  await forEachLink((peerLink) => peerLink.setTrack("screenAudio", track));
}

/** Connection numbers for the "weak connection" hint (the first person's link). */
export function callStats() {
  const first = links.values().next().value as CallLink | undefined;
  return first ? first.stats() : Promise.resolve(null);
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
  ringTimer = 0;
  for (const ring of ringing.values()) window.clearTimeout(ring.timer);
  ringing.clear();
  leaveRoom();
  stopMedia();
  home = null;
  pendingRoom = null;
  hadCompany = false;
  state = initial;
  listeners.forEach((listener) => listener());
}

/** Ends the call here; whoever started it writes it into the chat (like Telegram's call messages). */
function finish(reason: EndReason, log: boolean) {
  if (state.phase === "idle" || state.phase === "ended") return;
  const { id, caller, video, answeredAt } = state;
  for (const convKey of [...ringing.keys()]) stopRinging(convKey, "missed");
  leaveRoom();
  stopMedia();
  window.clearTimeout(ringTimer);
  set({ phase: "ended", ended: reason, local: null, localScreen: null, media: null, people: [], inviting: [], link: "closed", minimized: false });
  later(dismissCall, reason === "busy" || reason === "declined" ? 2600 : 1800);
  const where = home;
  if (!id || !where) return;
  const item = where.getItem<CallItem>(id);
  if (item && item.data.state !== "ended") void where.put(id, "call", { ...item.data, state: "ended" }).catch(() => undefined);
  if (caller && log && reason !== "busy" && reason !== "media") {
    const seconds = answeredAt ? Math.round((Date.now() - answeredAt) / 1000) : 0;
    const status: CallLog["status"] = reason === "declined" ? "declined" : answeredAt ? "ended" : "missed";
    void sendTo(where, null, { call: { video, status, seconds } });
  }
}

/* ------------------------------------------------------------------ signals from other people's chats */

type Incoming = { id?: string; action?: string; device?: string; from?: string; video?: boolean; room?: string | null; group?: boolean; name?: string };

function ring(from: Conversation, id: string, video: boolean, roomName: string | null | undefined, group: boolean, callerDevice?: string) {
  if (state.phase !== "idle" && state.phase !== "ended") {
    if (state.id !== id) void from.signal("call", { id, action: "busy", device, to: callerDevice ?? null });
    return;
  }
  if (!roomName) return;
  reset();
  home = from;
  pendingRoom = roomName;
  set({ phase: "incoming", id, video, caller: false, group, peer: { id: from.peer.id, name: from.peer.name, partner: from.isPartner } });
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
    const mine = state.id === message.id;
    switch (message.action) {
      case "ring":
        if (!mine) ring(from, message.id, Boolean(message.video), message.room, Boolean(message.group), message.device);
        else if (state.phase === "incoming") {
          window.clearTimeout(ringTimer);
          ringTimer = window.setTimeout(() => state.phase === "incoming" && finish("missed", false), 6000);
        }
        break;
      case "accept":
        // They come into the room; ringing them stops (the room shows them as soon as they join).
        if (mine) stopRinging(from.key);
        break;
      case "decline":
      case "busy":
        if (!mine || !ringing.has(from.key)) break;
        stopRinging(from.key, "declined");
        if (!hadCompany && !ringing.size && state.phase === "outgoing") finish(message.action === "busy" ? "busy" : "declined", true);
        break;
      case "end":
        // The caller gave up before anyone answered.
        if (mine && state.phase === "incoming") finish("missed", false);
        break;
    }
  };
  const onItem = (from: Conversation, row: Record<string, unknown>) => {
    const item = row as unknown as { id: string; author: string; data: CallItem };
    if (item.author !== myId() && item.data?.state === "ringing" && Date.now() - Date.parse(item.data.at) < RING_MS) ring(from, item.id, item.data.video, item.data.room, Boolean(item.data.group));
  };
  partnerSignal("call", onCall);
  contactSignal("call", onCall);
  // Opened from a "… is calling" notification: the call item is already there.
  partnerSignal("item:call", onItem);
  contactSignal("item:call", onItem);
}

/** A call that is still ringing for me (e.g. right after opening Bloom from the notification). */
export function checkRinging() {
  const me = myId();
  if (!me || state.phase !== "idle") return;
  const chats = [partnerConversation(), ...getContacts().list.map(contactConversation)].filter((item): item is Conversation => Boolean(item));
  for (const from of chats) {
    const ringingItem = from.getItems<CallItem>("call").find((item) => item.author !== me && item.data.state === "ringing" && Date.now() - Date.parse(item.data.at) < RING_MS);
    if (ringingItem) return ring(from, ringingItem.id, ringingItem.data.video, ringingItem.data.room, Boolean(ringingItem.data.group));
  }
}

/** Development only: join a room directly (no ringing), to test group calls in several tabs. */
if (import.meta.env.DEV)
  (window as unknown as { __bloomTestRoom?: (name: string, as: string) => Promise<void> }).__bloomTestRoom = async (name, as) => {
    reset();
    set({ phase: "outgoing", video: true, caller: false, id: "call:test", peer: { id: "", name: as, partner: false } });
    await startMedia(true);
    joinRoom(name);
  };

/** Development only: show a call screen in any state without a second device. */
if (import.meta.env.DEV) (window as unknown as { __bloomCallPreview?: (patch: Partial<CallState>) => void }).__bloomCallPreview = (patch) => set(patch);
