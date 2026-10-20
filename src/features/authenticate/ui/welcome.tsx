import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { currentLang, setLocale } from "@/shared/i18n";
import { Glyph } from "@/shared/ui/glyph";
import { InstallButton } from "@/widgets/install/install";

type Mode = "login" | "register";

const delay = (i: number) => ({ "--i": i }) as CSSProperties;

/** The first screen people see: what Bloom is, with a way to create an account or sign in. */
export function WelcomeScreen({ onStart }: { onStart: (mode: Mode) => void }) {
  const { t } = useTranslation();

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
          <p className="welcome-tags rise" style={delay(5)}>
            {t("welcome.tags")}
          </p>
          <div className="welcome-install-phone rise" style={delay(6)}>
            <InstallButton className="btn is-soft is-sm" />
          </div>
        </section>
      </div>
    </main>
  );
}
