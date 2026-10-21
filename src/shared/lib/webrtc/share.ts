/**
 * One-way live video between the two partners: the host sends a stream (screen, tab or a local video file),
 * the viewer receives it. Signalling messages travel over the couple's realtime channel.
 */
import { captureAndroidScreen, canShareAndroidScreen } from "./android-screen";

export type RtcSignal =
  | { kind: "join" }
  | { kind: "offer"; sdp: string }
  | { kind: "answer"; sdp: string }
  | { kind: "ice"; candidate: RTCIceCandidateInit }
  | { kind: "end" };

export type Quality = "saver" | "normal" | "high";

export const qualities: Record<Quality, { maxBitrate: number; height: number; fps: number }> = {
  saver: { maxBitrate: 900_000, height: 480, fps: 24 },
  normal: { maxBitrate: 2_500_000, height: 720, fps: 30 },
  high: { maxBitrate: 6_000_000, height: 1080, fps: 30 },
};

/** STUN servers reachable from Russia and mainland China; TURN is added from the couple's settings. */
const stun: RTCIceServer[] = [
  { urls: ["stun:stun.cloudflare.com:3478"] },
  { urls: ["stun:stun.qq.com:3478"] },
  { urls: ["stun:stun.miwifi.com:3478"] },
  { urls: ["stun:stun.l.google.com:19302"] },
];

/**
 * Built-in relay (ExpressTURN, free plan): calls and the cinema connect even when Russia ↔ China blocks the direct route.
 * Comes from .env (VITE_TURN_*) at build time, so it stays out of the repository.
 */
export const builtInRelay: RTCIceServer | null = import.meta.env.VITE_TURN_URLS
  ? {
      urls: String(import.meta.env.VITE_TURN_URLS)
        .split(/[\s,]+/)
        .filter(Boolean),
      username: import.meta.env.VITE_TURN_USERNAME,
      credential: import.meta.env.VITE_TURN_CREDENTIAL,
    }
  : null;

export function iceServers(turn?: { urls: string; username: string; credential: string } | null): RTCIceServer[] {
  const list = [...stun, ...(builtInRelay ? [builtInRelay] : [])];
  if (turn?.urls.trim()) {
    list.push({
      urls: turn.urls
        .split(/[\s,]+/)
        .map((url) => url.trim())
        .filter(Boolean),
      username: turn.username,
      credential: turn.credential,
    });
  }
  return list;
}

export type LinkStats = { state: RTCPeerConnectionState | "idle"; rtt: number | null; kbps: number | null; width: number | null; height: number | null; fps: number | null; relayed: boolean };

const emptyStats: LinkStats = { state: "idle", rtt: null, kbps: null, width: null, height: null, fps: null, relayed: false };

export async function readStats(pc: RTCPeerConnection, direction: "outbound" | "inbound", last: { bytes: number; at: number }): Promise<LinkStats> {
  const report = await pc.getStats();
  let rtt: number | null = null;
  let kbps: number | null = null;
  let width: number | null = null;
  let height: number | null = null;
  let fps: number | null = null;
  let relayed = false;
  const candidates = new Map<string, RTCStats & { candidateType?: string }>();
  report.forEach((entry) => {
    if (entry.type === "local-candidate" || entry.type === "remote-candidate") candidates.set(entry.id, entry as RTCStats & { candidateType?: string });
  });
  report.forEach((entry) => {
    const stat = entry as RTCStats & Record<string, unknown>;
    if (stat.type === "candidate-pair" && (stat.nominated || stat.selected) && stat.state === "succeeded") {
      rtt = typeof stat.currentRoundTripTime === "number" ? Math.round(stat.currentRoundTripTime * 1000) : rtt;
      const local = candidates.get(String(stat.localCandidateId));
      const remote = candidates.get(String(stat.remoteCandidateId));
      relayed = local?.candidateType === "relay" || remote?.candidateType === "relay";
    }
    if (stat.type === `${direction}-rtp` && stat.kind === "video") {
      const bytes = Number(direction === "outbound" ? stat.bytesSent : stat.bytesReceived) || 0;
      const now = stat.timestamp;
      if (last.at && now > last.at) kbps = Math.round(((bytes - last.bytes) * 8) / (now - last.at));
      last.bytes = bytes;
      last.at = now;
      width = typeof stat.frameWidth === "number" ? stat.frameWidth : width;
      height = typeof stat.frameHeight === "number" ? stat.frameHeight : height;
      fps = typeof stat.framesPerSecond === "number" ? Math.round(stat.framesPerSecond) : fps;
    }
  });
  return { state: pc.connectionState, rtt, kbps, width, height, fps, relayed };
}

