import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { myId, newInviteCode, useCouple, type CoupleItem, type MessageData } from "@/entities/couple";
import { addContact, allConversations, messageOrder, unreadIn, useContacts, type AddError, type Conversation } from "@/entities/chat";
import { ForwardSheet, LinkCard, Photo, preview, VideoNote } from "@/features/couple/chat-thread";
import { localeOf } from "@/shared/i18n";
import { topicIcon, topics } from "@/shared/config/topics";
import { mainLink } from "@/shared/lib/links";
import { PageHead, Tabs } from "@/shared/ui/bloom";
import { Glyph } from "@/shared/ui/glyph";
import { Art, toast } from "@/shared/ui/kit";
import { Sheet } from "@/shared/ui/sheet";

type Tab = "chats" | "memes";

/** Friends and family (the partner pinned on top): chats like Telegram, and the shared memes by topic. */
export function PeoplePage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>("chats");
  const [adding, setAdding] = useState(false);
  return (
    <div className="page people-page">
      <PageHead
        title={t("people.title")}
        sub={t("people.sub")}
        art="c-pair-hearts"
        actions={
          <button type="button" className="btn is-sm" onClick={() => setAdding(true)}>
            <Glyph name="plus" size={18} /> {t("people.add")}
          </button>
        }
      />
      <Tabs
        value={tab}
        onChange={setTab}
        options={[
          { id: "chats", label: t("people.chats") },
          { id: "memes", label: `😂 ${t("people.memes")}` },
        ]}
      />
      {tab === "chats" ? <ChatList onAdd={() => setAdding(true)} /> : <Memes />}
      <AddPerson open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}

function clock(iso: string) {
  const date = new Date(iso);
  const today = new Date().toDateString() === date.toDateString();
  return new Intl.DateTimeFormat(localeOf(), today ? { hour: "2-digit", minute: "2-digit" } : { day: "numeric", month: "short" }).format(date);
}

/** Re-renders when any chat changes (the couple's or a contact's). */
function useEverything() {
  const couple = useCouple();
  const contacts = useContacts();
  // The conversations read the stores directly; these versions tell React when to look again.
  return useMemo(() => allConversations(contacts.list), [contacts.list, contacts.version, couple.version, couple.partner?.id, couple.presence.online]);
}

function ChatList({ onAdd }: { onAdd: () => void }) {
  const { t } = useTranslation();
  const couple = useCouple();
  const contacts = useContacts();
  const chats = useEverything();
  const partner = chats.find((chat) => chat.isPartner);
  const others = chats.filter((chat) => !chat.isPartner);
  const family = others.filter((chat) => contacts.list.find((item) => item.id === chat.id)?.kind === "family");
  const friends = others.filter((chat) => !family.includes(chat));
  return (
    <div className="people-list">
      {partner ? (
        <ChatRow chat={partner} to="/together/chat" special />
      ) : (
        <Link to="/together" className="card people-row is-partner pressable">
          <span className="people-ava">❤️</span>
          <span className="people-copy">
            <b>{t("people.partner")}</b>
            <small>{t("people.noPartner")}</small>
          </span>
        </Link>
      )}
      {family.length ? <h3 className="tiny-head">🏡 {t("people.family")}</h3> : null}
      {family.map((chat) => (
        <ChatRow key={chat.id} chat={chat} />
      ))}
      {friends.length ? <h3 className="tiny-head">👥 {t("people.friends")}</h3> : null}
      {friends.map((chat) => (
        <ChatRow key={chat.id} chat={chat} />
      ))}
      {!others.length && contacts.status === "ready" ? (
        <button type="button" className="card people-empty pressable" onClick={onAdd}>
          <Art name="c-wave" />
          <span>
            <b>{t("people.add")}</b>
            <small>{t("people.empty")}</small>
          </span>
        </button>
      ) : null}
      <p className="tiny people-code">
        {t("people.yourCode")}: <b>{couple.me?.invite_code ?? "······"}</b> · {t("people.codeHint")}
      </p>
    </div>
  );
}

function ChatRow({ chat, to, special = false }: { chat: Conversation; to?: "/together/chat"; special?: boolean }) {
  const { t } = useTranslation();
  const messages = chat.getItems<MessageData>("msg").sort(messageOrder);
  const last = messages.at(-1);
  const unread = unreadIn(chat);
  const body = (
    <>
      <span className={`people-ava ${chat.peer.online ? "is-online" : ""}`}>
        {special ? <Art name="c-two-wink" /> : <b>{chat.peer.name.trim().charAt(0).toUpperCase() || "♥"}</b>}
        <i />
      </span>
      <span className="people-copy">
        <b>
          {special ? "❤️ " : ""}
          {chat.peer.name}
        </b>
        <small>{last ? `${last.author === myId() ? `${t("people.you")}: ` : ""}${preview(t, last)}` : t("people.noMessages")}</small>
      </span>
      <span className="people-side">
        {last ? <small>{clock(last.created_at)}</small> : null}
        {unread ? <span className="unread-badge is-small">{unread}</span> : null}
      </span>
    </>
  );
  return to ? (
    <Link to={to} className={`card people-row pressable ${special ? "is-partner" : ""}`}>
      {body}
    </Link>
  ) : (
    <Link to="/people/$personId" params={{ personId: chat.id }} className="card people-row pressable">
      {body}
    </Link>
  );
}

