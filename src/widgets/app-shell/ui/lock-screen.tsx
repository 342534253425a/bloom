import { useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { setAuthState, useUser } from "@/entities/session";
import { checkPasscode } from "@/entities/space";
import { logoutAccount } from "@/features/authenticate";
import { haptic, shake } from "@/shared/lib/motion/fx";
import { Glyph } from "@/shared/ui/glyph";
import { Art } from "@/shared/ui/kit";

export function PinPad({ value, onChange, onComplete }: { value: string; onChange: (next: string) => void; onComplete: (code: string) => void }) {
  const press = (digit: string) => {
    haptic(5);
    const next = (value + digit).slice(0, 4);
    onChange(next);
    if (next.length === 4) window.setTimeout(() => onComplete(next), 120);
  };
  return (
    <div className="pin">
      <div className="pin-dots" aria-live="polite">
        {[0, 1, 2, 3].map((index) => (
          <i key={index} className={index < value.length ? "is-on" : ""} />
        ))}
      </div>
      <div className="pin-pad">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
          <button key={digit} type="button" onClick={() => press(digit)}>
            {digit}
          </button>
        ))}
        <span />
        <button type="button" onClick={() => press("0")}>
          0
        </button>
        <button type="button" aria-label="⌫" onClick={() => onChange(value.slice(0, -1))}>
          <Glyph name="back" size={22} stroke={2.2} />
        </button>
      </div>
    </div>
  );
}

export function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const { t } = useTranslation();
  const user = useUser();
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [error, setError] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  async function attempt(next: string) {
    if (await checkPasscode(user.id, next)) {
      sessionStorage.setItem("bloom.unlocked", user.id);
      onUnlock();
      return;
    }
    setError(true);
    setCode("");
    shake(box.current);
    haptic([12, 40, 12]);
  }

  return (
    <div className="lock">
      <div className="lock-card" ref={box}>
        <Art name="o-lock-flower" className="lock-art float" eager />
        <h1 className="title">{t("privacy.locked")}</h1>
        <p className="sub">{error ? t("privacy.wrong") : t("privacy.lockedBody")}</p>
        <PinPad value={code} onChange={(next) => { setError(false); setCode(next); }} onComplete={(next) => void attempt(next)} />
        <button
          type="button"
          className="btn is-ghost"
          onClick={() => {
            void logoutAccount().then(() => {
              setAuthState({ status: "anonymous" });
              void navigate({ to: "/login" });
            });
          }}
        >
          {t("privacy.forgot")}
        </button>
      </div>
    </div>
  );
}
