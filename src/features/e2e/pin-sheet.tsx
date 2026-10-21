import { useState } from "react";
import { useTranslation } from "react-i18next";
import { closePin, createKey, resetKey, unlock, useE2E, type UnlockError } from "@/entities/e2e";
import { Glyph } from "@/shared/ui/glyph";
import { Art, toast } from "@/shared/ui/kit";
import { Sheet } from "@/shared/ui/sheet";

/**
 * End-to-end encryption, the person's side: create a PIN (first device), enter it (a new device),
 * or start over with a new key when the PIN is forgotten. Mounted once in the app shell.
 */
export function PinSheet() {
  const { t } = useTranslation();
  const e2e = useE2E();
  const [resetting, setResetting] = useState(false);
  const open = e2e.asking && (e2e.status === "setup" || e2e.status === "locked");
  const mode = e2e.status === "setup" || resetting ? "create" : "unlock";
  const title = mode === "create" ? (resetting ? t("people.e2e.resetTitle") : t("people.e2e.setupTitle")) : t("people.e2e.unlockTitle");
  return (
    <Sheet
      open={open}
      title={title}
      closeLabel={t("common.close")}
      onClose={() => {
        setResetting(false);
        closePin();
      }}
    >
      <Art name="c-hug-heart" className="sheet-hero float" eager />
      <h2>🔒 {title}</h2>
      {mode === "create" ? (
        <CreatePin resetting={resetting} onDone={() => setResetting(false)} />
      ) : (
        <EnterPin onForgot={() => setResetting(true)} />
      )}
    </Sheet>
  );
}

function CreatePin({ resetting, onDone }: { resetting: boolean; onDone: () => void }) {
  const { t } = useTranslation();
  const [pin, setPin] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <form
      className="pin-form"
      onSubmit={async (event) => {
        event.preventDefault();
        if (pin.length < 6) return setError(t("people.e2e.tooShort"));
        if (pin !== again) return setError(t("people.e2e.mismatch"));
        setBusy(true);
        setError("");
        try {
          await (resetting ? resetKey(pin) : createKey(pin));
          toast(t("people.e2e.on"), "c-hug-heart");
          onDone();
        } catch {
          setError(t("people.e2e.offline"));
        } finally {
          setBusy(false);
        }
      }}
    >
      <p className="sub">{resetting ? t("people.e2e.resetBody") : t("people.e2e.setupBody")}</p>
      <span className="input">
        <input type="password" autoComplete="new-password" inputMode="text" value={pin} placeholder={t("people.e2e.pin")} onChange={(event) => setPin(event.target.value)} autoFocus />
      </span>
      <span className="input">
        <input type="password" autoComplete="new-password" value={again} placeholder={t("people.e2e.pinAgain")} onChange={(event) => setAgain(event.target.value)} />
      </span>
      <p className="tiny">{t("people.e2e.pinHint")}</p>
      {error ? <p className="tiny notify-error">{error}</p> : null}
      <button type="submit" className="btn" disabled={busy}>
        {busy ? <span className="spinner" /> : <Glyph name="lock" size={18} />} {resetting ? t("people.e2e.reset") : t("people.e2e.create")}
      </button>
      <button type="button" className="btn is-ghost" onClick={closePin}>
        {t("people.e2e.later")}
      </button>
    </form>
  );
}

function EnterPin({ onForgot }: { onForgot: () => void }) {
  const { t } = useTranslation();
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<UnlockError | null>(null);
  return (
    <form
      className="pin-form"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!pin) return;
        setBusy(true);
        const result = await unlock(pin);
        setBusy(false);
        setError(result);
        if (!result) toast(t("people.e2e.on"), "c-hug-heart");
      }}
    >
      <p className="sub">{t("people.e2e.unlockBody")}</p>
      <span className="input">
        <input type="password" autoComplete="current-password" value={pin} placeholder={t("people.e2e.pin")} onChange={(event) => setPin(event.target.value)} autoFocus />
      </span>
      {error ? <p className="tiny notify-error">{error === "wrong-pin" ? t("people.e2e.wrong") : t("people.e2e.offline")}</p> : null}
      <button type="submit" className="btn" disabled={busy || !pin}>
        {busy ? <span className="spinner" /> : <Glyph name="lock" size={18} />} {t("people.e2e.unlock")}
      </button>
      <button type="button" className="btn is-ghost" onClick={closePin}>
        {t("people.e2e.later")}
      </button>
      <button type="button" className="link pin-forgot" onClick={onForgot}>
        {t("people.e2e.forgot")}
      </button>
    </form>
  );
}
