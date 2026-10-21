import { Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { setActivity, useCouple } from "@/entities/couple";
import { ChatThread } from "@/features/couple/chat-thread";
import { CallButtons } from "@/features/call/call-host";
import { LoveGrid } from "@/features/couple/love";
import { Glyph } from "@/shared/ui/glyph";
import { Art } from "@/shared/ui/kit";
import { useState } from "react";

export function ChatPage() {
  const { t } = useTranslation();
  const couple = useCouple();
  const [loveOpen, setLoveOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const name = couple.partner?.name || "♥";
  const presence = couple.presence;

  useEffect(() => {
    setActivity("chat");
  }, []);

  if (!couple.partner) {
    return (
      <div className="page">
        <div className="empty-state">
          <Art name="c-pair-hearts" className="empty-art" />
          <Link to="/together" className="btn">
            {t("couple.pair.connect")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-page">
      <header className="chat-head">
        <Link to="/together" className="round-btn" aria-label={t("common.back")}>
          <Glyph name="back" size={20} stroke={2.4} />
        </Link>
        <span className={`partner-ava is-small ${presence.online ? "is-online" : ""}`}>
          <Art name="c-two-wink" />
          <i />
        </span>
        <span className="chat-head-copy">
          <strong>{name}</strong>
          <small>{presence.online ? t(`couple.presence.activity.${presence.activity ?? "other"}`) : t("couple.presence.offline")}</small>
        </span>
        <CallButtons />
        <button type="button" className="round-btn" aria-label={t("couple.chat.search")} onClick={() => setSearchOpen(!searchOpen)}>
          <Glyph name="search" size={20} />
        </button>
        <Link to="/watch" className="round-btn" aria-label={t("couple.hub.watch")}>
          🍿
        </Link>
        <button type="button" className={`round-btn ${loveOpen ? "is-help" : ""}`} aria-label={t("couple.hub.love")} onClick={() => setLoveOpen(!loveOpen)}>
          💗
        </button>
      </header>
      {loveOpen ? (
        <div className="chat-love">
          <LoveGrid />
        </div>
      ) : null}
      <ChatThread searchOpen={searchOpen} onSearchClose={() => setSearchOpen(false)} />
    </div>
  );
}
