import { useState } from "react";
import { useTranslation } from "react-i18next";
import { changePassword, setRecovering, useRecovering } from "@/features/authenticate";
import { Field } from "@/shared/ui/bloom";
import { Art, toast } from "@/shared/ui/kit";
import { Sheet } from "@/shared/ui/sheet";

/** Shown after opening a password-reset link: Supabase has signed the person in, now they pick a new password. */
export function RecoverySheet() {
  const { t } = useTranslation();
  const open = useRecovering();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <Sheet open={open} title={t("auth.newPassword")} closeLabel={t("common.cancel")} onClose={() => setRecovering(false)}>
      <Art name="o-lock-flower" className="sheet-hero float" eager />
      <h2>{t("auth.newPassword")}</h2>
      <p className="sub">{t("auth.newPasswordBody")}</p>
      <Field label={t("auth.password")}>
        <span className="input">
          <input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} />
        </span>
      </Field>
      {error ? <p className="field-error">{error}</p> : null}
      <button
        type="button"
        className="btn is-block"
        onClick={async () => {
          if (password.length < 8) {
            setError(t("auth.passwordShort"));
            return;
          }
          try {
            await changePassword(password);
            setRecovering(false);
            setPassword("");
            toast(t("auth.passwordSaved"), "c-hug-heart");
          } catch {
            setError(t("auth.offline"));
          }
        }}
      >
        {t("common.save")}
      </button>
    </Sheet>
  );
}
