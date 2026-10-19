import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { moodArt } from "@/shared/lib/art/look";
import { currentLang, setLocale } from "@/shared/i18n";
import { Glyph } from "@/shared/ui/glyph";
import { Art } from "@/shared/ui/kit";
import { InstallButton } from "@/widgets/install/install";

type Mode = "login" | "register";

const delay = (i: number) => ({ "--i": i }) as CSSProperties;

/** The first screen people see: what Bloom is, with a way to create an account or sign in. */
export function WelcomeScreen({ onStart }: { onStart: (mode: Mode) => void }) {
  const { t } = useTranslation();
  const moods = ["happy", "calm", "okay", "tired", "anxious"] as const;

  return (
    <main className="viewport is-bare welcome">
      <div className="welcome-bg" aria-hidden="true" />

      <header className="welcome-top rise" style={delay(0)}>
        <span className="wordmark">
          <Glyph name="sprout" size={28} stroke={2.4} className="wordmark-leaf" />
          bloom
        </span>
        <div className="welcome-top-actions">
          <button
            type="button"
            className="welcome-lang"
            aria-label={t("more.language")}
            onClick={() => setLocale(currentLang() === "en" ? "ru" : currentLang() === "ru" ? "zh" : "en")}
          >
            <Glyph name="globe" size={16} stroke={2.2} />
            {{ en: "EN", ru: "RU", zh: "中文" }[currentLang()]}
          </button>
          <InstallButton className="btn is-soft is-sm welcome-install" />
          <span className="welcome-have">{t("welcome.haveAccount")}</span>
          <button type="button" className="welcome-signin" onClick={() => onStart("login")}>
            {t("welcome.signIn")}
          </button>
        </div>
      </header>

      <div className="welcome-body">
        <section className="welcome-hero">
          <p className="welcome-eyebrow rise" style={delay(1)}>
            {t("welcome.eyebrow")}
          </p>
          <h1 className="welcome-title rise" style={delay(2)}>
            {t("welcome.title")}
            <span className="welcome-sprout" aria-hidden="true">
              <Glyph name="sprout" size={44} stroke={2.2} />
            </span>
          </h1>
          <p className="welcome-lede rise" style={delay(3)}>
            {t("welcome.body")}
          </p>
          <div className="welcome-ctas rise" style={delay(4)}>
            <button type="button" className="btn welcome-primary" onClick={() => onStart("register")}>
              {t("welcome.create")}
              <Glyph name="chevron" size={20} stroke={2.8} />
            </button>
            <button type="button" className="btn is-ghost welcome-secondary" onClick={() => onStart("login")}>
              {t("welcome.signInInstead")}
            </button>
          </div>
          <div className="welcome-install-phone">
            <InstallButton className="btn is-soft is-sm" />
          </div>
          <Art name="c-hug-heart" className="welcome-mascot float" eager />
        </section>

        <section className="welcome-cards" aria-label={t("welcome.more")}>
          <article className="welcome-card tone-mint rise" style={delay(3)}>
            <CardHead icon="🌱" title={t("welcome.habits")} body={t("welcome.habitsBody")} />
            <ul className="wc-habits">
              <li className="is-done">
                <i>
                  <Glyph name="check" size={14} stroke={3.2} />
                </i>
                {t("welcome.habit1")}
                <span>💧</span>
              </li>
              <li>
                <i />
                {t("welcome.habit2")}
                <span>👟</span>
              </li>
              <li>
                <i />
                {t("welcome.habit3")}
                <span>❤️</span>
              </li>
            </ul>
          </article>

          <article className="welcome-card tone-lav rise" style={delay(4)}>
            <CardHead icon="🙂" title={t("welcome.mood")} body={t("welcome.moodBody")} />
            <div className="wc-moods">
              {moods.map((mood) => (
                <span key={mood}>
                  <Art name={moodArt[mood]} />
                  <small>{t(`body.moods.${mood}`)}</small>
                </span>
              ))}
            </div>
          </article>

          <article className="welcome-card tone-pink rise" style={delay(5)}>
            <CardHead icon="🔥" title={t("welcome.focus")} body={t("welcome.focusBody")} />
            <div className="wc-focus">
              <span>
                <b>25:00</b>
                <small>{t("welcome.focusLabel")}</small>
              </span>
              <i className="wc-play">
                <Glyph name="play" size={26} />
              </i>
            </div>
          </article>

          <article className="welcome-card tone-sky rise" style={delay(6)}>
            <CardHead icon="🎯" title={t("welcome.goals")} body={t("welcome.goalsBody")} />
            <div className="wc-goal">
              <Art name="o-sprout-soil" />
              <span>
                <strong>{t("welcome.goalExample")}</strong>
                <span className="wc-bar">
                  <i style={{ width: "65%" }} />
                </span>
                <small>{t("welcome.goalSteps")}</small>
              </span>
              <b>65%</b>
            </div>
          </article>

          <article className="welcome-card tone-peach rise" style={delay(7)}>
            <CardHead icon="🌸" title={t("welcome.reflect")} body={t("welcome.reflectBody")} />
            <div className="wc-reflect">
              <Glyph name="pencil" size={18} />
              <span>
                {t("welcome.reflectPrompt")}
                <i />
                <i />
              </span>
            </div>
          </article>

          <article className="welcome-card tone-sun wc-garden-card rise" style={delay(8)}>
            <CardHead icon="🪴" title={t("welcome.garden")} body={t("welcome.gardenBody")} />
            <Art name="c-peek-daisies" className="wc-garden-art" />
          </article>

          <p className="welcome-more rise" style={delay(9)}>
            ✨ {t("welcome.more")}
          </p>
        </section>
      </div>
    </main>
  );
}

function CardHead({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div className="wc-head">
      <span className="wc-icon">{icon}</span>
      <span>
        <strong>{title}</strong>
        <small>{body}</small>
      </span>
    </div>
  );
}
