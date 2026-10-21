import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  acceptCall,
  callStats,
  checkRinging,
  decline,
  dismissCall,
  flipCamera,
  hangUp,
  listenForCalls,
  setMinimized,
  startCall,
  toggleCamera,
  toggleMic,
  toggleScreen,
  useCall,
  switchDevice,
  type CallState,
} from "@/entities/call";
import { useCouple, useItems } from "@/entities/couple";
import { desktop, inFront, onNoteAction } from "@/shared/lib/native";
import { canShareScreenInCall, listDevices, type Devices } from "@/shared/lib/webrtc/call";
import { Art, toast } from "@/shared/ui/kit";
import { ScreenPicker } from "./screen-picker";
import { ringback, ringtone, stopTones } from "./tones";

/* ------------------------------------------------------------------ icons */

const icons = {
  mic: "M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Zm7 9a7 7 0 0 1-14 0M12 19v3",
  micOff: "M3 3l18 18M9 9v3a3 3 0 0 0 5.1 2.1M15 9.3V6a3 3 0 0 0-5.9-.8M19 12a7 7 0 0 1-1.2 3.9M5 12a7 7 0 0 0 11 5.7M12 19v3",
  cam: "M3 7h12v10H3zM15 10l6-3v10l-6-3",
  camOff: "M3 3l18 18M7 7H3v10h12v-2M15 10l6-3v10l-3-1.5M11 7h4v4",
  screen: "M3 4h18v12H3zM8 20h8M12 16v4",
  flip: "M4 8h11l-3-3M20 16H9l3 3",
  phone: "M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z",
  hang: "M3 15c4.8-4.6 13.2-4.6 18 0l-2.2 2.6-3.6-1.4V13.6a12 12 0 0 0-6.4 0v2.6l-3.6 1.4Z",
  video: "M3 7h12v10H3zM15 10l6-3v10l-6-3",
  min: "M6 12h12",
  full: "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5",
  gear: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1.3l2-1.6-2-3.4-2.4 1a7.6 7.6 0 0 0-2.2-1.3L14.4 3h-4l-.4 2.4a7.6 7.6 0 0 0-2.2 1.3l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.6l-2 1.6 2 3.4 2.4-1a7.6 7.6 0 0 0 2.2 1.3l.4 2.4h4l.4-2.4a7.6 7.6 0 0 0 2.2-1.3l2.4 1 2-3.4-2-1.6c.1-.4.1-.9.1-1.3Z",
};

function Icon({ d, size = 24 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

function CallButton({ icon, label, on = true, tone = "glass", onClick, big = false }: { icon: string; label: string; on?: boolean; tone?: "glass" | "end" | "accept"; onClick: () => void; big?: boolean }) {
  return (
    <button type="button" className={`call-btn is-${tone} ${on ? "" : "is-off"} ${big ? "is-big" : ""}`} onClick={onClick} aria-label={label} title={label}>
      <span>
        <Icon d={icon} size={big ? 30 : 24} />
      </span>
      <small>{label}</small>
    </button>
  );
}

/* ------------------------------------------------------------------ media elements */

function Video({ stream, mirror = false, className = "" }: { stream: MediaStream | null; mirror?: boolean; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = ref.current;
    if (video && video.srcObject !== stream) video.srcObject = stream;
  }, [stream, stream?.getTracks().length]);
  return <video ref={ref} className={`${className} ${mirror ? "is-mirror" : ""}`} autoPlay playsInline muted />;
}

/** Plays each of the partner's sound lanes (voice and shared-screen sound) on the chosen speaker. */
function RemoteAudio({ streams, sink }: { streams: MediaStream[]; sink: string }) {
  return (
    <>
      {streams.map((stream) => (
        <AudioOut key={stream.getAudioTracks()[0]?.id ?? stream.id} stream={stream} sink={sink} />
      ))}
    </>
  );
}

function AudioOut({ stream, sink }: { stream: MediaStream; sink: string }) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const audio = ref.current as (HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }) | null;
    if (!audio) return;
    audio.srcObject = stream;
    void audio.play().catch(() => undefined);
    if (sink && audio.setSinkId) void audio.setSinkId(sink).catch(() => undefined);
  }, [stream, sink]);
  return <audio ref={ref} autoPlay />;
}

