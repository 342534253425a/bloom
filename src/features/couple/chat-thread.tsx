import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { inFront, openOutside } from "@/shared/lib/native";
import { myId, type CoupleItem, type MessageData } from "@/entities/couple";
import { allConversations, edit, forward, messageOrder, pin, react, read, removeMessage, send as sendTo, useContacts, type Conversation } from "@/entities/chat";
import { localeOf } from "@/shared/i18n";
import { topicIcon, topics } from "@/shared/config/topics";
import { embedUrl, findLinks, mainLink, type LinkInfo } from "@/shared/lib/links";
import { compressImage, fileUrl, MAX_FILE, uploadCoupleFile, videoInfo } from "@/shared/lib/media";
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

/** The quick reactions, like Telegram's row, and the rest behind the arrow. */
const quickReactions = ["❤️", "👍", "👎", "🔥", "🥰", "👏"];
const moreReactions = ["😂", "😮", "😢", "🥺", "🙏", "🎉", "🤔", "😍", "🤯", "😱", "🤬", "💯", "🤝", "👀", "😴", "🤗", "😎", "🤩", "💔", "🌸", "⚡", "🍓", "🏆", "🙈", "🤡", "💩", "🫶", "✨", "☕", "🍿"];

type Msg = CoupleItem<MessageData>;
type Pending = { file: File; url: string; video: boolean };

/** Date formatters are slow to create, so each one is made once per language and reused for every message. */
const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(kind: "day" | "time" | "date") {
  const key = `${localeOf()}:${kind}`;
  let made = formatters.get(key);
  if (!made) {
    const options: Intl.DateTimeFormatOptions =
      kind === "day" ? { weekday: "long", day: "numeric", month: "long" } : kind === "time" ? { hour: "2-digit", minute: "2-digit" } : { day: "numeric", month: "long" };
    made = new Intl.DateTimeFormat(localeOf(), options);
    formatters.set(key, made);
  }
  return made;
}

function dayLabel(iso: string) {
  return formatter("day").format(new Date(iso));
}

function timeLabel(iso: string) {
  return formatter("time").format(new Date(iso));
}

/** A function that always calls the latest version of a handler but never changes itself (so memoized rows don't redraw). */
function useStable<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  const ref = useRef(fn);
  ref.current = fn;
  return useCallback((...args: A) => ref.current(...args), []);
}

/** "today at 15:56", like the bottom of Telegram's message menu. */
function whenLabel(t: (key: string, options?: Record<string, unknown>) => string, iso: string) {
  const date = new Date(iso);
  const time = timeLabel(iso);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86_400_000);
  if (date.toDateString() === today.toDateString()) return t("people.chat.todayAt", { time });
  if (date.toDateString() === yesterday.toDateString()) return t("people.chat.yesterdayAt", { time });
  return t("people.chat.at", { date: formatter("date").format(date), time });
}

/** "Outgoing video call · 5:12", "Missed call"… seen from this person's side. */
export function callLabel(t: (key: string) => string, call: NonNullable<MessageData["call"]>, mine: boolean): string {
  if (call.status === "declined") return t("call.log.declined");
  if (call.status === "missed") return mine ? t("call.log.cancelled") : t("call.log.missed");
  return t(`call.log.${mine ? "outgoing" : "incoming"}${call.video ? "Video" : ""}`);
}

export function preview(t: (key: string) => string, message: Msg | undefined): string {
  if (!message) return t("couple.chat.deleted");
  if (message.data.call) return `📞 ${callLabel(t, message.data.call, message.author === myId())}`;
  if (message.data.voice) return `🎤 ${t("couple.chat.voice")}`;
  if (message.data.photo) return `📷 ${message.data.text || t("couple.chat.photo")}`;
  if (message.data.video) return `🎬 ${message.data.text || t("people.chat.video")}`;
  if (message.data.sticker) return `🌸 ${t("couple.chat.sticker")}`;
  return (message.data.text ?? "").slice(0, 90);
}

function isMedia(file: File) {
  return file.type.startsWith("image/") || file.type.startsWith("video/");
}

