import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { inFront } from "@/shared/lib/native";
import {
  deleteMessage,
  editMessage,
  getCouple,
  markRead,
  messageOrder,
  myId,
  sendMessage,
  signal,
  toggleReaction,
  togglePin,
  useCouple,
  useItem,
  useItems,
  useSignal,
  type CoupleItem,
  type MessageData,
} from "@/entities/couple";
import { localeOf } from "@/shared/i18n";
import { compressImage, fileUrl, uploadCoupleFile } from "@/shared/lib/media";
import { haptic, pop } from "@/shared/lib/motion/fx";
import { Glyph } from "@/shared/ui/glyph";
import { Art, toast } from "@/shared/ui/kit";
import { RecordButton, VoicePlayer } from "./voice";
import { startCall } from "@/entities/call";

export const stickers = [
  "c-wave", "c-hug-heart", "c-arms-up", "c-two-wink", "c-pair-hearts", "c-lying-heart", "c-hug-big-heart", "c-hug-star",
  "c-sleep-cloud", "c-sad-grass", "c-frown", "c-flower-arms", "c-mug", "c-read-cup", "c-laptop", "c-headphones",
  "c-watering", "c-gift", "c-grass-laugh", "c-peek-right",
];

const reactions = ["❤️", "😂", "😮", "🥺", "👍", "🔥", "🥰", "🙏"];
type Msg = CoupleItem<MessageData>;

function dayLabel(iso: string) {
  return new Intl.DateTimeFormat(localeOf(), { weekday: "long", day: "numeric", month: "long" }).format(new Date(iso));
}