type Send = (signal: RtcSignal) => void;

/** Ask Chrome-based browsers to start near the target bitrate instead of ramping up from ~300 kbps. */
export function withStartBitrate(sdp: string, kbps: number): string {
  const lines = sdp.split("\r\n");
  const videoPts = new Set<string>();
  let inVideo = false;
  for (const line of lines) {
    if (line.startsWith("m=")) inVideo = line.startsWith("m=video");
    const match = inVideo ? /^a=rtpmap:(\d+) (VP8|VP9|H264|AV1)/i.exec(line) : null;
    if (match) videoPts.add(match[1]!);
  }
  const extra = `x-google-start-bitrate=${kbps};x-google-min-bitrate=${Math.round(kbps / 3)};x-google-max-bitrate=${Math.round(kbps * 1.6)}`;
  const seen = new Set<string>();
  const out = lines.map((line) => {
    const match = /^a=fmtp:(\d+) (.*)$/.exec(line);
    if (match && videoPts.has(match[1]!) && !line.includes("x-google-start-bitrate")) {
      seen.add(match[1]!);
      return `${line};${extra}`;
    }
    return line;
  });
  // Codecs without an fmtp line get one right after their rtpmap.
  const result: string[] = [];
  for (const line of out) {
    result.push(line);
    const match = /^a=rtpmap:(\d+) /.exec(line);
    if (match && videoPts.has(match[1]!) && !seen.has(match[1]!)) result.push(`a=fmtp:${match[1]} ${extra}`);
  }
  return result.join("\r\n");
}

export class ShareHost {
  private pc: RTCPeerConnection | null = null;
  private stream: MediaStream | null = null;
  private quality: Quality = "normal";
  private last = { bytes: 0, at: 0 };

  constructor(
    private send: Send,
    private servers: RTCIceServer[],
    private onState: (state: RTCPeerConnectionState) => void,
  ) {}

  async start(stream: MediaStream, quality: Quality) {
    this.stream = stream;
    this.quality = quality;
    for (const track of stream.getVideoTracks()) {
      try {
        track.contentHint = "motion";
      } catch {
        /* older browsers */
      }
    }
    await this.offer();
  }

  /** The viewer asked to (re)connect: build a fresh connection and send an offer. */
  async offer() {
    if (!this.stream) return;
    this.pc?.close();
    const pc = new RTCPeerConnection({ iceServers: this.servers, bundlePolicy: "max-bundle" });
    this.pc = pc;
    this.last = { bytes: 0, at: 0 };
    pc.onicecandidate = (event) => {
      if (event.candidate) this.send({ kind: "ice", candidate: event.candidate.toJSON() });
    };
    pc.onconnectionstatechange = () => this.onState(pc.connectionState);
    for (const track of this.stream.getTracks()) pc.addTrack(track, this.stream);
    await this.applyQuality();
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    this.send({ kind: "offer", sdp: offer.sdp ?? "" });
  }

  async handle(signal: RtcSignal) {
    if (signal.kind === "join") await this.offer();
    else if (signal.kind === "answer" && this.pc && this.pc.signalingState === "have-local-offer") {
      const kbps = Math.round((qualities[this.quality].maxBitrate / 1000) * 0.7);
      await this.pc.setRemoteDescription({ type: "answer", sdp: withStartBitrate(signal.sdp, kbps) });
    }
    else if (signal.kind === "ice" && this.pc) await this.pc.addIceCandidate(signal.candidate).catch(() => undefined);
  }

  async setQuality(quality: Quality) {
    this.quality = quality;
    await this.applyQuality();
  }

  private async applyQuality() {
    const preset = qualities[this.quality];
    const sender = this.pc?.getSenders().find((item) => item.track?.kind === "video");
    const track = sender?.track;
    if (!sender || !track) return;
    const settings = track.getSettings();
    const scale = settings.height && settings.height > preset.height ? settings.height / preset.height : 1;
    const params = sender.getParameters();
    if (!params.encodings || params.encodings.length === 0) params.encodings = [{}];
    params.encodings[0]!.maxBitrate = preset.maxBitrate;
    params.encodings[0]!.maxFramerate = preset.fps;
    params.encodings[0]!.scaleResolutionDownBy = scale;
    params.degradationPreference = "balanced";
    await sender.setParameters(params).catch(() => undefined);
  }

