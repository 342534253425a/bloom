/**
 * A two-way audio/video call between the partners (like Telegram calls).
 * The caller always makes the offers, so the two sides never collide; the answerer only answers.
 * Three lanes are set up once: microphone, video (camera or screen) and the screen's sound,
 * so switching camera ↔ screen or muting never needs a new negotiation.
 */
import { readStats, type LinkStats } from "./share";

export type CallSignal = { kind: "offer"; sdp: string } | { kind: "answer"; sdp: string } | { kind: "ice"; candidate: RTCIceCandidateInit };

type Lane = "mic" | "video" | "screenAudio";
const lanes: Lane[] = ["mic", "video", "screenAudio"];

export type RemoteMedia = { video: MediaStream; audio: MediaStream[] };

export class CallLink {
  private pc: RTCPeerConnection;
  private pending: RTCIceCandidateInit[] = [];
  private tracks: Record<Lane, MediaStreamTrack | null> = { mic: null, video: null, screenAudio: null };
  private last = { bytes: 0, at: 0 };
  readonly remote: RemoteMedia = { video: new MediaStream(), audio: [] };

  constructor(
    private send: (signal: CallSignal) => void,
    servers: RTCIceServer[],
    private caller: boolean,
    private onRemote: (media: RemoteMedia) => void,
    private onState: (state: RTCPeerConnectionState) => void,
  ) {
    this.pc = new RTCPeerConnection({ iceServers: servers, bundlePolicy: "max-bundle" });
    this.pc.onicecandidate = (event) => {
      if (event.candidate) this.send({ kind: "ice", candidate: event.candidate.toJSON() });
    };
    this.pc.onconnectionstatechange = () => this.onState(this.pc.connectionState);
    this.pc.ontrack = (event) => {
      const lane = lanes[this.pc.getTransceivers().indexOf(event.transceiver)] ?? (event.track.kind === "video" ? "video" : "mic");
      if (lane === "video") {
        for (const old of this.remote.video.getVideoTracks()) this.remote.video.removeTrack(old);
        this.remote.video.addTrack(event.track);
      } else this.remote.audio = [...this.remote.audio.filter((stream) => stream.getAudioTracks()[0]?.id !== event.track.id), new MediaStream([event.track])];
      this.onRemote({ video: this.remote.video, audio: [...this.remote.audio] });
    };
    if (caller) for (const lane of lanes) this.pc.addTransceiver(lane === "video" ? "video" : "audio", { direction: "sendrecv" });
  }

  private transceiver(lane: Lane): RTCRtpTransceiver | undefined {
    return this.pc.getTransceivers()[lanes.indexOf(lane)];
  }

  /** Puts a track (or nothing) on a lane; works before and after connecting. */
  async setTrack(lane: Lane, track: MediaStreamTrack | null) {
    this.tracks[lane] = track;
    const sender = this.transceiver(lane)?.sender;
    if (sender) await sender.replaceTrack(track).catch(() => undefined);
    if (lane === "video" && sender && track) {
      const params = sender.getParameters();
      if (!params.encodings?.length) params.encodings = [{}];
      params.encodings[0]!.maxBitrate = track.contentHint === "detail" || track.contentHint === "text" ? 3_500_000 : 2_000_000;
      params.degradationPreference = track.contentHint === "detail" ? "maintain-resolution" : "balanced";
      await sender.setParameters(params).catch(() => undefined);
    }
  }

  /** Caller: (re)start the connection; `restart` asks for new network routes after a drop. */
  async offer(restart = false) {
    if (!this.caller) return;
    const offer = await this.pc.createOffer({ iceRestart: restart });
    await this.pc.setLocalDescription(offer);
    this.send({ kind: "offer", sdp: offer.sdp ?? "" });
  }