/** One conversation (the partner or anyone else) with the Telegram essentials. `compact` is used inside the cinema room. */
export function ChatThread({ conv, compact = false, searchOpen = false, onSearchClose }: { conv: Conversation; compact?: boolean; searchOpen?: boolean; onSearchClose?: () => void }) {
  const { t } = useTranslation();
  const me = myId();
  const name = conv.peer.name;
  const draftKey = `bloom.draft.${conv.key}`;
  const all = conv.useItems<MessageData>("msg");
  const partnerRead = conv.useItem<{ seen?: string }>(`read:${conv.peer.id}`);
  const myRead = conv.useItem<{ seen?: string }>(`read:${me ?? ""}`);
  const [stickerOpen, setStickerOpen] = useState(false);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number; more: boolean } | null>(null);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [typing, setTyping] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const [flash, setFlash] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [viewer, setViewer] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [selected, setSelected] = useState<Set<string> | null>(null);
  const [forwarding, setForwarding] = useState<string[] | null>(null);
  const [pending, setPending] = useState<Pending[] | null>(null);
  const [dragging, setDragging] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const composer = useRef<ComposerApi | null>(null);
  const typingTimer = useRef(0);
  const unreadFrom = useRef<string | null | undefined>(undefined);

  const messages = useMemo(() => [...all].sort(messageOrder), [all]);
  const byId = useMemo(() => new Map(messages.map((message) => [message.id, message])), [messages]);
  const lastMine = [...messages].reverse().find((message) => message.author === me);
  const lastPartner = [...messages].reverse().find((message) => message.author !== me);
  const pinned = [...messages].filter((message) => message.data.pinned).sort((a, b) => (b.data.pinned ?? "").localeCompare(a.data.pinned ?? ""))[0];
  const unreadBelow = messages.filter((message) => message.author !== me && message.created_at > (myRead?.data.seen ?? "")).length;

  // Remember where the unread messages started when the chat opened, for the "new messages" divider.
  if (unreadFrom.current === undefined && me && all.length) {
    const seen = myRead?.data.seen ?? "";
    unreadFrom.current = messages.find((message) => message.author !== me && message.created_at > seen)?.id ?? null;
  }

  useEffect(
    () =>
      conv.onSignal("typing", (payload) => {
        setTyping(Boolean(payload.typing));
        window.clearTimeout(typingTimer.current);
        if (payload.typing) typingTimer.current = window.setTimeout(() => setTyping(false), 4000);
      }),
    [conv],
  );

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
    const mark = () => inFront() && void read(conv, lastPartner.created_at);
    mark();
    window.addEventListener("focus", mark);
    document.addEventListener("visibilitychange", mark);
    return () => {
      window.removeEventListener("focus", mark);
      document.removeEventListener("visibilitychange", mark);
    };
  }, [lastPartner, atBottom, conv]);

  // Escape leaves selection, like Telegram.
  useEffect(() => {
    if (!selected) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setSelected(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);

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

  const startEdit = useStable((message: Msg) => {
    setEditing(message.id);
    setReplyTo(null);
    composer.current?.setText(message.data.text ?? "");
    window.setTimeout(() => composer.current?.focus(), 30);
  });

  function stopEditing() {
    setEditing(null);
    composer.current?.setText(localStorage.getItem(draftKey) ?? "");
  }

  /** Text from the box: a new message, or the edited one. */
  const sendText = useStable(async (body: string, topic: string | null) => {
    if (editing) {
      if (body.trim()) await edit(conv, editing, body);
      stopEditing();
      return;
    }
    if (!body.trim()) return;
    setStickerOpen(false);
    const reply = replyTo;
    setReplyTo(null);
    haptic(6);
    setAtBottom(true);
    await sendTo(conv, body, { ...(topic ? { topic } : {}), replyTo: reply });
  });

  /** Stickers, voice, photos and videos (with an optional caption). */
  async function send(extra: Partial<Pick<MessageData, "sticker" | "voice" | "photo" | "video" | "topic">>, caption: string | null = null) {
    setStickerOpen(false);
    const reply = replyTo;
    setReplyTo(null);
    haptic(6);
    setAtBottom(true);
    await sendTo(conv, caption, { ...extra, replyTo: reply });
  }

  /** Photos and videos: from the clip button, Ctrl+V, or dropped on the chat. */
  const attach = useStable((files: File[]) => {
    const media = files.filter(isMedia);
    if (!media.length) return;
    const tooBig = media.filter((file) => file.size > MAX_FILE);
    if (tooBig.length) toast(t("people.chat.tooBig"), "c-frown");
    const ok = media.filter((file) => file.size <= MAX_FILE).slice(0, 10);
    if (ok.length) setPending(ok.map((file) => ({ file, url: URL.createObjectURL(file), video: file.type.startsWith("video/") })));
  });

  async function sendPending(items: Pending[], caption: string, topic: string | null) {
    setPending(null);
    setUploading(true);
    try {
      for (const [index, item] of items.entries()) {
        const words = index === 0 ? caption.trim() || null : null;
        if (item.video) {
          const info = await videoInfo(item.file);
          const path = await uploadCoupleFile(conv.key, "videos", item.file);
          await send({ video: { path, ...info, mime: item.file.type }, topic }, words);
        } else if (item.file.type === "image/gif") {
          // Animated GIFs keep their animation.
          const bitmap = await createImageBitmap(item.file);
          const path = await uploadCoupleFile(conv.key, "photos", item.file);
          await send({ photo: { path, width: bitmap.width, height: bitmap.height }, topic }, words);
          bitmap.close();
        } else {
          const image = await compressImage(item.file);
          const path = await uploadCoupleFile(conv.key, "photos", image.blob);
          await send({ photo: { path, width: image.width, height: image.height }, topic }, words);
        }
      }
      // The typed text went out as the caption.
      if (caption.trim() && composer.current?.getText().trim() === caption.trim()) composer.current.setText("");
    } catch {
      toast(t("couple.chat.uploadFailed"), "c-frown");
    } finally {
      for (const item of items) URL.revokeObjectURL(item.url);
      setUploading(false);
    }
  }

  const openMenu = useStable((id: string, x: number, y: number) => {
    if (selected) return;
    haptic(10);
    setMenu({ id, x, y, more: false });
  });

  const toggleSelect = useStable((id: string) => {
    setSelected((current) => {
      const next = new Set(current ?? []);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next.size ? next : null;
    });
  });

  const replyToMessage = useStable((id: string) => {
    setReplyTo(id);
    setEditing(null);
    composer.current?.focus();
  });
  const jump = useStable((id: string) => jumpTo(id));
  const openPhoto = useStable((url: string) => setViewer(url));
  const voice = useStable(async (recording: { blob: Blob; duration: number; mime: string }) => {
    try {
      const path = await uploadCoupleFile(conv.key, "voice", recording.blob);
      await send({ voice: { path, duration: recording.duration, mime: recording.mime } });
    } catch {
      toast(t("couple.chat.uploadFailed"), "c-frown");
    }
  });
  const escape = useStable(() => {
    setReplyTo(null);
    if (editing) stopEditing();
  });
  const editLast = useStable(() => {
    if (lastMine?.data.text) startEdit(lastMine);
  });
  const toggleStickers = useStable(() => setStickerOpen((open) => !open));

  async function copyText(ids: string[]) {
    const words = ids
      .map((id) => byId.get(id))
      .filter((message): message is Msg => Boolean(message))
      .sort(messageOrder)
      .map((message) => message.data.text ?? "")
      .filter(Boolean)
      .join("\n\n");
    await navigator.clipboard.writeText(words).catch(() => undefined);
    toast(t("common.copied"), "c-hug-heart");
  }

  async function removeMany(ids: string[]) {
    if (!window.confirm(ids.length > 1 ? t("people.chat.deleteMany", { count: ids.length }) : t("couple.chat.deleteConfirm"))) return;
    for (const id of ids) await removeMessage(conv, id);
    setSelected(null);
  }

  const filtered = query.trim() ? messages.filter((message) => (message.data.text ?? "").toLowerCase().includes(query.trim().toLowerCase())) : [];
  const menuMessage = menu ? byId.get(menu.id) : undefined;
  let lastDay = "";

  return (
    <div
      className={`chat ${compact ? "is-compact" : ""} ${selected ? "is-selecting" : ""} ${dragging ? "is-dropping" : ""}`}
      onDragOver={(event) => {
        if ([...event.dataTransfer.types].includes("Files")) {
          event.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        attach([...event.dataTransfer.files]);
      }}
    >
      {selected ? (
        <div className="chat-select-bar">
          <button type="button" className="icon-btn" aria-label={t("common.cancel")} onClick={() => setSelected(null)}>
            <Glyph name="close" size={18} />
          </button>
          <b>{t("people.chat.selected", { count: selected.size })}</b>
          <button type="button" className="btn is-sm is-ghost" onClick={() => void copyText([...selected]).then(() => setSelected(null))}>
            <Glyph name="copy" size={16} /> {t("couple.chat.copy")}
          </button>
          <button type="button" className="btn is-sm is-ghost" onClick={() => setForwarding([...selected])}>
            <Glyph name="share" size={16} /> {t("people.chat.forward")}
          </button>
          <button type="button" className="btn is-sm is-ghost is-danger" onClick={() => void removeMany([...selected])}>
            <Glyph name="trash" size={16} /> {t("couple.chat.delete")}
          </button>
        </div>
      ) : pinned ? (
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
              void pin(conv, pinned.id);
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
            <Art name={conv.isPartner ? "c-pair-hearts" : "c-wave"} />
            <p className="sub">{conv.isPartner ? t("couple.chat.empty") : t("people.noMessages")}</p>
          </div>
        ) : null}
        {messages.map((message) => {
          const day = dayLabel(message.created_at);
          const showDay = day !== lastDay;
          lastDay = day;
          const mine = message.author === me;
          return (
            <MessageRow
              key={message.id}
              message={message}
              mine={mine}
              quoted={message.data.replyTo ? byId.get(message.data.replyTo) : undefined}
              day={showDay ? day : null}
              unreadHere={message.id === unreadFrom.current}
              flash={flash === message.id}
              selected={selected ? selected.has(message.id) : null}
              seen={mine && Boolean(partnerRead?.data.seen && partnerRead.data.seen >= message.created_at)}
              me={me}
              peerName={name}
              conv={conv}
              onTap={toggleSelect}
              onReply={replyToMessage}
              onMenu={openMenu}
              onJump={jump}
              onOpenPhoto={openPhoto}
            />
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

      </div>

      {menu && menuMessage
        ? createPortal(
            <>
          {/* Clicking anywhere else closes the menu, like Telegram. */}
          <div className="chat-menu-backdrop" onClick={() => setMenu(null)} onContextMenu={(event) => { event.preventDefault(); setMenu(null); }} />
          <div className="chat-menu" style={menuSpot(menu)} onClick={(event) => event.stopPropagation()}>
            <div className={`chat-menu-reacts ${menu.more ? "is-more" : ""}`}>
              {(menu.more ? [...quickReactions, ...moreReactions] : quickReactions).map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  className={menuMessage.data.reactions?.[me ?? ""] === emoji ? "is-on" : ""}
                  onClick={(event) => {
                    pop(event.currentTarget, 1.3);
                    void react(conv, menuMessage.id, emoji);
                    setMenu(null);
                  }}
                >
                  {emoji}
                </button>
              ))}
              {menu.more ? null : (
                <button type="button" className="chat-menu-more" aria-label={t("people.chat.more")} onClick={() => setMenu({ ...menu, more: true })}>
                  <Glyph name="down" size={16} stroke={2.6} />
                </button>
              )}
            </div>
            <div className="chat-menu-card">
              <button type="button" onClick={() => { replyToMessage(menuMessage.id); setMenu(null); }}>
                <Glyph name="reply" size={20} /> {t("couple.chat.reply")}
              </button>
              {menuMessage.author === me && menuMessage.data.text ? (
                <button type="button" onClick={() => { startEdit(menuMessage); setMenu(null); }}>
                  <Glyph name="edit" size={20} /> {t("couple.chat.edit")}
                </button>
              ) : null}
              <button type="button" onClick={() => { void pin(conv, menuMessage.id); setMenu(null); }}>
                <Glyph name="pin" size={20} /> {menuMessage.data.pinned ? t("couple.chat.unpin") : t("couple.chat.pin")}
              </button>
              {menuMessage.data.text ? (
                <button type="button" onClick={() => { void copyText([menuMessage.id]); setMenu(null); }}>
                  <Glyph name="copy" size={20} /> {t("people.chat.copyText")}
                </button>
              ) : null}
              {menuMessage.data.call ? null : (
                <button type="button" onClick={() => { setForwarding([menuMessage.id]); setMenu(null); }}>
                  <Glyph name="share" size={20} /> {t("people.chat.forward")}
                </button>
              )}
              <button type="button" className="is-danger" onClick={() => { setMenu(null); void removeMany([menuMessage.id]); }}>
                <Glyph name="trash" size={20} /> {t("people.chat.delete")}
              </button>
              <button type="button" onClick={() => { setSelected(new Set([menuMessage.id])); setMenu(null); }}>
                <Glyph name="check" size={20} /> {t("people.chat.select")}
              </button>
              <i className="chat-menu-sep" />
              <p className="chat-menu-when">
                <Glyph name="clock" size={18} /> {whenLabel(t, menuMessage.created_at)}
                {menuMessage.data.edited ? ` · ${t("couple.chat.edited")}` : ""}
              </p>
            </div>
          </div>
            </>,
            document.body,
          )
        : null}

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
          <button type="button" className="icon-btn" aria-label={t("common.cancel")} onClick={escape}>
            <Glyph name="close" size={16} />
          </button>
        </div>
      ) : null}

      <Composer
        api={composer}
        conv={conv}
        draftKey={draftKey}
        editing={Boolean(editing)}
        uploading={uploading}
        stickerOpen={stickerOpen}
        onToggleStickers={toggleStickers}
        onAttach={attach}
        onSendText={sendText}
        onVoice={voice}
        onEscape={escape}
        onEditLast={editLast}
      />

      {dragging ? <div className="chat-drop">{t("people.chat.dropHere")}</div> : null}

      {pending ? (
        <AttachSheet
          items={pending}
          initialCaption={composer.current?.getText() ?? ""}
          onCancel={() => {
            for (const item of pending) URL.revokeObjectURL(item.url);
            setPending(null);
          }}
          onSend={(caption, topic) => void sendPending(pending, caption, topic)}
        />
      ) : null}

      {forwarding ? (
        <ForwardSheet
          from={conv}
          ids={forwarding}
          onClose={(done) => {
            setForwarding(null);
            if (done) setSelected(null);
          }}
        />
      ) : null}

      {viewer ? (
        <button type="button" className="photo-viewer" onClick={() => setViewer(null)}>
          <img src={viewer} alt="" />
        </button>
      ) : null}
    </div>
  );
}

type ComposerApi = { getText: () => string; setText: (text: string) => void; focus: () => void };

/**
 * The text box with its buttons. It keeps the typed text to itself, so typing redraws only this small part
 * and never the whole conversation (that was what made typing lag on phones).
 */
const Composer = memo(function Composer({
  api,
  conv,
  draftKey,
  editing,
  uploading,
  stickerOpen,
  onToggleStickers,
  onAttach,
  onSendText,
  onVoice,
  onEscape,
  onEditLast,
}: {
  api: MutableRefObject<ComposerApi | null>;
  conv: Conversation;
  draftKey: string;
  editing: boolean;
  uploading: boolean;
  stickerOpen: boolean;
  onToggleStickers: () => void;
  onAttach: (files: File[]) => void;
  onSendText: (text: string, topic: string | null) => Promise<void>;
  onVoice: (recording: { blob: Blob; duration: number; mime: string }) => Promise<void>;
  onEscape: () => void;
  onEditLast: () => void;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState(() => localStorage.getItem(draftKey) ?? "");
  const [linkTopic, setLinkTopic] = useState<string | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const lastTypingSent = useRef(0);
  const textRef = useRef(text);
  textRef.current = text;
  api.current = {
    getText: () => textRef.current,
    setText,
    focus: () => input.current?.focus(),
  };
  const hasLink = !editing && findLinks(text).length > 0;

  // Keep the draft between visits.
  useEffect(() => {
    if (editing) return;
    const timer = window.setTimeout(() => {
      if (text) localStorage.setItem(draftKey, text);
      else localStorage.removeItem(draftKey);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [text, editing, draftKey]);

  const submit = () => {
    const body = text;
    const topic = hasLink ? linkTopic : null;
    if (!editing) {
      if (!body.trim()) return;
      setText("");
      setLinkTopic(null);
    }
    void onSendText(body, topic);
  };

  return (
    <>
      {hasLink ? <TopicChips value={linkTopic} onChange={setLinkTopic} /> : null}
      <div className="chat-compose">
        <button type="button" className={`icon-btn ${stickerOpen ? "is-sky" : ""}`} aria-label={t("couple.chat.stickers")} onClick={onToggleStickers}>
          <Glyph name="sparkle" size={20} />
        </button>
        <button type="button" className="icon-btn" aria-label={t("people.chat.attach")} title={t("people.chat.attach")} disabled={uploading} onClick={() => fileInput.current?.click()}>
          {uploading ? <span className="spinner" /> : <Glyph name="image" size={20} />}
        </button>
        <input ref={fileInput} type="file" accept="image/*,video/*" multiple hidden onChange={(event) => { onAttach([...(event.target.files ?? [])]); event.target.value = ""; }} />
        <span className="input">
          <textarea
            ref={input}
            rows={1}
            value={text}
            placeholder={t("couple.chat.placeholder")}
            maxLength={4000}
            onPaste={(event) => {
              // Ctrl+V with a picture or video: show it ready to send, like Telegram.
              const files = [...event.clipboardData.files].filter(isMedia);
              if (files.length) {
                event.preventDefault();
                onAttach(files);
              }
            }}
            onChange={(event) => {
              setText(event.target.value);
              if (Date.now() - lastTypingSent.current > 2500) {
                lastTypingSent.current = Date.now();
                void conv.signal("typing", { typing: true });
              }
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submit();
              }
              if (event.key === "Escape") onEscape();
              if (event.key === "ArrowUp" && !text) {
                event.preventDefault();
                onEditLast();
              }
            }}
          />
        </span>
        {text.trim() || editing ? (
          <button
            type="button"
            className="icon-btn is-solid"
            aria-label={t("couple.love.send")}
            // Keep the focus (and the keyboard) in the text box after sending, like Telegram.
            onPointerDown={(event) => event.preventDefault()}
            onClick={submit}
          >
            <Glyph name={editing ? "check" : "arrowUp"} size={20} stroke={2.6} />
          </button>
        ) : (
          <RecordButton compact onDone={onVoice} />
        )}
      </div>
    </>
  );
});

/** One message with its day line; memoized, so only the message that changed is drawn again. */
const MessageRow = memo(function MessageRow({
  message,
  mine,
  quoted,
  day,
  unreadHere,
  flash,
  selected,
  seen,
  me,
  peerName,
  conv,
  onTap,
  onReply,
  onMenu,
  onJump,
  onOpenPhoto,
}: {
  message: Msg;
  mine: boolean;
  quoted: Msg | undefined;
  day: string | null;
  unreadHere: boolean;
  flash: boolean;
  selected: boolean | null;
  seen: boolean;
  me: string | null;
  peerName: string;
  conv: Conversation;
  onTap: (id: string) => void;
  onReply: (id: string) => void;
  onMenu: (id: string, x: number, y: number) => void;
  onJump: (id: string) => void;
  onOpenPhoto: (url: string) => void;
}) {
  const { t } = useTranslation();
  const data = message.data;
  const reacted = Object.values(data.reactions ?? {});
  const grouped = [...new Set(reacted)].map((emoji) => ({ emoji, count: reacted.filter((item) => item === emoji).length }));
  const media = data.sticker ? "is-sticker" : data.photo || data.video ? "is-photo" : "";
  const link = useMemo(() => (data.text && !data.photo && !data.video ? mainLink(data.text) : null), [data.text, data.photo, data.video]);
  const text = useMemo(() => (data.text ? linkify(data.text) : null), [data.text]);
  return (
    <div>
      {day ? <p className="chat-day">{day}</p> : null}
      {unreadHere ? <p className="chat-unread">{t("couple.chat.newMessages")}</p> : null}
      <Bubble
        id={message.id}
        mine={mine}
        flash={flash}
        selected={selected}
        onTap={() => onTap(message.id)}
        onReply={() => onReply(message.id)}
        onMenu={(x, y) => onMenu(message.id, x, y)}
      >
        <div className={`chat-bubble ${mine ? "is-mine" : ""} ${media} ${link && link.kind !== "web" ? "has-embed" : ""}`}>
          {data.forwarded ? <small className="chat-forwarded">↪ {t("people.chat.forwardedFrom", { name: data.forwarded.name ?? t("people.you") })}</small> : null}
          {quoted || data.replyTo ? (
            <button type="button" className="chat-quote" onClick={(event) => { event.stopPropagation(); if (quoted) onJump(quoted.id); }}>
              <b>{quoted ? (quoted.author === me ? t("couple.you") : peerName) : "…"}</b>
              <span>{preview(t, quoted)}</span>
            </button>
          ) : null}
          {data.call ? <CallRecord call={data.call} mine={mine} conv={conv} /> : null}
          {data.sticker ? <Art name={data.sticker} /> : null}
          {data.photo ? <Photo path={data.photo.path} ratio={data.photo.width / data.photo.height} onOpen={onOpenPhoto} /> : null}
          {data.video ? <VideoNote path={data.video.path} ratio={data.video.width / data.video.height} /> : null}
          {data.voice ? <VoicePlayer path={data.voice.path} duration={data.voice.duration} tone={mine ? "dark" : "light"} /> : null}
          {link ? <LinkCard link={link} /> : null}
          {text ? <span className="chat-text">{text}</span> : null}
          <small className="chat-meta">
            {data.topic ? `${topicIcon(data.topic)} ` : ""}
            {data.pinned ? "📌 " : ""}
            {data.edited ? `${t("couple.chat.edited")} · ` : ""}
            {timeLabel(message.created_at)}
            {mine ? (seen ? " ✓✓" : " ✓") : ""}
          </small>
        </div>
        {grouped.length ? (
          <span className="chat-reacts">
            {grouped.map((item) => (
              <button key={item.emoji} type="button" onClick={(event) => { event.stopPropagation(); void react(conv, message.id, item.emoji); }}>
                {item.emoji}
                {item.count > 1 ? <small>{item.count}</small> : null}
              </button>
            ))}
          </span>
        ) : null}
      </Bubble>
    </div>
  );
});

/** Telegram puts the menu at the cursor with the reactions just above it, and keeps all of it on screen. */
function menuSpot(menu: { x: number; y: number; more: boolean }) {
  const width = 280;
  const height = menu.more ? 560 : 470;
  const left = Math.max(8, Math.min(menu.x, window.innerWidth - width - 8));
  const top = Math.max(8, Math.min(menu.y - 60, window.innerHeight - height - 8));
  return { left, top };
}

/** Links in a message stay clickable and open outside Bloom. */
function linkify(text: string): ReactNode {
  const links = findLinks(text);
  if (!links.length) return text;
  const parts: ReactNode[] = [];
  let rest = text;
  for (const [index, url] of links.entries()) {
    const at = rest.indexOf(url);
    if (at < 0) continue;
    if (at) parts.push(rest.slice(0, at));
    parts.push(
      <a
        key={index}
        href={url}
        target="_blank"
        rel="noreferrer"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          void openOutside(url);
        }}
      >
        {url}
      </a>,
    );
    rest = rest.slice(at + url.length);
  }
  if (rest) parts.push(rest);
  return parts;
}

/** YouTube / Shorts, TikTok and Reels play inside the chat; other links get a small card. */
export function LinkCard({ link }: { link: LinkInfo }) {
  const [playing, setPlaying] = useState(false);
  const embed = embedUrl(link);
  if (link.kind === "web" || !embed) return null;
  const vertical = link.kind !== "youtube" || link.vertical;
  const label = link.kind === "youtube" ? (link.vertical ? "YouTube Shorts" : "YouTube") : link.kind === "tiktok" ? "TikTok" : "Instagram";
  return (
    <span className={`chat-embed ${vertical ? "is-vertical" : ""}`} onClick={(event) => event.stopPropagation()}>
      {playing ? (
        <iframe src={embed} title={label} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen />
      ) : (
        <button type="button" className="chat-embed-cover" onClick={() => setPlaying(true)}>
          {link.kind === "youtube" ? <img src={`https://i.ytimg.com/vi/${link.id}/hqdefault.jpg`} alt="" loading="lazy" /> : null}
          <span className="chat-embed-play">▶</span>
          <span className="chat-embed-label">{label}</span>
        </button>
      )}
    </span>
  );
}

function TopicChips({ value, onChange }: { value: string | null; onChange: (topic: string | null) => void }) {
  const { t } = useTranslation();
  return (
    <div className="topic-chips" role="group" aria-label={t("people.chat.topic")}>
      {topics.map((topic) => (
        <button key={topic.id} type="button" className={`chip ${value === topic.id ? "is-on" : ""}`} onClick={() => onChange(value === topic.id ? null : topic.id)}>
          {topic.icon} {t(`people.topics.${topic.id}`)}
        </button>
      ))}
    </div>
  );
}

/** Pasted, dropped or picked photos and videos: a look before sending, a caption and a topic (Telegram's send dialog). */
function AttachSheet({ items, initialCaption, onCancel, onSend }: { items: Pending[]; initialCaption: string; onCancel: () => void; onSend: (caption: string, topic: string | null) => void }) {
  const { t } = useTranslation();
  const [caption, setCaption] = useState(initialCaption);
  const [topic, setTopic] = useState<string | null>(null);
  return (
    <div className="attach-sheet" onClick={(event) => event.target === event.currentTarget && onCancel()}>
      <div className="attach-card" role="dialog" aria-label={t("people.chat.attach")}>
        <div className={`attach-previews ${items.length > 1 ? "is-many" : ""}`}>
          {items.map((item) => (item.video ? <video key={item.url} src={item.url} muted controls playsInline /> : <img key={item.url} src={item.url} alt="" />))}
        </div>
        <TopicChips value={topic} onChange={setTopic} />
        <span className="input">
          <input
            autoFocus
            value={caption}
            placeholder={t("people.chat.caption")}
            maxLength={1000}
            onChange={(event) => setCaption(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") onSend(caption, topic);
              if (event.key === "Escape") onCancel();
            }}
          />
        </span>
        <div className="attach-actions">
          <button type="button" className="btn is-ghost" onClick={onCancel}>
            {t("common.cancel")}
          </button>
          <button type="button" className="btn" onClick={() => onSend(caption, topic)}>
            {items.length > 1 ? t("people.chat.sendCount", { count: items.length }) : t("people.chat.send")}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Choose a chat to forward to: the partner, family and friends. */
export function ForwardSheet({ from, ids, onClose }: { from: Conversation; ids: string[]; onClose: (done: boolean) => void }) {
  const { t } = useTranslation();
  const contacts = useContacts();
  const [busy, setBusy] = useState(false);
  const targets = allConversations(contacts.list);
  return (
    <div className="attach-sheet" onClick={(event) => event.target === event.currentTarget && onClose(false)}>
      <div className="attach-card forward-card" role="dialog" aria-label={t("people.chat.forwardTo")}>
        <h3>{t("people.chat.forwardTo")}</h3>
        <div className="forward-list">
          {targets.map((target) => (
            <button
              key={target.id}
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await forward(from, ids, target, from.peer.name);
                  toast(t("people.chat.forwarded"), "c-arms-up");
                  onClose(true);
                } catch {
                  toast(t("couple.chat.uploadFailed"), "c-frown");
                  setBusy(false);
                }
              }}
            >
              <span className="forward-ava">{target.isPartner ? "❤️" : target.peer.name.trim().charAt(0).toUpperCase() || "♥"}</span>
              <span>
                <b>{target.peer.name}</b>
                <small>{target.isPartner ? t("people.partner") : contacts.list.find((item) => item.id === target.id)?.kind === "family" ? t("people.family") : t("people.friends")}</small>
              </span>
            </button>
          ))}
        </div>
        <button type="button" className="btn is-ghost" onClick={() => onClose(false)}>
          {t("common.cancel")}
        </button>
      </div>
    </div>
  );
}

/** One message row: swipe right to reply, long-press or right-click for the menu; a tap selects while selecting. */
function Bubble({
  id,
  mine,
  flash,
  selected,
  children,
  onTap,
  onReply,
  onMenu,
}: {
  id: string;
  mine: boolean;
  flash: boolean;
  /** null when not selecting. */
  selected: boolean | null;
  children: ReactNode;
  onTap: () => void;
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
      className={`bubble-row ${mine ? "is-mine" : ""} ${flash ? "is-flash" : ""} ${selected ? "is-selected" : ""}`}
      style={{ transform: dx ? `translateX(${dx}px)` : undefined }}
      onClickCapture={(event) => {
        if (selected === null) return;
        event.preventDefault();
        event.stopPropagation();
        onTap();
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        onMenu(event.clientX, event.clientY);
      }}
      onPointerDown={(event) => {
        if (selected !== null) return;
        start.current = { x: event.clientX, y: event.clientY, at: Date.now() };
        const { clientX, clientY } = event;
        press.current = window.setTimeout(() => {
          start.current = null;
          onMenu(clientX, clientY);
        }, 360);
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
      {selected !== null ? <span className={`bubble-check ${selected ? "is-on" : ""}`}>{selected ? "✓" : ""}</span> : null}
      {dx > 20 ? (
        <span className="swipe-reply" style={{ opacity: Math.min(1, dx / 50) }}>
          <Glyph name="reply" size={16} />
        </span>
      ) : null}
      {children}
    </div>
  );
}

function useFileUrl(path: string) {
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
  return url;
}

export function Photo({ path, ratio, onOpen }: { path: string; ratio: number; onOpen: (url: string) => void }) {
  const url = useFileUrl(path);
  return (
    <button type="button" className="chat-photo" style={{ aspectRatio: String(ratio || 1) }} onClick={(event) => { event.stopPropagation(); if (url) onOpen(url); }}>
      {url ? <img src={url} alt="" loading="lazy" /> : <span className="spinner" />}
    </button>
  );
}

export function VideoNote({ path, ratio }: { path: string; ratio: number }) {
  const url = useFileUrl(path);
  return (
    <span className="chat-photo chat-video" style={{ aspectRatio: String(ratio || 16 / 9) }} onClick={(event) => event.stopPropagation()}>
      {url ? <video src={url} controls playsInline preload="metadata" /> : <span className="spinner" />}
    </span>
  );
}

/** A call in the chat: what kind, how long, and a button to call back. */
function CallRecord({ call, mine, conv }: { call: NonNullable<MessageData["call"]>; mine: boolean; conv: Conversation }) {
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
          void startCall(call.video, conv);
        }}
        aria-label={t("call.log.again")}
        title={t("call.log.again")}
      >
        {call.video ? "📹" : "📞"}
      </button>
    </span>
  );
}