function AddPerson({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const couple = useCouple();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AddError | null>(null);
  const mine = couple.me?.invite_code ?? "······";
  return (
    <Sheet open={open} title={t("people.addTitle")} closeLabel={t("common.close")} onClose={onClose}>
      <Art name="c-wave" className="sheet-hero float" eager />
      <h2>{t("people.addTitle")}</h2>
      <p className="sub">{t("people.addBody")}</p>
      <div className="people-mycode">
        <small>{t("people.yourCode")}</small>
        <button
          type="button"
          className="people-code-btn"
          onClick={async () => {
            await navigator.clipboard.writeText(mine).catch(() => undefined);
            toast(t("common.copied"), "c-hug-heart");
          }}
        >
          {mine} <Glyph name="copy" size={16} />
        </button>
        <button type="button" className="link" onClick={() => void newInviteCode()}>
          <Glyph name="reset" size={14} />
        </button>
      </div>
      <form
        className="people-add"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!code.trim()) return;
          setBusy(true);
          const result = await addContact(code);
          setBusy(false);
          setError(result);
          if (!result) {
            toast(t("people.added"), "c-arms-up");
            setCode("");
            onClose();
          }
        }}
      >
        <span className="input">
          <input value={code} maxLength={12} placeholder={t("people.codePlaceholder")} onChange={(event) => setCode(event.target.value.toUpperCase())} autoCapitalize="characters" />
        </span>
        <button type="submit" className="btn" disabled={busy || !code.trim()}>
          {busy ? <span className="spinner" /> : <Glyph name="plus" size={18} />} {t("people.add")}
        </button>
      </form>
      {error ? <p className="tiny notify-error">{t(`people.errors.${error}`)}</p> : null}
    </Sheet>
  );
}

type Found = { chat: Conversation; message: CoupleItem<MessageData> };

/** Everything shared with a topic in any chat, newest first, by topic. */
function Memes() {
  const { t } = useTranslation();
  const chats = useEverything();
  const [topic, setTopic] = useState<string | null>(null);
  const [viewer, setViewer] = useState<string | null>(null);
  const [sharing, setSharing] = useState<Found | null>(null);
  const found: Found[] = chats
    .flatMap((chat) => chat.getItems<MessageData>("msg").filter((message) => message.data.topic).map((message) => ({ chat, message })))
    .sort((a, b) => b.message.created_at.localeCompare(a.message.created_at));
  const shown = topic ? found.filter((item) => item.message.data.topic === topic) : found;
  const counts = new Map<string, number>();
  for (const item of found) counts.set(item.message.data.topic!, (counts.get(item.message.data.topic!) ?? 0) + 1);
  return (
    <div className="memes">
      <p className="sub">{t("people.memesSub")}</p>
      <div className="topic-chips is-page">
        <button type="button" className={`chip ${topic === null ? "is-on" : ""}`} onClick={() => setTopic(null)}>
          {t("people.all")} · {found.length}
        </button>
        {topics.map((item) => (
          <button key={item.id} type="button" className={`chip ${topic === item.id ? "is-on" : ""}`} onClick={() => setTopic(item.id)}>
            {item.icon} {t(`people.topics.${item.id}`)}
            {counts.get(item.id) ? ` · ${counts.get(item.id)}` : ""}
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <div className="card chat-empty">
          <Art name="c-grass-laugh" />
          <p className="sub">{t("people.memesEmpty")}</p>
        </div>
      ) : null}
      <div className="meme-grid">
        {shown.map(({ chat, message }) => {
          const link = !message.data.photo && !message.data.video ? mainLink(message.data.text) : null;
          const by = message.author === myId() ? t("people.you") : chat.peer.name;
          return (
            <article key={`${chat.id}:${message.id}`} className="card meme-card">
              {message.data.photo ? <Photo path={message.data.photo.path} ratio={message.data.photo.width / message.data.photo.height} onOpen={setViewer} /> : null}
              {message.data.video ? <VideoNote path={message.data.video.path} ratio={message.data.video.width / message.data.video.height} /> : null}
              {link ? <LinkCard link={link} /> : null}
              {message.data.text ? <p className="meme-text">{message.data.text}</p> : null}
              <footer>
                <small>
                  {topicIcon(message.data.topic)} {t("people.sharedBy", { name: by, chat: chat.peer.name })}
                </small>
                <button type="button" className="btn is-sm is-ghost" onClick={() => setSharing({ chat, message })}>
                  <Glyph name="share" size={16} /> {t("people.share")}
                </button>
              </footer>
            </article>
          );
        })}
      </div>
      {sharing ? <ForwardSheet from={sharing.chat} ids={[sharing.message.id]} onClose={() => setSharing(null)} /> : null}
      {viewer ? (
        <button type="button" className="photo-viewer" onClick={() => setViewer(null)}>
          <img src={viewer} alt="" />
        </button>
      ) : null}
    </div>
  );
}
