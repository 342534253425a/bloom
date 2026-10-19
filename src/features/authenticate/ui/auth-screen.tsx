import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { setAuthState } from "@/entities/session";
import { currentLang, setLocale } from "@/shared/i18n";
import { isDomainError, type DomainCode } from "@/shared/lib/errors";
import { burst, haptic, shake } from "@/shared/lib/motion/fx";
import { Glyph } from "@/shared/ui/glyph";
import { Art, Segmented } from "@/shared/ui/kit";
import { InstallButton } from "@/widgets/install/install";
import { loginAccount, registerAccount, resendConfirmation, sendMagicLink, sendPasswordReset, signInWithGoogle, verifyCode } from "../api/authenticate";
import { setRecovering } from "../model/recovery";

type Mode = "login" | "register";
type Screen = "form" | "confirm" | "reset" | "resetSent" | "linkSent";
type Errors = Partial<Record<"name" | "email" | "password", string>>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function AuthScreen({ initialMode = "login", onBack }: { initialMode?: Mode; onBack?: () => void } = {}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [screen, setScreen] = useState<Screen>("form");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [reveal, setReveal] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [resent, setResent] = useState(false);
  // Every new email voids the previous code, so sending is limited to once a minute per address.
  const lastSend = useRef<{ email: string; at: number } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const cooldown = lastSend.current ? Math.max(0, Math.ceil((lastSend.current.at + 60_000 - now) / 1000)) : 0;
  useEffect(() => {
    if (!cooldown) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);
  const markSent = () => {
    lastSend.current = { email: email.trim().toLowerCase(), at: Date.now() };
    setNow(Date.now());
  };
  const recentlySent = () => Boolean(lastSend.current && lastSend.current.email === email.trim().toLowerCase() && Date.now() - lastSend.current.at < 60_000);
  const [code, setCode] = useState("");
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
    if (screen === "confirm" || screen === "resetSent" || screen === "linkSent") {
      const digits = code.replace(/\D/g, "");
      if (digits.length < 6) {
        fail(t("auth.codeNeed"));
        return;
      }
      setPending(true);
      try {
        const kind = screen === "confirm" ? "signup" : screen === "linkSent" ? "email" : "recovery";
        const user = await verifyCode(email, digits, kind);
        // After a reset code the person chooses a new password right away.
        if (kind === "recovery") setRecovering(true);
        await finish(user);
      } catch (error) {
        fail(isDomainError(error) && error.code === "code-invalid" ? t("auth.codeInvalid") : explain(error));
        setCode("");
      } finally {
        setPending(false);
      }
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
        markSent();
        setCode("");
        setScreen("resetSent");
        return;
      }
      if (mode === "login") {
        try {
          await finish(await loginAccount({ email, password }));
        } catch (error) {
          if (isDomainError(error) && error.code === "email-unconfirmed") {
            if (!recentlySent()) await resendConfirmation(email).then(markSent).catch(() => undefined);
            setCode("");
            setScreen("confirm");
            return;
          }
          throw error;
        }
        return;
      }
      const user = await registerAccount({ name, email, password });
      if (user) await finish(user);
      else {
        markSent();
        setCode("");
        setScreen("confirm");
      }
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
    linkSent: t("auth.magicTitle"),
  };
  const ledes: Record<Screen, string> = {
    form: mode === "login" ? t("auth.welcomeBody") : t("auth.createBody"),
    confirm: t("auth.confirmBody", { email: email.trim() }),
    reset: t("auth.resetBody"),
    resetSent: t("auth.resetSentBody", { email: email.trim() }),
    linkSent: t("auth.magicBody", { email: email.trim() }),
  };
  const action = pending
    ? mode === "register" && screen === "form"
      ? t("auth.creating")
      : t("auth.signingIn")
    : screen === "confirm" || screen === "resetSent" || screen === "linkSent"
      ? t("auth.codeVerify")
      : screen === "reset"
        ? t("auth.resetSend")
        : mode === "login"
          ? t("auth.signIn")
          : t("auth.create");
  const showFields = screen === "form" || screen === "reset";

  async function google() {
    setFormError(null);
    setPending(true);
    try {
      await signInWithGoogle();
    } catch {
      fail(t("auth.googleFailed"));
      setPending(false);
    }
  }

  async function magic() {
    setFormError(null);
    if (!EMAIL.test(email.trim())) {
      fail(t("auth.magicNeedEmail"), { email: t("auth.emailInvalid") });
      return;
    }
    setErrors({});
    if (recentlySent()) {
      setScreen("linkSent");
      return;
    }
    setPending(true);
    try {
      await sendMagicLink(email, mode === "register" ? name : undefined);
      markSent();
      setCode("");
      setScreen("linkSent");
    } catch (error) {
      fail(explain(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="viewport is-bare auth">
      <div className="auth-sky">
        {onBack ? (
          <button type="button" className="round-btn auth-back" aria-label={t("common.back")} onClick={onBack}>
            <Glyph name="back" size={20} stroke={2.4} />
          </button>
        ) : null}
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

        {screen === "confirm" || screen === "resetSent" || screen === "linkSent" ? (
          <label className="auth-code">
            <span className="sr-only">{t("auth.codeLabel")}</span>
            <input
              value={code}
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={8}
              autoFocus
              placeholder="••••••"
              aria-label={t("auth.codeLabel")}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 8))}
            />
          </label>
        ) : null}
        {screen === "confirm" || screen === "resetSent" || screen === "linkSent" ? <p className="tiny auth-code-hint">{t("auth.codeLatest")}</p> : null}

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

        {screen === "form" ? (
          <div className="auth-alt">
            <span className="auth-or">{t("auth.or")}</span>
            <button type="button" className="btn is-ghost is-block auth-google" disabled={pending} onClick={() => void google()}>
              <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
                <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
                <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
                <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
              </svg>
              {t("auth.google")}
            </button>
            <button type="button" className="btn is-ghost is-block" disabled={pending} onClick={() => void magic()}>
              <Glyph name="mail" size={19} />
              {t("auth.magic")}
            </button>
          </div>
        ) : null}

        {screen === "confirm" || screen === "linkSent" || screen === "resetSent" ? (
          <div className="auth-links is-split">
            <button
              className="link is-muted"
              type="button"
              onClick={() => {
                setFormError(null);
                setCode("");
                setResent(false);
                setScreen(screen === "resetSent" ? "reset" : "form");
              }}
            >
              {t("common.back")}
            </button>
            <button
              className="link"
              type="button"
              disabled={cooldown > 0 || pending}
              onClick={async () => {
                setPending(true);
                try {
                  if (screen === "confirm") await resendConfirmation(email);
                  else if (screen === "linkSent") await sendMagicLink(email);
                  else await sendPasswordReset(email);
                  markSent();
                  setResent(true);
                  setCode("");
                  setFormError(null);
                } catch (error) {
                  fail(explain(error));
                } finally {
                  setPending(false);
                }
              }}
            >
              {cooldown > 0 ? t("auth.resendIn", { seconds: cooldown }) : resent ? t("auth.resent") : t("auth.codeResend")}
            </button>
          </div>
        ) : screen === "form" && mode === "login" ? (
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