function timeLabel(iso: string) {
  return new Intl.DateTimeFormat(localeOf(), { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

/** "Outgoing video call · 5:12", "Missed call"… seen from this person's side. */
export function callLabel(t: (key: string) => string, call: NonNullable<MessageData["call"]>, mine: boolean): string {
  if (call.status === "declined") return t("call.log.declined");
  if (call.status === "missed") return mine ? t("call.log.cancelled") : t("call.log.missed");
  return t(`call.log.${mine ? "outgoing" : "incoming"}${call.video ? "Video" : ""}`);
}

function preview(t: (key: string) => string, message: Msg | undefined): string {
  if (!message) return t("couple.chat.deleted");
  if (message.data.call) return `📞 ${callLabel(t, message.data.call, message.author === myId())}`;
  if (message.data.voice) return `🎤 ${t("couple.chat.voice")}`;
  if (message.data.photo) return `📷 ${t("couple.chat.photo")}`;
  if (message.data.sticker) return `🌸 ${t("couple.chat.sticker")}`;
  return (message.data.text ?? "").slice(0, 90);
}

function draftKey() {
  return `bloom.draft.${getCouple().me?.couple_key ?? ""}`;
}

/** The couple's conversation with the Telegram essentials. `compact` is used inside the cinema room. */
export function ChatThread({ compact = false, searchOpen = false, onSearchClose }: { compact?: boolean; searchOpen?: boolean; onSearchClose?: () => void }) {
  const { t } = useTranslation();
  const couple = useCouple();
  const all = useItems<MessageData>("msg");
  const partnerRead = useItem<{ seen?: string }>(`read:${couple.partner?.id ?? ""}`);
  const myRead = useItem<{ seen?: string }>(`read:${couple.me?.id ?? ""}`);
  const [text, setText] = useState(() => localStorage.getItem(draftKey()) ?? "");
  const [stickerOpen, setStickerOpen] = useState(false);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [typing, setTyping] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const [flash, setFlash] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [viewer, setViewer] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const typingTimer = useRef(0);
  const lastTypingSent = useRef(0);
  const unreadFrom = useRef<string | null | undefined>(undefined);
  const me = couple.me?.id;
  const name = couple.partner?.name || "♥";

  const messages = useMemo(() => [...all].sort(messageOrder), [all]);
  const byId = useMemo(() => new Map(messages.map((message) => [message.id, message])), [messages]);
  const lastMine = [...messages].reverse().find((message) => message.author === me);
  const lastPartner = [...messages].reverse().find((message) => message.author !== me);
  const pinned = [...messages].filter((message) => message.data.pinned).sort((a, b) => (b.data.pinned ?? "").localeCompare(a.data.pinned ?? ""))[0];
  const unreadBelow = messages.filter((message) => message.author !== me && message.created_at > (myRead?.data.seen ?? "")).length;

  // Remember where the unread messages started when the chat opened, for the "new messages" divider.
  if (unreadFrom.current === undefined && couple.me && all.length) {
    const seen = myRead?.data.seen ?? "";
    unreadFrom.current = messages.find((message) => message.author !== me && message.created_at > seen)?.id ?? null;
  }

  useSignal("typing", (payload) => {
    setTyping(Boolean(payload.typing));
    window.clearTimeout(typingTimer.current);
    if (payload.typing) typingTimer.current = window.setTimeout(() => setTyping(false), 4000);
  });

  // Keep the draft between visits.
  useEffect(() => {
    if (editing) return;
    const timer = window.setTimeout(() => {
      if (text) localStorage.setItem(draftKey(), text);
      else localStorage.removeItem(draftKey());
    }, 300);
    return () => window.clearTimeout(timer);
  }, [text, editing]);

  // Stick to the bottom when new messages arrive, unless the person scrolled up to read.
  useLayoutEffect(() => {
    const node = list.current;
    if (!node) return;
    if (atBottom || lastMine?.id === messages.at(-1)?.id) node.scrollTo({ top: node.scrollHeight });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length, typing]);

  useEffect(() => {
    const node = list.current;
    if (!node) return;
    // In the cinema the chat behaves like a stream chat: always open on the newest messages.
    if (unreadFrom.current && !compact) document.getElementById(`m-${unreadFrom.current}`)?.scrollIntoView({ block: "center" });
    else node.scrollTo({ top: node.scrollHeight });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When the chat box changes size (keyboard opens, video resizes) stay pinned to the newest message.
  const stickRef = useRef(true);
  stickRef.current = atBottom;
  useEffect(() => {
    const node = list.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (stickRef.current) node.scrollTo({ top: node.scrollHeight });
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // Read only when the person is really looking: on Windows a Bloom window behind others doesn't count.
  // Coming back to the window reads what arrived meanwhile.
  useEffect(() => {
    if (!lastPartner || !atBottom) return;
    const read = () => inFront() && void markRead(lastPartner.created_at);
    read();
    window.addEventListener("focus", read);
    document.addEventListener("visibilitychange", read);
    return () => {
      window.removeEventListener("focus", read);
      document.removeEventListener("visibilitychange", read);
    };
  }, [lastPartner, atBottom]);

  function onScroll() {
    const node = list.current;
    if (!node) return;
    setAtBottom(node.scrollHeight - node.scrollTop - node.clientHeight < 80);
    setMenu(null);
  }

  function jumpTo(id: string) {
    const node = document.getElementById(`m-${id}`);
    if (!node) return;
    node.scrollIntoView({ behavior: "smooth", block: "center" });
    setFlash(id);
    window.setTimeout(() => setFlash(null), 1600);
  }

  function startEdit(message: Msg) {
    setEditing(message.id);
    setReplyTo(null);
    setText(message.data.text ?? "");
    window.setTimeout(() => input.current?.focus(), 30);
  }

  async function send(extra: Partial<Pick<MessageData, "sticker" | "voice" | "photo">> = {}) {
    if (editing) {
      if (text.trim()) await editMessage(editing, text);
      setEditing(null);
      setText(localStorage.getItem(draftKey()) ?? "");
      return;
    }
    const body = extra.sticker || extra.voice || extra.photo ? null : text;
    if (!body?.trim() && !extra.sticker && !extra.voice && !extra.photo) return;
    if (!extra.sticker && !extra.voice && !extra.photo) setText("");
    setStickerOpen(false);
    const reply = replyTo;
    setReplyTo(null);
    haptic(6);
    setAtBottom(true);
    await sendMessage(body, { ...extra, replyTo: reply });
  }

  async function sendPhoto(file: File | undefined) {
    const key = couple.me?.couple_key;
    if (!file || !key) return;
    setUploading(true);
    try {
      const image = await compressImage(file);
      const path = await uploadCoupleFile(key, "photos", image.blob);
      await send({ photo: { path, width: image.width, height: image.height } });
    } catch {
      toast(t("couple.chat.uploadFailed"), "c-frown");
    } finally {
      setUploading(false);
    }
  }

  function openMenu(id: string, x: number, y: number) {
    haptic(10);
    const box = list.current?.getBoundingClientRect();
    setMenu({ id, x: x - (box?.left ?? 0), y: y - (box?.top ?? 0) + (list.current?.scrollTop ?? 0) });
  }

  const filtered = query.trim() ? messages.filter((message) => (message.data.text ?? "").toLowerCase().includes(query.trim().toLowerCase())) : [];
  const menuMessage = menu ? byId.get(menu.id) : undefined;
  let lastDay = "";

  return (
    <div className={`chat ${compact ? "is-compact" : ""}`}>
      {pinned ? (
        <button type="button" className="chat-pinned" onClick={() => jumpTo(pinned.id)}>
          <Glyph name="pin" size={16} />
          <span>
            <b>{t("couple.chat.pinned")}</b>
            <small>{preview(t, pinned)}</small>
          </span>
          <span
            role="button"
            tabIndex={0}
            className="chat-pinned-x"
            aria-label={t("couple.chat.unpin")}
            onClick={(event) => {
              event.stopPropagation();
              void togglePin(pinned.id);
            }}
          >
            <Glyph name="close" size={14} stroke={2.6} />
          </span>
        </button>
      ) : null}

      {searchOpen ? (
        <div className="chat-search">
          <span className="input">
            <Glyph name="search" size={18} />
            <input autoFocus value={query} placeholder={t("couple.chat.searchPlaceholder")} onChange={(event) => setQuery(event.target.value)} />
          </span>
          <button type="button" className="icon-btn" aria-label={t("common.close")} onClick={() => { setQuery(""); onSearchClose?.(); }}>
            <Glyph name="close" size={18} />
          </button>
          {query.trim() ? (
            <div className="chat-results">
              {filtered.length === 0 ? <p className="tiny">{t("couple.chat.noResults")}</p> : null}
              {filtered.slice(-30).reverse().map((message) => (
                <button key={message.id} type="button" onClick={() => jumpTo(message.id)}>
                  <small>
                    {message.author === me ? t("couple.you") : name} · {dayLabel(message.created_at)}
                  </small>
                  <span>{message.data.text}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="chat-list" ref={list} onScroll={onScroll} onClick={() => setMenu(null)}>
        {messages.length === 0 ? (
          <div className="chat-empty">
            <Art name="c-pair-hearts" />
            <p className="sub">{t("couple.chat.empty")}</p>
          </div>
        ) : null}
        {messages.map((message) => {
          const mine = message.author === me;
          const day = dayLabel(message.created_at);
          const showDay = day !== lastDay;
          lastDay = day;
          const quoted = message.data.replyTo ? byId.get(message.data.replyTo) : undefined;
          const reacted = Object.values(message.data.reactions ?? {});
          const grouped = [...new Set(reacted)].map((emoji) => ({ emoji, count: reacted.filter((item) => item === emoji).length }));
          const media = message.data.sticker ? "is-sticker" : message.data.photo ? "is-photo" : "";
          return (
            <div key={message.id}>
              {showDay ? <p className="chat-day">{day}</p> : null}
              {message.id === unreadFrom.current ? <p className="chat-unread">{t("couple.chat.newMessages")}</p> : null}
              <Bubble
                id={message.id}
                mine={mine}
                flash={flash === message.id}
                onReply={() => {
                  setReplyTo(message.id);
                  setEditing(null);
                  input.current?.focus();
                }}
                onMenu={(x, y) => openMenu(message.id, x, y)}
              >
                <div className={`chat-bubble ${mine ? "is-mine" : ""} ${media}`}>
                  {quoted || message.data.replyTo ? (
                    <button type="button" className="chat-quote" onClick={(event) => { event.stopPropagation(); if (quoted) jumpTo(quoted.id); }}>
                      <b>{quoted ? (quoted.author === me ? t("couple.you") : name) : "…"}</b>
                      <span>{preview(t, quoted)}</span>
                    </button>
                  ) : null}
                  {message.data.call ? <CallRecord call={message.data.call} mine={mine} /> : null}
                  {message.data.sticker ? <Art name={message.data.sticker} /> : null}
                  {message.data.photo ? <Photo path={message.data.photo.path} ratio={message.data.photo.width / message.data.photo.height} onOpen={setViewer} /> : null}
                  {message.data.voice ? <VoicePlayer path={message.data.voice.path} duration={message.data.voice.duration} tone={mine ? "dark" : "light"} /> : null}
                  {message.data.text ? <span className="chat-text">{message.data.text}</span> : null}
                  <small className="chat-meta">
                    {message.data.pinned ? "📌 " : ""}
                    {message.data.edited ? `${t("couple.chat.edited")} · ` : ""}
                    {timeLabel(message.created_at)}
                    {mine ? (partnerRead?.data.seen && partnerRead.data.seen >= message.created_at ? " ✓✓" : " ✓") : ""}
                  </small>
                </div>
                {grouped.length ? (
                  <span className="chat-reacts">
                    {grouped.map((item) => (
                      <button key={item.emoji} type="button" onClick={(event) => { event.stopPropagation(); void toggleReaction(message.id, item.emoji); }}>
                        {item.emoji}
                        {item.count > 1 ? <small>{item.count}</small> : null}
                      </button>
                    ))}
                  </span>
                ) : null}
              </Bubble>
            </div>
          );
        })}
        {typing ? (
          <div className="bubble-row">
            <span className="chat-typing">
              <i />
              <i />
              <i />
              <small>{t("couple.chat.typing", { name })}</small>
            </span>
          </div>
        ) : null}

        {menu && menuMessage ? (
          <div className="chat-menu" style={{ top: menu.y, left: Math.max(8, Math.min(menu.x - 120, (list.current?.clientWidth ?? 300) - 250)) }} onClick={(event) => event.stopPropagation()}>
            <div className="chat-menu-reacts">
              {reactions.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  className={menuMessage.data.reactions?.[me ?? ""] === emoji ? "is-on" : ""}
                  onClick={(event) => {
                    pop(event.currentTarget, 1.3);
                    void toggleReaction(menuMessage.id, emoji);
                    setMenu(null);
                  }}
                >
                  {emoji}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => { setReplyTo(menuMessage.id); setEditing(null); setMenu(null); input.current?.focus(); }}>
              <Glyph name="reply" size={18} /> {t("couple.chat.reply")}
            </button>
            {menuMessage.data.text ? (
              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(menuMessage.data.text ?? "").catch(() => undefined);
                  toast(t("common.copied"), "c-hug-heart");
                  setMenu(null);
                }}
              >
                <Glyph name="copy" size={18} /> {t("couple.chat.copy")}
              </button>
            ) : null}
            {menuMessage.author === me && menuMessage.data.text ? (
              <button type="button" onClick={() => { startEdit(menuMessage); setMenu(null); }}>
                <Glyph name="edit" size={18} /> {t("couple.chat.edit")}
              </button>
            ) : null}
            <button type="button" onClick={() => { void togglePin(menuMessage.id); setMenu(null); }}>
              <Glyph name="pin" size={18} /> {menuMessage.data.pinned ? t("couple.chat.unpin") : t("couple.chat.pin")}
            </button>
            <button
              type="button"
              className="is-danger"
              onClick={() => {
                if (window.confirm(t("couple.chat.deleteConfirm"))) void deleteMessage(menuMessage.id);
                setMenu(null);
              }}
            >
              <Glyph name="trash" size={18} /> {t("couple.chat.delete")}
            </button>
          </div>
        ) : null}
      </div>

      {!atBottom ? (
        <button type="button" className="chat-down" onClick={() => list.current?.scrollTo({ top: list.current.scrollHeight, behavior: "smooth" })}>
          <Glyph name="arrowDown" size={20} stroke={2.4} />
          {unreadBelow ? <span className="unread-badge is-small">{unreadBelow}</span> : null}
        </button>
      ) : null}

      {stickerOpen ? (
        <div className="sticker-pick">
          {stickers.map((sticker) => (
            <button key={sticker} type="button" onClick={() => void send({ sticker })}>
              <Art name={sticker} />
            </button>
          ))}
        </div>
      ) : null}

      {replyTo || editing ? (
        <div className="chat-context">
          <Glyph name={editing ? "edit" : "reply"} size={18} />
          <span>
            <b>{editing ? t("couple.chat.editing") : t("couple.chat.replyingTo", { name: byId.get(replyTo!)?.author === me ? t("couple.you") : name })}</b>
            <small>{preview(t, byId.get((editing ?? replyTo)!))}</small>
          </span>
          <button type="button" className="icon-btn" aria-label={t("common.cancel")} onClick={() => { setReplyTo(null); if (editing) { setEditing(null); setText(localStorage.getItem(draftKey()) ?? ""); } }}>
            <Glyph name="close" size={16} />
          </button>
        </div>
      ) : null}

      <div className="chat-compose">
        <button type="button" className={`icon-btn ${stickerOpen ? "is-sky" : ""}`} aria-label={t("couple.chat.stickers")} onClick={() => setStickerOpen(!stickerOpen)}>
          <Glyph name="sparkle" size={20} />
        </button>
        <button type="button" className="icon-btn" aria-label={t("couple.chat.photo")} disabled={uploading} onClick={() => photoInput.current?.click()}>
          {uploading ? <span className="spinner" /> : <Glyph name="image" size={20} />}
        </button>
        <input ref={photoInput} type="file" accept="image/*" hidden onChange={(event) => { void sendPhoto(event.target.files?.[0]); event.target.value = ""; }} />
        <span className="input">
          <textarea
            ref={input}
            rows={1}
            value={text}
            placeholder={t("couple.chat.placeholder")}
            maxLength={4000}
            onChange={(event) => {
              setText(event.target.value);
              if (Date.now() - lastTypingSent.current > 2500) {
                lastTypingSent.current = Date.now();
                void signal("typing", { typing: true });
              }
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void send();
              }
              if (event.key === "Escape") {
                setReplyTo(null);
                setEditing(null);
              }
              if (event.key === "ArrowUp" && !text && lastMine?.data.text) {
                event.preventDefault();
                startEdit(lastMine);
              }
            }}
          />
        </span>
        {text.trim() || editing ? (
          <button type="button" className="icon-btn is-solid" aria-label={t("couple.love.send")} onClick={() => void send()}>
            <Glyph name={editing ? "check" : "arrowUp"} size={20} stroke={2.6} />
          </button>
        ) : (
          <RecordButton
            compact
            onDone={async (recording) => {
              const key = couple.me?.couple_key;
              if (!key) return;
              try {
                const path = await uploadCoupleFile(key, "voice", recording.blob);
                await send({ voice: { path, duration: recording.duration, mime: recording.mime } });
              } catch {
                toast(t("couple.chat.uploadFailed"), "c-frown");
              }
            }}
          />
        )}
      </div>

      {viewer ? (
        <button type="button" className="photo-viewer" onClick={() => setViewer(null)}>
          <img src={viewer} alt="" />
        </button>
      ) : null}
    </div>
  );
}

/** One message row: swipe right to reply, long-press or right-click for the menu. */
function Bubble({
  id,
  mine,
  flash,
  children,
  onReply,
  onMenu,
}: {
  id: string;
  mine: boolean;
  flash: boolean;
  children: React.ReactNode;
  onReply: () => void;
  onMenu: (x: number, y: number) => void;
}) {
  const row = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; y: number; at: number } | null>(null);
  const press = useRef(0);
  const [dx, setDx] = useState(0);

  return (
    <div
      id={`m-${id}`}
      ref={row}
      className={`bubble-row ${mine ? "is-mine" : ""} ${flash ? "is-flash" : ""}`}
      style={{ transform: dx ? `translateX(${dx}px)` : undefined }}
      onContextMenu={(event) => {
        event.preventDefault();
        onMenu(event.clientX, event.clientY);
      }}
      onPointerDown={(event) => {
        start.current = { x: event.clientX, y: event.clientY, at: Date.now() };
        const { clientX, clientY } = event;
        press.current = window.setTimeout(() => {
          start.current = null;
          onMenu(clientX, clientY);
        }, 480);
      }}
      onPointerMove={(event) => {
        if (!start.current) return;
        const moveX = event.clientX - start.current.x;
        const moveY = Math.abs(event.clientY - start.current.y);
        if (Math.abs(moveX) > 8 || moveY > 8) window.clearTimeout(press.current);
        if (moveY < 30 && moveX > 0) setDx(Math.min(80, moveX * 0.7));
      }}
      onPointerUp={() => {
        window.clearTimeout(press.current);
        if (dx > 50) {
          haptic(8);
          onReply();
        }
        setDx(0);
        start.current = null;
      }}
      onPointerCancel={() => {
        window.clearTimeout(press.current);
        setDx(0);
        start.current = null;
      }}
    >
      {dx > 20 ? (
        <span className="swipe-reply" style={{ opacity: Math.min(1, dx / 50) }}>
          <Glyph name="reply" size={16} />
        </span>
      ) : null}
      {children}
    </div>
  );
}

function Photo({ path, ratio, onOpen }: { path: string; ratio: number; onOpen: (url: string) => void }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void fileUrl(path).then((value) => {
      if (alive) setUrl(value);
    });
    return () => {
      alive = false;
    };
  }, [path]);
  return (
    <button type="button" className="chat-photo" style={{ aspectRatio: String(ratio || 1) }} onClick={(event) => { event.stopPropagation(); if (url) onOpen(url); }}>
      {url ? <img src={url} alt="" loading="lazy" /> : <span className="spinner" />}
    </button>
  );
}

/** A call in the chat: what kind, how long, and a button to call back. */
function CallRecord({ call, mine }: { call: NonNullable<MessageData["call"]>; mine: boolean }) {
  const { t } = useTranslation();
  const missed = call.status !== "ended";
  const minutes = Math.floor(call.seconds / 60);
  const length = call.seconds ? ` · ${minutes}:${String(call.seconds % 60).padStart(2, "0")}` : "";
  return (
    <span className={`chat-call ${missed ? "is-missed" : ""}`}>
      <span className="chat-call-icon">{call.video ? "📹" : "📞"}</span>
      <span className="chat-call-copy">
        <b>{callLabel(t, call, mine)}</b>
        <small>
          {mine ? "↗" : "↙"}
          {length}
        </small>
      </span>
      <button
        type="button"
        className="chat-call-again"
        onClick={(event) => {
          event.stopPropagation();
          void startCall(call.video);
        }}
        aria-label={t("call.log.again")}
        title={t("call.log.again")}
      >
        {call.video ? "📹" : "📞"}
      </button>
    </span>
  );
}
