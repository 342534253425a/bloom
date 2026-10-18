import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { pushSnapshot, setPushActive } from "@/entities/notify";
import { usePrefs } from "@/entities/prefs";
import { useUser } from "@/entities/session";
import { currentLang } from "@/shared/i18n";
import { currentSubscription, enablePush, lastPushError, needsInstallForPush, pushSupported } from "@/shared/lib/push";
import { toast } from "@/shared/ui/kit";

const laterKey = "bloom.pushPrompt.later";

/** A card on Today asking to switch on notifications until this device receives pushes. */
export function PushPrompt() {
  const { t } = useTranslation();
  const user = useUser();
  const prefs = usePrefs(user.id);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let later = 0;
    try {
      later = Number(localStorage.getItem(laterKey) ?? 0);
    } catch {
      /* ignore */
    }
    if (Date.now() < later) return;
    if (!pushSupported && !needsInstallForPush()) return;
    if ("Notification" in window && Notification.permission === "denied") return;
    void currentSubscription().then((sub) => setShow(!sub));
  }, []);

  if (!show || !prefs) return null;
  const install = needsInstallForPush();

  return (
    <div className="card push-prompt rise">
      <span className="push-prompt-icon">🔔</span>
      <div>
        <strong>{t("notify.push.promptTitle")}</strong>
        <p className="sub">{install ? t("notify.permission.iosInstall") : t("notify.push.promptBody")}</p>
        <div className="row-btns is-start">
          {install ? null : (
            <button
              type="button"
              className="btn is-sm"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const result = await enablePush(pushSnapshot(prefs, currentLang())).finally(() => setBusy(false));
                if (result === "ok") {
                  setPushActive(true);
                  setShow(false);
                  toast(t("notify.push.on"), "c-arms-up");
                } else if (result === "denied") {
                  setShow(false);
                  toast(t("notify.permission.denied"), "c-frown");
                } else toast(`${t("notify.push.failed")} ${lastPushError}`.trim(), "c-frown");
              }}
            >
              {t("notify.permission.allow")}
            </button>
          )}
          <button
            type="button"
            className="btn is-sm is-ghost"
            onClick={() => {
              try {
                localStorage.setItem(laterKey, String(Date.now() + 3 * 86_400_000));
              } catch {
                /* ignore */
              }
              setShow(false);
            }}
          >
            {t("notify.push.promptLater")}
          </button>
        </div>
      </div>
    </div>
  );
}
