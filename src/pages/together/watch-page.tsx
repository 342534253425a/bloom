import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { setActivity, signal, useCouple, useItem, useSignal, type TurnData } from "@/entities/couple";
import { ChatThread } from "@/features/couple/chat-thread";
import { haptic } from "@/shared/lib/motion/fx";
import {
  ShareHost,
  ShareViewer,
  canShareScreen,
  canStreamFile,
  captureScreen,
  builtInRelay,
  captureVideoElement,
  iceServers,
  type LinkStats,
  type Quality,
  type RtcSignal,
} from "@/shared/lib/webrtc/share";
import { runNetworkCheck, type CheckResult } from "@/shared/lib/webrtc/check";
import { Glyph } from "@/shared/ui/glyph";
import { Art, toast } from "@/shared/ui/kit";

type Role = "idle" | "host-screen" | "host-file" | "viewer" | "sync";
type PlayState = { paused: boolean; time: number; duration: number; title: string | null };

const reactionEmoji = ["❤️", "😂", "😮", "😭", "🔥", "👏", "🥰", "💀"];

function fmt(seconds: number) {
  if (!Number.isFinite(seconds)) return "0:00";
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

export function WatchPage() {
  const { t } = useTranslation();
  const couple = useCouple();
  const turn = useItem<TurnData>("turn");
  const name = couple.partner?.name || "♥";
  const [role, setRole] = useState<Role>("idle");
  const [quality, setQuality] = useState<Quality>("normal");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [linkState, setLinkState] = useState<RTCPeerConnectionState | "idle">("idle");
  const [stats, setStats] = useState<LinkStats | null>(null);
  const [partnerLive, setPartnerLive] = useState<{ mode: string; title: string | null } | null>(null);
  const [play, setPlay] = useState<PlayState | null>(null);
  const [needsTap, setNeedsTap] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [noAudio, setNoAudio] = useState(false);
  const [connectedAt, setConnectedAt] = useState<number | null>(null);
  const [, setTick] = useState(0);
  const [syncFile, setSyncFile] = useState<string | null>(null);
  const hostRef = useRef<ShareHost | null>(null);
  const viewerRef = useRef<ShareViewer | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const syncRef = useRef<HTMLInputElement>(null);
  const applyingRemote = useRef(false);
  const servers = iceServers(turn?.data ?? null);
  const send = useCallback((payload: RtcSignal) => void signal("rtc", payload as unknown as Record<string, unknown>), []);
  const partnerHere = couple.presence.online && couple.presence.activity === "watch";

  useEffect(() => {
    setActivity("watch");
    void signal("watch-ping");
    const timer = window.setInterval(() => setTick((value) => value + 1), 1000);
    return () => {
      window.clearInterval(timer);
      hostRef.current?.stop();
      viewerRef.current?.close();
      void signal("watch", { state: "off" });
    };
  }, []);

  /* ---------- Shared signalling ---------- */

  useSignal("rtc", (payload) => {
    const message = payload as unknown as RtcSignal;
    if (hostRef.current) void hostRef.current.handle(message);
    else if (message.kind === "offer" || message.kind === "ice" || message.kind === "end") {
      if (!viewerRef.current) startViewer(false);
      void viewerRef.current?.handle(message);
    }
  });

  useSignal("watch", (payload) => {
    if (payload.state === "live") setPartnerLive({ mode: String(payload.mode), title: (payload.title as string | null) ?? null });
    else {
      setPartnerLive(null);
      if (role === "viewer") {
        viewerRef.current?.close();
        viewerRef.current = null;
        setStream(null);
        setRole("idle");
        setLinkState("idle");
      }
    }
  });

  useSignal("watch-ping", () => {
    if (role === "host-screen" || role === "host-file") void signal("watch", { state: "live", mode: role === "host-file" ? "file" : "screen", title: play?.title ?? null });
  });

  // Hosts keep announcing themselves so a partner who opens the room later sees it.
  useEffect(() => {
    if (role !== "host-screen" && role !== "host-file") return;
    const announce = () => void signal("watch", { state: "live", mode: role === "host-file" ? "file" : "screen", title: play?.title ?? null });
    announce();
    const timer = window.setInterval(announce, 4000);
    return () => window.clearInterval(timer);
  }, [role, play?.title]);

  // A partner who is already sharing: join automatically.
  useEffect(() => {
    if (partnerLive && role === "idle") startViewer(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partnerLive, role]);

  useEffect(() => {
    if (linkState === "connected" && !connectedAt) setConnectedAt(Date.now());
    if (linkState === "failed" || linkState === "closed") setConnectedAt(null);
  }, [linkState, connectedAt]);

  useEffect(() => {
    if (role === "idle" || role === "sync") return;
    const timer = window.setInterval(async () => {
      const source = hostRef.current ?? viewerRef.current;
      if (source) setStats(await source.stats());
    }, 2000);
    return () => window.clearInterval(timer);
  }, [role]);

  // The video element shows whatever stream we have.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || role === "host-file" || role === "sync") return;
    video.srcObject = stream;
    if (!stream) return;
    video.muted = role !== "viewer";
    video.play().catch(() => {
      // iPhone and some browsers block autoplay with sound: start muted and ask for a tap.
      video.muted = true;
      setNeedsTap(true);
      void video.play().catch(() => undefined);
    });
  }, [stream, role]);

  /* ---------- Viewer ---------- */

  function startViewer(auto: boolean) {
    viewerRef.current?.close();
    const viewer = new ShareViewer(send, servers, setStream, setLinkState);
    viewerRef.current = viewer;
    setRole("viewer");
    setLinkState("connecting");
    if (auto || !hostRef.current) viewer.join();
  }

  /* ---------- Host: screen ---------- */

  async function shareScreen() {
    try {
      const captured = await captureScreen(quality);
      setNoAudio(captured.getAudioTracks().length === 0);
      captured.getVideoTracks()[0]?.addEventListener("ended", () => stopHosting());
      const host = new ShareHost(send, servers, setLinkState);
      hostRef.current = host;
      setStream(captured);
      setRole("host-screen");
      setLinkState("connecting");
      await host.start(captured, quality);
      haptic(10);
    } catch {
      /* the person closed the picker */
    }
  }

  /* ---------- Host: file ---------- */

  function pickFile(file: File | undefined) {
    if (!file) return;
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = null;
    video.src = URL.createObjectURL(file);
    video.muted = false;
    setRole("host-file");
    setPlay({ paused: true, time: 0, duration: 0, title: file.name.replace(/\.[^.]+$/, "") });
    video.onloadedmetadata = async () => {
      await video.play().catch(() => undefined);
      const captured = captureVideoElement(video);
      if (!captured) {
        toast(t("couple.watch.noFileStream"), "c-frown");
        return;
      }
      setStream(captured);
      if (hostRef.current) await hostRef.current.replace(captured);
      else {
        const host = new ShareHost(send, servers, setLinkState);
        hostRef.current = host;
        setLinkState("connecting");
        await host.start(captured, quality);
      }
    };
  }

  // The file host reports play state; both people can control it.
  useEffect(() => {
    if (role !== "host-file") return;
    const video = videoRef.current;
    if (!video) return;
    const report = () => {
      const next = { paused: video.paused, time: video.currentTime, duration: video.duration || 0, title: play?.title ?? null };
      setPlay(next);
      void signal("playstate", next);
    };
    const events = ["play", "pause", "seeked", "loadedmetadata"];
    events.forEach((name) => video.addEventListener(name, report));
    const timer = window.setInterval(report, 1000);
    return () => {
      events.forEach((name) => video.removeEventListener(name, report));
      window.clearInterval(timer);
    };
  }, [role, play?.title]);

  useSignal("playstate", (payload) => {
    if (role === "viewer") setPlay(payload as unknown as PlayState);
  });

  useSignal("control", (payload) => {
    const video = videoRef.current;
    if (role !== "host-file" || !video) return;
    if (payload.action === "toggle") {
      if (video.paused) {
        void video.play();
        toast(t("couple.watch.resumedBy", { name }), "c-headphones");
      } else {
        video.pause();
        toast(t("couple.watch.pausedBy", { name }), "c-sit-calm");
      }
    }
    if (payload.action === "seek" && typeof payload.time === "number") video.currentTime = payload.time;
  });

  useSignal("askpause", () => {
    toast(t("couple.watch.askedPause", { name }), "c-sit-calm");
    haptic([20, 60, 20]);
  });

  function control(action: "toggle" | "seek", time?: number) {
    if (role === "host-file") {
      const video = videoRef.current;
      if (!video) return;
      if (action === "toggle") {
        if (video.paused) void video.play();
        else video.pause();
      } else if (time !== undefined) video.currentTime = time;
      return;
    }
    void signal("control", { action, time });
  }

  /* ---------- Both have the file ---------- */

  function pickSync(file: File | undefined) {
    if (!file) return;
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = null;
    video.src = URL.createObjectURL(file);
    video.muted = false;
    setSyncFile(file.name);
    setRole("sync");
  }

  useEffect(() => {
    if (role !== "sync") return;
    const video = videoRef.current;
    if (!video) return;
    const share = () => {
      if (applyingRemote.current) return;
      void signal("sync", { paused: video.paused, time: video.currentTime, rate: video.playbackRate });
    };
    const events = ["play", "pause", "seeked", "ratechange"];
    events.forEach((name) => video.addEventListener(name, share));
    const timer = window.setInterval(() => {
      if (!video.paused) void signal("sync", { paused: false, time: video.currentTime, rate: video.playbackRate, tick: true });
    }, 4000);
    return () => {
      events.forEach((name) => video.removeEventListener(name, share));
      window.clearInterval(timer);
    };
  }, [role]);

  useSignal("sync", (payload) => {
    const video = videoRef.current;
    if (role !== "sync" || !video) return;
    applyingRemote.current = true;
    const time = Number(payload.time) || 0;
    const drift = Math.abs(video.currentTime - time);
    if (!payload.tick || drift > 1.5) {
      if (drift > 0.6) video.currentTime = time;
    }
    if (payload.paused && !video.paused) {
      video.pause();
      toast(t("couple.watch.pausedBy", { name }), "c-sit-calm");
    }
    if (!payload.paused && video.paused) void video.play().catch(() => setNeedsTap(true));
    if (typeof payload.rate === "number") video.playbackRate = payload.rate;
    window.setTimeout(() => {
      applyingRemote.current = false;
    }, 400);
  });

  /* ---------- Common ---------- */

  function stopHosting() {
    hostRef.current?.stop();
    hostRef.current = null;
    stream?.getTracks().forEach((track) => track.stop());
    setStream(null);
    setRole("idle");
    setLinkState("idle");
    setPlay(null);
    setStats(null);
    void signal("watch", { state: "off" });
  }

  function leave() {
    if (role === "host-screen" || role === "host-file") stopHosting();
    viewerRef.current?.close();
    viewerRef.current = null;
    const video = videoRef.current;
    if (video) {
      video.pause();
      video.removeAttribute("src");
      video.srcObject = null;
    }
    setStream(null);
    setRole("idle");
    setLinkState("idle");
    setSyncFile(null);
  }

  useSignal("react", (payload) => floatEmoji(String(payload.emoji)));

  function floatEmoji(emoji: string) {
    const stage = stageRef.current;
    if (!stage) return;
    const node = document.createElement("span");
    node.className = "stage-react";
    node.textContent = emoji;
    node.style.left = `${10 + Math.random() * 80}%`;
    stage.appendChild(node);
    node.animate(
      [
        { transform: "translateY(0) scale(.6)", opacity: 0 },
        { transform: "translateY(-40px) scale(1.2)", opacity: 1, offset: 0.2 },
        { transform: `translate(${Math.random() * 60 - 30}px, -260px) scale(1)`, opacity: 0 },
      ],
      { duration: 2600, easing: "ease-out" },
    ).onfinish = () => node.remove();
  }

  function react(emoji: string) {
    floatEmoji(emoji);
    void signal("react", { emoji });
    haptic(5);
  }

  function fullscreen() {
    const stage = stageRef.current;
    const video = videoRef.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
    if (stage?.requestFullscreen) void stage.requestFullscreen().catch(() => video?.webkitEnterFullscreen?.());
    else video?.webkitEnterFullscreen?.();
  }

  const hosting = role === "host-screen" || role === "host-file";
  const showStage = role !== "idle";
  const live = linkState === "connected";
  const together = connectedAt ? fmt((Date.now() - connectedAt) / 1000) : null;

  if (!couple.partner) {
    return (
      <div className="page">
        <div className="empty-state">
          <Art name="c-pair-hearts" className="empty-art" />
          <strong className="heading">{t("couple.pair.title")}</strong>
          <Link to="/together" className="btn">
            {t("couple.pair.connect")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={`cinema ${chatOpen ? "has-chat" : ""}`}>
      <header className="cinema-bar">
        <Link to="/together" className="round-btn is-dark" aria-label={t("common.back")}>
          <Glyph name="back" size={20} stroke={2.4} />
        </Link>
        <div className="cinema-title">
          <strong>{t("couple.watch.title")}</strong>
          <small>
            <i className={`dot-live ${couple.presence.online ? "is-on" : ""}`} />
            {partnerHere ? t("couple.watch.partnerHere", { name }) : couple.presence.online ? `${name} · ${t("couple.presence.online")}` : `${name} · ${t("couple.presence.offline")}`}
          </small>
        </div>
        {together ? <span className="cinema-pill">💞 {t("couple.watch.together", { time: together })}</span> : null}
        <button type="button" className={`round-btn is-dark ${chatOpen ? "is-on" : ""}`} aria-label={t("couple.watch.chat")} onClick={() => setChatOpen(!chatOpen)}>
          <Glyph name="message" size={20} />
        </button>
      </header>

      <div className="cinema-main">
        <section className="cinema-stage-wrap">
          <div ref={stageRef} className={`cinema-stage ${showStage ? "is-on" : ""}`}>
            <video ref={videoRef} playsInline controls={role === "host-file" || role === "sync"} className="cinema-video" />
            {!showStage ? (
              <div className="cinema-empty">
                <Art name="c-headphones" className="float" />
                <p>{partnerHere ? t("couple.watch.partnerHere", { name }) : t("couple.watch.waitingPartner", { name })}</p>
              </div>
            ) : null}
            {role === "viewer" && !stream ? (
              <div className="cinema-empty">
                <div className="spinner is-dark" />
                <p>{t("couple.watch.connecting")}</p>
              </div>
            ) : null}
            {needsTap ? (
              <button
                type="button"
                className="tap-sound"
                onClick={() => {
                  const video = videoRef.current;
                  if (video) {
                    video.muted = false;
                    void video.play();
                  }
                  setNeedsTap(false);
                }}
              >
                {t("couple.watch.tapSound")}
              </button>
            ) : null}
          </div>

          {showStage ? (
            <div className="cinema-controls">
              <span className={`link-badge is-${linkState}`}>
                <i />
                {role === "sync"
                  ? t("couple.watch.syncOn", { name })
                  : live
                    ? hosting
                      ? t("couple.watch.youShare")
                      : t("couple.watch.youWatch")
                    : linkState === "failed"
                      ? t("couple.watch.reconnect")
                      : t("couple.watch.connecting")}
              </span>
              {stats && live && role !== "sync" ? (
                <span className="link-stats">
                  {t("couple.watch.stats", { kbps: stats.kbps ?? "–", rtt: stats.rtt ?? "–", res: stats.height ? `${stats.height}p` : "–" })}
                  {stats.relayed ? ` · ${t("couple.watch.relay")}` : ""}
                </span>
              ) : null}
              <span className="spacer" />
              {(role === "viewer" && play) || role === "host-file" ? (
                <>
                  <button type="button" className="cine-btn" onClick={() => control("seek", Math.max(0, (play?.time ?? 0) - 10))}>
                    −10
                  </button>
                  <button type="button" className="cine-btn is-main" onClick={() => control("toggle")}>
                    <Glyph name={play?.paused ? "play" : "pause"} size={20} stroke={2.6} />
                  </button>
                  <button type="button" className="cine-btn" onClick={() => control("seek", (play?.time ?? 0) + 10)}>
                    +10
                  </button>
                </>
              ) : null}
              {role === "viewer" && !play ? (
                <button type="button" className="cine-btn" onClick={() => void signal("askpause")}>
                  {t("couple.watch.askPause")}
                </button>
              ) : null}
              {role === "viewer" && (linkState === "failed" || linkState === "disconnected") ? (
                <button type="button" className="cine-btn" onClick={() => startViewer(true)}>
                  <Glyph name="reset" size={18} />
                  {t("couple.watch.reconnect")}
                </button>
              ) : null}
              {hosting ? (
                <select className="cine-select" value={quality} onChange={(event) => {
                  const next = event.target.value as Quality;
                  setQuality(next);
                  void hostRef.current?.setQuality(next);
                }}>
                  {(["saver", "normal", "high"] as Quality[]).map((item) => (
                    <option key={item} value={item}>
                      {t(`couple.watch.qualities.${item}`)}
                    </option>
                  ))}
                </select>
              ) : null}
              <button type="button" className="cine-btn" aria-label={t("couple.watch.fullscreen")} onClick={fullscreen}>
                <Glyph name="grid" size={18} />
              </button>
              <button type="button" className="cine-btn is-stop" onClick={leave}>
                {hosting ? t("couple.watch.stop") : t("couple.watch.leave")}
              </button>
            </div>
          ) : null}

          {(role === "viewer" && play) || role === "host-file" ? (
            <div className="cine-progress">
              <span>{fmt(play?.time ?? 0)}</span>
              <input
                type="range"
                min={0}
                max={Math.max(1, play?.duration ?? 1)}
                step={1}
                value={play?.time ?? 0}
                onChange={(event) => control("seek", Number(event.target.value))}
              />
              <span>{fmt(play?.duration ?? 0)}</span>
            </div>
          ) : null}

          {showStage ? (
            <div className="react-strip">
              {reactionEmoji.map((emoji) => (
                <button key={emoji} type="button" onClick={() => react(emoji)}>
                  {emoji}
                </button>
              ))}
            </div>
          ) : null}

          {noAudio && role === "host-screen" ? <p className="cine-warn">🔇 {t("couple.watch.noAudio")}</p> : null}
          {role === "viewer" && linkState === "failed" ? <p className="cine-warn">{t("couple.watch.failed")}</p> : null}
          {role === "sync" && syncFile ? <p className="cine-note">🎞 {syncFile}</p> : null}

          {role === "idle" ? (
            <div className="watch-modes">
              {partnerLive ? (
                <button type="button" className="watch-mode is-live" onClick={() => startViewer(true)}>
                  <span className="watch-mode-icon">📺</span>
                  <span>
                    <strong>{t("couple.watch.watchLive", { name })}</strong>
                    <small>{partnerLive.title ?? ""}</small>
                  </span>
                </button>
              ) : null}
              <h2 className="heading">{t("couple.watch.chooseTitle")}</h2>
              <button type="button" className="watch-mode" disabled={!canShareScreen()} onClick={() => void shareScreen()}>
                <span className="watch-mode-icon">🖥️</span>
                <span>
                  <strong>{t("couple.watch.screen")}</strong>
                  <small>{canShareScreen() ? t("couple.watch.screenBody") : t("couple.watch.desktopOnly")}</small>
                </span>
              </button>
              <button type="button" className="watch-mode" disabled={!canStreamFile()} onClick={() => fileRef.current?.click()}>
                <span className="watch-mode-icon">🎬</span>
                <span>
                  <strong>{t("couple.watch.file")}</strong>
                  <small>{canStreamFile() ? t("couple.watch.fileBody", { name }) : t("couple.watch.noFileStream")}</small>
                </span>
              </button>
              <button type="button" className="watch-mode" onClick={() => syncRef.current?.click()}>
                <span className="watch-mode-icon">🍿</span>
                <span>
                  <strong>{t("couple.watch.sync")}</strong>
                  <small>{t("couple.watch.syncBody")}</small>
                </span>
              </button>
              <p className="cine-note">💡 {t("couple.watch.audioTip")}</p>
              <p className="cine-note">🔒 {t("couple.watch.drm")}</p>
              <NetworkCheck turnUrls={builtInRelay ? [builtInRelay.urls].flat() : []} />
            </div>
          ) : null}
          <input ref={fileRef} type="file" accept="video/*,.mkv,.mp4,.webm,.mov" hidden onChange={(event) => pickFile(event.target.files?.[0])} />
          <input ref={syncRef} type="file" accept="video/*,.mkv,.mp4,.webm,.mov" hidden onChange={(event) => pickSync(event.target.files?.[0])} />
        </section>

        {chatOpen ? (
          <aside className="cinema-chat">
            <ChatThread compact />
          </aside>
        ) : null}
      </div>
    </div>
  );
}

function NetworkCheck({ turnUrls }: { turnUrls: string[] }) {
  const { t } = useTranslation();
  const [results, setResults] = useState<CheckResult[] | null>(null);
  const [busy, setBusy] = useState(false);
  const stunOk = results?.some((item) => item.id === "stun" && item.ok);
  return (
    <div className="relay netcheck">
      <button
        type="button"
        className="btn is-sm is-soft"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setResults(await runNetworkCheck(turnUrls));
          setBusy(false);
        }}
      >
        {busy ? <span className="spinner" aria-hidden="true" /> : "📡"} {t("couple.watch.check")}
      </button>
      {results ? (
        <ul className="netcheck-list">
          {results.map((item, index) => (
            <li key={`${item.id}-${index}`} className={item.ok ? "is-ok" : "is-bad"}>
              <span>{item.ok ? "✅" : item.id === "turn" ? "➖" : "❌"}</span>
              <span>
                {t(`couple.watch.checks.${item.id}`)}
                {item.note ? ` · ${item.note}` : ""}
                {item.ms ? ` · ${item.ms} ms` : ""}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {results ? <p className="cine-note">{results[0]?.ok && results[1]?.ok ? (stunOk ? t("couple.watch.checkGood") : t("couple.watch.checkNeedTurn")) : t("couple.watch.checkBlocked")}</p> : null}
    </div>
  );
}
