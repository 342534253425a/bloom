import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { setActivity, useCouple } from "@/entities/couple";
import { PARTNER, removeContact, setContactKind, useContacts, useConversation } from "@/entities/chat";
import { encryptedWith, useE2E } from "@/entities/e2e";
import { ChatThread } from "@/features/couple/chat-thread";
import { CallButtons } from "@/features/call/call-host";
import { LoveGrid } from "@/features/couple/love";
import { Glyph } from "@/shared/ui/glyph";
import { Art } from "@/shared/ui/kit";

/** The partner's chat (special: love effects, cinema, "together" status). */
export function ChatPage() {
  return <ChatScreen id={PARTNER} />;
}

/** A chat with a friend or family member. */
export function PersonChatPage() {
  const { personId } = useParams({ strict: false }) as { personId?: string };
  return <ChatScreen id={personId ?? ""} />;
}

function ChatScreen({ id }: { id: string }) {
  const { t } = useTranslation();
  const couple = useCouple();
  const contacts = useContacts();
  const navigate = useNavigate();
  const conv = useConversation(id);
  const [loveOpen, setLoveOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const partner = id === PARTNER;
  const e2e = useE2E();
  const [secure, setSecure] = useState(false);
  const peerId = conv?.peer.id;
  // Both have keys: messages here are end-to-end encrypted.
  useEffect(() => {
    if (!peerId) return;
    let alive = true;
    void encryptedWith(peerId).then((value) => alive && setSecure(value));
    return () => {
      alive = false;
    };
  }, [peerId, e2e.status]);
  const contact = partner ? undefined : contacts.list.find((item) => item.id === id);

  useEffect(() => {
    setActivity("chat");
  }, []);

  if (!conv) {
    if (!partner && contacts.status !== "ready") return <div className="page" />;
    return (
      <div className="page">
        <div className="empty-state">
          <Art name="c-pair-hearts" className="empty-art" />
          <Link to={partner ? "/together" : "/people"} className="btn">
            {partner ? t("couple.pair.connect") : t("people.title")}
          </Link>
        </div>
      </div>
    );
  }

  const presence = couple.presence;
  const status = partner
    ? presence.online
      ? t(`couple.presence.activity.${presence.activity ?? "other"}`)
      : t("couple.presence.offline")
    : conv.peer.online
      ? t("people.online")
      : contact?.kind === "family"
        ? t("people.family")
        : t("people.offline");

  return (
    <div className="chat-page">
      <header className="chat-head">
        <Link to={partner ? "/together" : "/people"} className="round-btn" aria-label={t("common.back")}>
          <Glyph name="back" size={20} stroke={2.4} />
        </Link>
        <span className={`partner-ava is-small ${conv.peer.online ? "is-online" : ""} ${partner ? "" : "is-letter"}`}>
          {partner ? <Art name="c-two-wink" /> : <b>{conv.peer.name.trim().charAt(0).toUpperCase() || "♥"}</b>}
          <i />
        </span>
        <span className="chat-head-copy">
          <strong>{conv.peer.name}</strong>
          <small title={secure ? t("people.e2e.badge") : undefined}>
            {secure ? "🔒 " : ""}
            {status}
          </small>
        </span>
        <CallButtons conv={conv} />
        <button type="button" className="round-btn" aria-label={t("couple.chat.search")} onClick={() => setSearchOpen(!searchOpen)}>
          <Glyph name="search" size={20} />
        </button>
        {partner ? (
          <>
            <Link to="/watch" className="round-btn" aria-label={t("couple.hub.watch")}>
              🍿
            </Link>
            <button type="button" className={`round-btn ${loveOpen ? "is-help" : ""}`} aria-label={t("couple.hub.love")} onClick={() => setLoveOpen(!loveOpen)}>
              💗
            </button>
          </>
        ) : (
          <span className="chat-head-more">
            <button type="button" className="round-btn" aria-label={t("common.more")} aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>
              <Glyph name="more" size={20} />
            </button>
            {menuOpen && contact ? (
              <span className="chat-head-menu" onClick={() => setMenuOpen(false)}>
                <button type="button" onClick={() => void setContactKind(contact.id, contact.kind === "family" ? "friend" : "family")}>
                  {contact.kind === "family" ? `👥 ${t("people.makeFriend")}` : `🏡 ${t("people.makeFamily")}`}
                </button>
                <small>{t("people.familyHint")}</small>
                <button
                  type="button"
                  className="is-danger"
                  onClick={() => {
                    if (!window.confirm(t("people.removeConfirm", { name: contact.name }))) return;
                    void removeContact(contact.id).then(() => navigate({ to: "/people" }));
                  }}
                >
                  🗑 {t("people.remove")}
                </button>
              </span>
            ) : null}
          </span>
        )}
      </header>
      {loveOpen && partner ? (
        <div className="chat-love">
          <LoveGrid />
        </div>
      ) : null}
      <ChatThread key={conv.id} conv={conv} searchOpen={searchOpen} onSearchClose={() => setSearchOpen(false)} />
    </div>
  );
}
