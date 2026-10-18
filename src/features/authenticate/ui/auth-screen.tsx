import { useNavigate } from "@tanstack/react-router";
import { useRef, useState, type CSSProperties, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { setAuthState } from "@/entities/session";
import { currentLang, setLocale } from "@/shared/i18n";
import { isDomainError, type DomainCode } from "@/shared/lib/errors";
import { burst, haptic, shake } from "@/shared/lib/motion/fx";
import { Glyph } from "@/shared/ui/glyph";
import { Art, Segmented } from "@/shared/ui/kit";
import { InstallButton } from "@/widgets/install/install";
import { loginAccount, registerAccount, sendPasswordReset } from "../api/authenticate";

type Mode = "login" | "register";
type Screen = "form" | "confirm" | "reset" | "resetSent";
type Errors = Partial<Record<"name" | "email" | "password", string>>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function AuthScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("login");
  const [screen, setScreen] = useState<Screen>("form");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [reveal, setReveal] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const card = useRef<HTMLFormElement>(null);
  const submit = useRef<HTMLButtonElement>(null);

  function explain(error: unknown) {
    if (!isDomainError(error)) return t("auth.offline");
    const copy: Partial<Record<DomainCode, string>> = {
      "email-taken": t("auth.taken"),
      "invalid-credentials": t("auth.invalid"),
      "email-unconfirmed": t("auth.unconfirmed"),
      "code-limited": t("auth.codeLimited"),
      offline: t("auth.offline"),
    };
    return copy[error.code] ?? t("auth.offline");
  }

  function fail(message: string | null, next: Errors = {}) {
    setErrors(next);
    setFormError(message);
    shake(card.current);
    haptic([12, 40, 12]);
  }

  function validate(): Errors {
    const next: Errors = {};
    if (mode === "register" && screen === "form" && !name.trim()) next.name = t("auth.nameRequired");
    if (!EMAIL.test(email.trim())) next.email = t("auth.emailInvalid");
    if (screen === "form" && password.length < 8) next.password = t("auth.passwordShort");
    return next;
  }

  async function finish(user: Awaited<ReturnType<typeof loginAccount>>) {
    burst(submit.current, { count: 26, spread: 120 });
    haptic([10, 50, 14]);
    setAuthState({ status: "authenticated", user });
    await navigate({ to: "/" });
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setFormError(null);
    if (screen === "confirm" || screen === "resetSent") {
      setMode("login");
      setScreen("form");
      return;
    }
    const found = validate();
    if (Object.keys(found).length > 0) {
      fail(null, found);
      return;
    }
    setErrors({});
    setPending(true);
    try {
      if (screen === "reset") {
        await sendPasswordReset(email);
        setScreen("resetSent");
        return;
      }
      if (mode === "login") {
        await finish(await loginAccount({ email, password }));
        return;
      }
      const user = await registerAccount({ name, email, password });
      if (user) await finish(user);
      else setScreen("confirm");
    } catch (error) {
      if (!isDomainError(error)) console.error(error);
      fail(explain(error));
    } finally {
      setPending(false);
    }
  }

  const titles: Record<Screen, string> = {
    form: mode === "login" ? t("auth.welcome") : t("auth.createTitle"),
    confirm: t("auth.confirmTitle"),
    reset: t("auth.resetTitle"),
    resetSent: t("auth.resetSentTitle"),
  };
  const ledes: Record<Screen, string> = {
    form: mode === "login" ? t("auth.welcomeBody") : t("auth.createBody"),
    confirm: t("auth.confirmBody", { email: email.trim() }),
    reset: t("auth.resetBody"),
    resetSent: t("auth.resetSentBody", { email: email.trim() }),
  };
  const action = pending
    ? mode === "register" && screen === "form"
      ? t("auth.creating")
      : t("auth.signingIn")
    : screen === "confirm" || screen === "resetSent"
      ? t("auth.toSignIn")
      : screen === "reset"
        ? t("auth.resetSend")
        : mode === "login"
          ? t("auth.signIn")
          : t("auth.create");
  const showFields = screen === "form" || screen === "reset";

  return (
    <main className="viewport is-bare auth">
      <div className="auth-sky">
        <Art name="s-meadow-lake" className="auth-scene" eager />
        <div className="auth-brand rise" style={{ "--i": 0 } as CSSProperties}>
          <span className="wordmark">
            <Glyph name="sprout" size={30} stroke={2.4} className="wordmark-leaf" />
            bloom
          </span>
          <p>{t("tagline")}</p>
        </div>
        <ul className="auth-points">
          {(["spaces", "sync", "private"] as const).map((key, index) => (
            <li key={key} className="rise" style={{ "--i": index + 2 } as CSSProperties}>
              <span className="auth-point-icon">
                <Glyph name={key === "spaces" ? "grid" : key === "sync" ? "reset" : "shield"} size={20} stroke={2.2} />
              </span>
              <span>
                <strong>{t(`auth.points.${key}`)}</strong>
                <small>{t(`auth.points.${key}Body`)}</small>
              </span>
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="auth-lang"
          onClick={() => setLocale(currentLang() === "en" ? "ru" : currentLang() === "ru" ? "zh" : "en")}
          aria-label={t("more.language")}
        >
          <Glyph name="globe" size={16} stroke={2.2} />
          {{ en: "EN", ru: "RU", zh: "中文" }[currentLang()]}
        </button>
      </div>

      <form ref={card} className="auth-card rise" style={{ "--i": 1 } as CSSProperties} noValidate onSubmit={(event) => void onSubmit(event)}>
        <Art name={screen === "form" ? "c-wave" : "c-hug-heart"} className="auth-mascot float" eager />

        {screen === "form" ? (
          <Segmented
            label={t("auth.welcome")}
            value={mode}
            onChange={(next) => {
              setMode(next);
              setErrors({});
              setFormError(null);
            }}
            options={[
              { id: "login", label: t("ui.auth.signIn") },
              { id: "register", label: t("ui.auth.signUp") },
            ]}
          />
        ) : null}

        <div className="auth-head" key={`head-${mode}-${screen}`}>
          <h1 className="title">{titles[screen]}</h1>
          <p className="sub">{ledes[screen]}</p>
        </div>

        {showFields ? (
          <div className="auth-fields" key={`fields-${mode}-${screen}`}>
            {mode === "register" && screen === "form" ? (
              <label className="field">
                <span className={`input ${errors.name ? "is-error" : ""}`}>
                  <Glyph name="user" size={20} />
                  <input autoComplete="name" placeholder={t("auth.name")} aria-label={t("auth.name")} value={name} maxLength={40} onChange={(event) => setName(event.target.value)} />
                </span>
                {errors.name ? <span className="field-error">{errors.name}</span> : null}
              </label>
            ) : null}
            <label className="field">
              <span className={`input ${errors.email ? "is-error" : ""}`}>
                <Glyph name="mail" size={20} />
                <input
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  placeholder={t("auth.email")}
                  aria-label={t("auth.email")}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </span>
              {errors.email ? <span className="field-error">{errors.email}</span> : null}
            </label>
            {screen === "form" ? (
              <label className="field">
                <span className={`input ${errors.password ? "is-error" : ""}`}>
                  <Glyph name="lock" size={20} />
                  <input
                    type={reveal ? "text" : "password"}
                    autoComplete={mode === "login" ? "current-password" : "new-password"}
                    placeholder={t("auth.password")}
                    aria-label={t("auth.password")}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                  <button type="button" className="input-action" aria-label={reveal ? t("ui.auth.hide") : t("ui.auth.show")} onClick={() => setReveal((value) => !value)}>
                    <Glyph name={reveal ? "eyeOff" : "eye"} size={19} />
                  </button>
                </span>
                {errors.password ? <span className="field-error">{errors.password}</span> : null}
              </label>
            ) : null}
          </div>
        ) : null}

        {formError ? (
          <p className="form-alert" role="alert">
            <Glyph name="sparkle" size={16} />
            {formError}
          </p>
        ) : null}

        <button ref={submit} className="btn is-block" type="submit" disabled={pending}>
          {pending ? <span className="spinner" aria-hidden="true" /> : null}
          {action}
        </button>

        {screen === "form" && mode === "login" ? (
          <div className="auth-links">
            <button
              className="link"
              type="button"
              onClick={() => {
                setFormError(null);
                setErrors({});
                setScreen("reset");
              }}
            >
              {t("auth.forgot")}
            </button>
          </div>
        ) : screen === "reset" ? (
          <div className="auth-links">
            <button className="link is-muted" type="button" onClick={() => setScreen("form")}>
              {t("common.back")}
            </button>
          </div>
        ) : (
          <p className="auth-note tiny">
            <Glyph name="shield" size={15} />
            {t("ui.auth.private")}
          </p>
        )}
      </form>
      <div className="auth-install">
        <InstallButton className="btn is-soft is-sm" />
      </div>
    </main>
  );
}