function clock(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

function useTicker(on: boolean) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!on) return;
    const timer = window.setInterval(() => setTick((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [on]);
}

/* ------------------------------------------------------------------ host */

/** Every call screen: ringing, calling, talking (full or minimized) and "call ended". Mounted once in the app shell. */
export function CallHost() {
  const { t } = useTranslation();
  const call = useCall();
  const couple = useCouple();
  const items = useItems("call");
  const name = couple.partner?.name || "♥";
  const [sink, setSink] = useState("");

  useEffect(() => listenForCalls(), []);
  useEffect(() => {
    if (couple.partner) checkRinging();
  }, [items, couple.partner]);

  // Ringing sounds.
  useEffect(() => {
    if (call.phase === "incoming") ringtone();
    else if (call.phase === "outgoing") ringback();
    else stopTones();
    return stopTones;
  }, [call.phase]);

  // Windows app: native incoming-call window, taskbar buttons, no sleep during calls.
  useEffect(() => {
    if (!desktop?.callState) return;
    desktop.callState(
      call.phase === "idle"
        ? null
        : { phase: call.phase, name, video: call.video, mic: call.mic, cam: call.cam, screen: call.screen, front: inFront() },
    );
  }, [call.phase, call.mic, call.cam, call.screen, call.video, name]);
  useEffect(
    () =>
      onNoteAction((action) => {
        if (action === "call-accept-video") void acceptCall(true);
        if (action === "call-accept-audio") void acceptCall(false);
        if (action === "call-decline") decline();
        if (action === "call-end") hangUp();
        if (action === "call-mic") toggleMic();
        if (action === "call-cam") void toggleCamera();
        if (action === "call-expand") setMinimized(false);
      }),
    [],
  );

  // Leaving the window during a video call keeps the partner in a floating picture.
  useEffect(() => {
    const host = window as unknown as { __bloomCallPip?: () => void };
    host.__bloomCallPip = () => {
      const video = document.querySelector<HTMLVideoElement>(".call-remote video, .call-mini video");
      if (video && video.srcObject && !document.pictureInPictureElement) void video.requestPictureInPicture?.().catch(() => undefined);
    };
    const back = () => document.pictureInPictureElement && document.visibilityState === "visible" && void document.exitPictureInPicture().catch(() => undefined);
    window.addEventListener("focus", back);
    return () => {
      delete host.__bloomCallPip;
      window.removeEventListener("focus", back);
    };
  }, []);

  useEffect(() => {
    if (call.phase === "ended" && document.pictureInPictureElement) void document.exitPictureInPicture().catch(() => undefined);
  }, [call.phase]);

  if (call.phase === "idle") return <ScreenPicker />;

  return (
    <>
      <ScreenPicker />
      {call.media ? <RemoteAudio streams={call.media.audio} sink={sink} /> : null}
      {call.minimized && (call.phase === "active" || call.phase === "connecting" || call.phase === "outgoing") ? (
        <MiniCall call={call} name={name} />
      ) : (
        <CallScreen call={call} name={name} sink={sink} onSink={setSink} t={t} />
      )}
    </>
  );
}

type T = (key: string, options?: Record<string, unknown>) => string;

function CallScreen({ call, name, sink, onSink, t }: { call: CallState; name: string; sink: string; onSink: (id: string) => void; t: T }) {
  const [swapped, setSwapped] = useState(false);
  const [devicesOpen, setDevicesOpen] = useState(false);
  const [keyOpen, setKeyOpen] = useState(false);
  const [quality, setQuality] = useState<{ weak: boolean; relayed: boolean } | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  useTicker(call.phase === "active");

  const remoteHasVideo = Boolean(call.media && call.media.video.getVideoTracks().length && (call.remote.cam || call.remote.screen));
  const localHasVideo = call.cam || call.screen;
  const talking = call.phase === "active" || call.phase === "connecting";
  const mobile = /Android|iPhone|iPad/i.test(navigator.userAgent);

  const status =
    call.phase === "incoming"
      ? `${call.video ? t("call.video") : t("call.audio")} · ${t("call.ringing")}`
      : call.phase === "outgoing"
        ? t("call.calling")
        : call.phase === "connecting"
          ? t("call.connecting")
          : call.phase === "ended"
            ? t(`call.${call.ended === "hangup" ? "ended" : (call.ended ?? "ended")}`)
            : call.link === "disconnected" || call.link === "failed"
              ? t("call.reconnecting")
              : clock((Date.now() - (call.answeredAt ?? Date.now())) / 1000);

  return (
    <div className={`call-screen is-${call.phase} ${remoteHasVideo ? "has-video" : ""}`} role="dialog" aria-label={t("call.video")}>
      <div className="call-backdrop" />
      <div className="call-stage" ref={stage}>
        {remoteHasVideo && !swapped ? (
          <div className="call-remote" onDoubleClick={() => void stage.current?.requestFullscreen?.()}>
            <Video stream={call.media!.video} />
          </div>
        ) : localHasVideo && (swapped || call.phase === "outgoing") && call.local ? (
          <div className="call-remote">
            <Video stream={call.local} mirror={!call.screen} />
          </div>
        ) : (
          <div className="call-avatar">
            <span className={`call-pulse ${call.phase === "incoming" || call.phase === "outgoing" ? "is-ringing" : ""}`}>
              <Art name="c-two-wink" />
            </span>
          </div>
        )}

        <header className="call-top">
          <div>
            <strong>{name}</strong>
            <span>{status}</span>
            {call.phase === "active" && !call.remote.mic ? <em>🔇 {t("call.mutedThem", { name })}</em> : null}
            {call.remote.screen && talking ? <em>🖥 {t("call.theyShare", { name })}</em> : null}
            {quality?.weak && call.phase === "active" ? <em>📶 {t("call.weak")}</em> : null}
          </div>
          <div className="call-top-actions">
            {call.emoji.length ? (
              <button type="button" className="call-key" onClick={() => setKeyOpen(!keyOpen)} title={t("call.keyTitle")}>
                {call.emoji.join("")}
              </button>
            ) : null}
            {talking || call.phase === "outgoing" ? (
              <button type="button" className="call-mini-btn" aria-label={t("call.minimize")} title={t("call.minimize")} onClick={() => setMinimized(true)}>
                <Icon d={icons.min} size={20} />
              </button>
            ) : null}
            {remoteHasVideo ? (
              <button type="button" className="call-mini-btn" aria-label={t("call.fullscreen")} title={t("call.fullscreen")} onClick={() => void (document.fullscreenElement ? document.exitFullscreen() : stage.current?.requestFullscreen?.())}>
                <Icon d={icons.full} size={20} />
              </button>
            ) : null}
          </div>
        </header>
        {keyOpen ? (
          <div className="call-key-card" onClick={() => setKeyOpen(false)}>
            <b>{call.emoji.join(" ")}</b>
            <strong>{t("call.keyTitle")}</strong>
            <span>{t("call.keyBody", { name })}</span>
          </div>
        ) : null}

        {localHasVideo && call.local && talking && remoteHasVideo ? (
          <SelfView onSwap={() => setSwapped(!swapped)}>
            {swapped ? <Video stream={call.media!.video} /> : <Video stream={call.local} mirror={!call.screen} />}
          </SelfView>
        ) : null}
        {call.screen ? <p className="call-sharing">🖥 {t("call.sharing")}</p> : null}
        {call.phase === "active" ? <QualityProbe onQuality={setQuality} /> : null}
      </div>

      {call.phase === "incoming" ? (
        <div className="call-controls is-incoming">
          <CallButton icon={icons.hang} label={t("call.decline")} tone="end" big onClick={decline} />
          {call.video ? <CallButton icon={icons.phone} label={t("call.acceptAudio")} tone="glass" big onClick={() => void accept(false, t)} /> : null}
          <CallButton icon={call.video ? icons.video : icons.phone} label={call.video ? t("call.acceptVideo") : t("call.accept")} tone="accept" big onClick={() => void accept(call.video, t)} />
        </div>
      ) : call.phase === "ended" ? (
        <div className="call-controls">
          <button type="button" className="btn is-soft" onClick={dismissCall}>
            OK
          </button>
        </div>
      ) : (
        <div className="call-controls">
          {mobile && call.cam ? <CallButton icon={icons.flip} label={t("call.flip")} onClick={() => void flipCamera()} /> : null}
          <CallButton icon={call.cam ? icons.cam : icons.camOff} label={t("call.camera")} on={call.cam} onClick={() => void toggleCamera().then((ok) => !ok && toast(t("call.media"), "c-frown"))} />
          <CallButton icon={call.mic ? icons.mic : icons.micOff} label={t("call.mic")} on={call.mic} onClick={toggleMic} />
          {canShareScreenInCall() && talking ? <CallButton icon={icons.screen} label={t("call.screen")} on={!call.screen} onClick={() => void toggleScreen()} /> : null}
          {!mobile && talking ? <CallButton icon={icons.gear} label={t("call.devices")} onClick={() => setDevicesOpen(!devicesOpen)} /> : null}
          <CallButton icon={icons.hang} label={t("call.end")} tone="end" onClick={hangUp} />
        </div>
      )}
      {devicesOpen ? <DevicePicker sink={sink} onSink={onSink} onClose={() => setDevicesOpen(false)} t={t} /> : null}
    </div>
  );
}

async function accept(video: boolean, t: T) {
  const error = await acceptCall(video);
  if (error === "media") toast(t("call.media"), "c-frown");
}

/** Your own picture in a corner; drag it anywhere, tap to swap with the partner's. */
function SelfView({ children, onSwap }: { children: ReactNode; onSwap: () => void }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const drag = useRef<{ dx: number; dy: number; moved: boolean } | null>(null);
  const down = (event: ReactPointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    drag.current = { dx: event.clientX - box.left, dy: event.clientY - box.top, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const move = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    drag.current.moved = true;
    setPos({ x: event.clientX - drag.current.dx, y: event.clientY - drag.current.dy });
  };
  const up = () => {
    if (drag.current && !drag.current.moved) onSwap();
    drag.current = null;
  };
  return (
    <div className="call-self" style={pos ? { left: pos.x, top: pos.y, right: "auto", bottom: "auto" } : undefined} onPointerDown={down} onPointerMove={move} onPointerUp={up}>
      {children}
    </div>
  );
}

function QualityProbe({ onQuality }: { onQuality: (quality: { weak: boolean; relayed: boolean }) => void }) {
  useEffect(() => {
    const timer = window.setInterval(async () => {
      const stats = await callStats();
      if (stats) onQuality({ weak: (stats.rtt ?? 0) > 450, relayed: stats.relayed });
    }, 3000);
    return () => window.clearInterval(timer);
  }, [onQuality]);
  return null;
}

function DevicePicker({ sink, onSink, onClose, t }: { sink: string; onSink: (id: string) => void; onClose: () => void; t: T }) {
  const [devices, setDevices] = useState<Devices | null>(null);
  useEffect(() => void listDevices().then(setDevices), []);
  if (!devices) return null;
  const select = (label: string, list: MediaDeviceInfo[], onPick: (id: string) => void, current?: string) =>
    list.length ? (
      <label className="call-device">
        <span>{label}</span>
        <select defaultValue={current} onChange={(event) => onPick(event.target.value)}>
          {list.map((item, index) => (
            <option key={item.deviceId || index} value={item.deviceId}>
              {item.label || `${label} ${index + 1}`}
            </option>
          ))}
        </select>
      </label>
    ) : null;
  return (
    <div className="call-devices" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div className="call-devices-card">
        {select(t("call.mic"), devices.mics, (id) => void switchDevice("mic", id))}
        {select(t("call.camera"), devices.cams, (id) => void switchDevice("cam", id))}
        {select(t("call.speaker"), devices.speakers, onSink, sink)}
      </div>
    </div>
  );
}

/** The call keeps going in a small floating window while you use the rest of Bloom. */
function MiniCall({ call, name }: { call: CallState; name: string }) {
  const { t } = useTranslation();
  useTicker(call.phase === "active");
  const remoteHasVideo = Boolean(call.media && call.media.video.getVideoTracks().length && (call.remote.cam || call.remote.screen));
  return (
    <div className="call-mini" role="status">
      <button type="button" className="call-mini-body" onClick={() => setMinimized(false)} aria-label={t("call.expand")}>
        {remoteHasVideo ? <Video stream={call.media!.video} /> : <Art name="c-two-wink" />}
        <span>
          <strong>{name}</strong>
          <small>{call.phase === "active" ? clock((Date.now() - (call.answeredAt ?? Date.now())) / 1000) : t("call.calling")}</small>
        </span>
      </button>
      <button type="button" className={`call-mini-icon ${call.mic ? "" : "is-off"}`} onClick={toggleMic} aria-label={t("call.mic")}>
        <Icon d={call.mic ? icons.mic : icons.micOff} size={18} />
      </button>
      <button type="button" className="call-mini-icon is-end" onClick={hangUp} aria-label={t("call.end")}>
        <Icon d={icons.hang} size={18} />
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ start buttons */

/** The call buttons in the chat header. */
export function CallButtons() {
  const { t } = useTranslation();
  const start = async (video: boolean) => {
    const error = await startCall(video);
    if (error === "media") toast(t("call.media"), "c-frown");
    if (error === "not-paired") toast(t("call.notPaired"), "c-frown");
  };
  return (
    <>
      <button type="button" className="round-btn" aria-label={t("call.audio")} title={t("call.audio")} onClick={() => void start(false)}>
        <Icon d={icons.phone} size={20} />
      </button>
      <button type="button" className="round-btn" aria-label={t("call.video")} title={t("call.video")} onClick={() => void start(true)}>
        <Icon d={icons.video} size={20} />
      </button>
    </>
  );
}