  async handle(signal: CallSignal) {
    if (signal.kind === "offer" && !this.caller) {
      await this.pc.setRemoteDescription({ type: "offer", sdp: signal.sdp });
      // The caller's lanes arrive with the offer: send our tracks back on the same ones.
      this.pc.getTransceivers().forEach((transceiver, index) => {
        transceiver.direction = "sendrecv";
        const lane = lanes[index];
        if (lane) void transceiver.sender.replaceTrack(this.tracks[lane]).catch(() => undefined);
      });
      await this.flush();
      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);
      this.send({ kind: "answer", sdp: answer.sdp ?? "" });
    } else if (signal.kind === "answer" && this.caller && this.pc.signalingState === "have-local-offer") {
      await this.pc.setRemoteDescription({ type: "answer", sdp: signal.sdp });
      await this.flush();
    } else if (signal.kind === "ice") {
      if (this.pc.remoteDescription) await this.pc.addIceCandidate(signal.candidate).catch(() => undefined);
      else this.pending.push(signal.candidate);
    }
  }

  private async flush() {
    for (const candidate of this.pending.splice(0)) await this.pc.addIceCandidate(candidate).catch(() => undefined);
  }

  get state(): RTCPeerConnectionState {
    return this.pc.connectionState;
  }

  stats(): Promise<LinkStats> {
    return readStats(this.pc, "inbound", this.last);
  }

  /**
   * Four emoji both sides see the same only when nobody sits in the middle of the call
   * (made from both ends' encryption fingerprints, like Telegram's key emoji).
   */
  async keyEmoji(): Promise<string[]> {
    const prints = [this.pc.localDescription?.sdp, this.pc.remoteDescription?.sdp].map((sdp) => /a=fingerprint:\S+ (\S+)/.exec(sdp ?? "")?.[1] ?? "");
    if (prints.some((print) => !print)) return [];
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(prints.sort().join("|"))));
    return Array.from(digest.slice(0, 4), (byte) => keyIcons[byte % keyIcons.length]!);
  }

  close() {
    this.pc.getSenders().forEach((sender) => sender.track?.stop());
    this.pc.close();
  }
}

const keyIcons = [..."🌸🌻🌷🍀🌿🍄🌵🌴🍓🍒🍑🍋🍉🍇🍐🥝🐱🐶🐰🦊🐼🐨🐸🐧🦋🐝🐞🐢🐬🐳🦄🐙⭐🌙☀️🌈❄️🔥💧🍩🍪🧁🍭🎈🎁🎀🎵🎨📚🔑🧸🪁⚽🚲🚀🏠⛵🗻🌍💎🧩🪴🍵🎐"].filter((char) => char.trim() && char !== "️");

/* ------------------------------------------------------------------ devices */

export type Devices = { mics: MediaDeviceInfo[]; cams: MediaDeviceInfo[]; speakers: MediaDeviceInfo[] };

export async function listDevices(): Promise<Devices> {
  const all = await navigator.mediaDevices.enumerateDevices().catch(() => [] as MediaDeviceInfo[]);
  return {
    mics: all.filter((device) => device.kind === "audioinput"),
    cams: all.filter((device) => device.kind === "videoinput"),
    speakers: all.filter((device) => device.kind === "audiooutput"),
  };
}

export async function openMic(deviceId?: string): Promise<MediaStreamTrack> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { deviceId: deviceId ? { exact: deviceId } : undefined, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  return stream.getAudioTracks()[0]!;
}

export async function openCamera(options: { deviceId?: string; facing?: "user" | "environment" } = {}): Promise<MediaStreamTrack> {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      deviceId: options.deviceId ? { exact: options.deviceId } : undefined,
      facingMode: options.deviceId ? undefined : (options.facing ?? "user"),
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 30 },
    },
  });
  const track = stream.getVideoTracks()[0]!;
  track.contentHint = "motion";
  return track;
}

/** The screen (and its sound where the system allows it) for sharing during a call. */
export async function openScreen(): Promise<{ video: MediaStreamTrack; audio: MediaStreamTrack | null }> {
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: { frameRate: { ideal: 30, max: 30 }, height: { ideal: 1080 } },
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    systemAudio: "include",
    selfBrowserSurface: "exclude",
  } as DisplayMediaStreamOptions);
  const video = stream.getVideoTracks()[0]!;
  video.contentHint = "detail";
  return { video, audio: stream.getAudioTracks()[0] ?? null };
}

export function canShareScreenInCall(): boolean {
  return typeof navigator !== "undefined" && Boolean(navigator.mediaDevices && "getDisplayMedia" in navigator.mediaDevices) && !/iPhone|iPad|Android/i.test(navigator.userAgent);
}
