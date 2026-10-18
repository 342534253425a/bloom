import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useCouple, useUnread } from "@/entities/couple";
import { usePrefs } from "@/entities/prefs";
import { useUser } from "@/entities/session";
import { LoveGrid } from "@/features/couple/love";
import { Reminders } from "@/features/couple/reminders";
import { PageHead, Section } from "@/shared/ui/bloom";
import { Glyph } from "@/shared/ui/glyph";
import { Art } from "@/shared/ui/kit";
import { Tour } from "@/widgets/tour/tour";
import { FocusTogether, GardenTogether, PairHabits, PairSetup, PartnerHeader, QuestionOfDay, LearnEntry, WatchEntry } from "./parts";

export function TogetherPage() {
  const { t } = useTranslation();
  const user = useUser();
  const prefs = usePrefs(user.id);
  const couple = useCouple();
  const unread = useUnread();
  const paired = Boolean(couple.partner);
  const name = couple.partner?.name || "♥";

  return (
    <div className="page">
      <Tour id="together" />
      <PageHead title={t("couple.title")} sub={t("couple.sub")} art="c-pair-hearts" help="together" back />

      {couple.status === "loading" || couple.status === "idle" ? (
        <section className="card skeleton" />
      ) : !paired ? (
        <PairSetup />
      ) : (
        <>
          <PartnerHeader />
          <div className="duo-actions">
            <WatchEntry />
            <LearnEntry />
            <Link to="/together/chat" className="card chat-entry rise" data-tour="together-chat">
              <span className="watch-entry-icon is-chat">💌</span>
              <span>
                <strong className="heading">{t("couple.hub.chat")}</strong>
                <small>{unread ? t("couple.hub.unread", { count: unread }) : t("couple.hub.chatBody")}</small>
              </span>
              {unread ? <span className="unread-badge">{unread}</span> : <Glyph name="chevron" size={18} stroke={2.4} />}
            </Link>
          </div>

          <Section title={t("couple.hub.love")} tour="together-love">
            <p className="sub sect-sub">{t("couple.hub.loveBody", { name })}</p>
            <section className="card love-card rise">
              <LoveGrid />
            </section>
          </Section>

          <div className="two-col">
            <div className="side-stack">
              <QuestionOfDay />
              <PairHabits />
            </div>
            <div className="side-stack">
              <FocusTogether />
              <GardenTogether />
            </div>
          </div>
        </>
      )}

      <div className="two-col">
        <div className="side-stack">{prefs ? <Reminders userId={user.id} prefs={prefs} /> : null}</div>
        <div className="side-stack">
          <Section title={t("privacy.modules")}>
            <Link to="/privacy" className="card settings-link pressable rise">
              <Art name="i-shield" className="row-icon" />
              <span>
                <strong>{t("together.manage")}</strong>
                <small>{t("together.never")}</small>
              </span>
              <Glyph name="chevron" size={18} stroke={2.4} />
            </Link>
          </Section>
        </div>
      </div>
    </div>
  );
}