  /** Swap the source (e.g. a new file) without reconnecting. */
  async replace(stream: MediaStream) {
    this.stream = stream;
    const senders = this.pc?.getSenders() ?? [];
    for (const track of stream.getTracks()) {
      const sender = senders.find((item) => item.track?.kind === track.kind);
      if (sender) await sender.replaceTrack(track);
      else if (this.pc) {
        this.pc.addTrack(track, stream);
      }
    }
    if (this.pc && senders.length < stream.getTracks().length) await this.offer();
  }

  stats(): Promise<LinkStats> {
    return this.pc ? readStats(this.pc, "outbound", this.last) : Promise.resolve(emptyStats);
  }

  stop() {
    this.send({ kind: "end" });
    this.pc?.close();
    this.pc = null;
    this.stream = null;
  }
}

export class ShareViewer {
  private pc: RTCPeerConnection | null = null;
  private pending: RTCIceCandidateInit[] = [];
  private last = { bytes: 0, at: 0 };

  constructor(
    private send: Send,
    private servers: RTCIceServer[],
    private onStream: (stream: MediaStream | null) => void,
    private onState: (state: RTCPeerConnectionState) => void,
  ) {}

  join() {
    this.send({ kind: "join" });
  }

  async handle(signal: RtcSignal) {
    if (signal.kind === "offer") {
      this.pc?.close();
      const pc = new RTCPeerConnection({ iceServers: this.servers, bundlePolicy: "max-bundle" });
      this.pc = pc;
      this.last = { bytes: 0, at: 0 };
      const stream = new MediaStream();
      pc.ontrack = (event) => {
        stream.addTrack(event.track);
        this.onStream(stream);
      };
      pc.onicecandidate = (event) => {
        if (event.candidate) this.send({ kind: "ice", candidate: event.candidate.toJSON() });
      };
      pc.onconnectionstatechange = () => this.onState(pc.connectionState);
      await pc.setRemoteDescription({ type: "offer", sdp: signal.sdp });
      for (const candidate of this.pending.splice(0)) await pc.addIceCandidate(candidate).catch(() => undefined);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      this.send({ kind: "answer", sdp: answer.sdp ?? "" });
    } else if (signal.kind === "ice") {
      if (this.pc?.remoteDescription) await this.pc.addIceCandidate(signal.candidate).catch(() => undefined);
      else this.pending.push(signal.candidate);
    } else if (signal.kind === "end") {
      this.close();
      this.onStream(null);
    }
  }

  stats(): Promise<LinkStats> {
    return this.pc ? readStats(this.pc, "inbound", this.last) : Promise.resolve(emptyStats);
  }

  close() {
    this.pc?.close();
    this.pc = null;
    this.pending = [];
  }
}

/** Ask the browser for a screen, window or tab, with sound where the browser allows it. */
export async function captureScreen(quality: Quality): Promise<MediaStream> {
  if (canShareAndroidScreen()) return captureAndroidScreen();
  const preset = qualities[quality];
  const options = {
    video: { frameRate: { ideal: preset.fps, max: 30 }, height: { ideal: Math.max(preset.height, 720) } },
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    systemAudio: "include",
    selfBrowserSurface: "exclude",
    surfaceSwitching: "include",
    preferCurrentTab: false,
  } as DisplayMediaStreamOptions;
  return navigator.mediaDevices.getDisplayMedia(options);
}

export function canShareScreen(): boolean {
  if (canShareAndroidScreen()) return true;
  return typeof navigator !== "undefined" && Boolean(navigator.mediaDevices && "getDisplayMedia" in navigator.mediaDevices) && !/iPhone|iPad|Android/i.test(navigator.userAgent);
}

/** A live stream of a <video> element playing a local file (Chrome, Edge, Yandex, Firefox). */
export function captureVideoElement(video: HTMLVideoElement): MediaStream | null {
  const element = video as HTMLVideoElement & { captureStream?: () => MediaStream; mozCaptureStream?: () => MediaStream };
  if (element.captureStream) return element.captureStream();
  if (element.mozCaptureStream) return element.mozCaptureStream();
  return null;
}

export function canStreamFile(): boolean {
  const proto = HTMLMediaElement.prototype as HTMLMediaElement & { captureStream?: unknown; mozCaptureStream?: unknown };
  return Boolean(proto.captureStream || proto.mozCaptureStream) && !/iPhone|iPad/i.test(navigator.userAgent);
}
