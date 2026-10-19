import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { pushSnapshot, setPushActive } from "@/entities/notify";
import { usePrefs } from "@/entities/prefs";
import { useUser } from "@/entities/session";
import { currentLang } from "@/shared/i18n";
import { currentSubscription, enablePush, lastPushError, needsInstallForPush, pushSupported } from "@/shared/lib/push";
import { Art, toast } from "@/shared/ui/kit";
import { Sheet } from "@/shared/ui/sheet";

const laterKey = "bloom.notifyAsk.later";
const sessionKey = "bloom.notifyAsk.shown";

type Need = "allow" | "denied" | "install";

/** On app open: if this device doesn't get notifications yet, ask once (again a day later if postponed). */
export function NotifyAsk() {
  const { t } = useTranslation();
  const user = useUser();
  const prefs = usePrefs(user.id);
  const [need, setNeed] = useState<Need | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!prefs?.onboarded) return;
    try {
      if (sessionStorage.getItem(sessionKey)) return;
      if (Date.now() < Number(localStorage.getItem(laterKey) ?? 0)) return;
    } catch {
      return;
    }
    let alive = true;
    const timer = window.setTimeout(async () => {
      let next: Need | null = null;
      if (needsInstallForPush()) next = "install";
      else if (!pushSupported) next = null;
      else if (Notification.permission === "denied") next = "denied";
      else if (Notification.permission === "default") next = "allow";
      else if (!(await currentSubscription())) next = "allow";
      if (!alive || !next) return;
      try {
        sessionStorage.setItem(sessionKey, "1");
      } catch {
        /* ignore */
      }
      setNeed(next);
    }, 1800);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [prefs?.onboarded]);

  function later(days = 1) {
    try {
      localStorage.setItem(laterKey, String(Date.now() + days * 86_400_000));
    } catch {
      /* ignore */
    }
    setNeed(null);
  }

  async function allow() {
    if (!prefs) return;
    setBusy(true);
    const result = await enablePush(pushSnapshot(prefs, currentLang())).finally(() => setBusy(false));
    if (result === "ok") {
      setPushActive(true);
      setNeed(null);
      toast(t("notify.push.on"), "c-arms-up");
    } else if (result === "denied") setNeed("denied");
    else if (result === "install") setNeed("install");
    else toast(`${t("notify.push.failed")} ${lastPushError}`.trim(), "c-frown");
  }

  return (
    <Sheet open={need !== null} title={t("notify.push.promptTitle")} closeLabel={t("notify.push.promptLater")} onClose={() => later(1)}>
      <div className="notify-ask">
        <Art name="c-hug-heart" className="notify-ask-art float" eager />
        <h2>🔔 {t("notify.push.promptTitle")}</h2>
        <p className="sub">
          {need === "install" ? t("notify.permission.iosInstall") : need === "denied" ? t("notify.permission.denied") : t("notify.push.promptBody")}
        </p>
        <ul className="notify-ask-list">
          <li>💬 {t("notify.kind.message")}</li>
          <li>💗 {t("notify.kind.love")}</li>
          <li>🌱 {t("notify.kind.habit")}</li>
          <li>🎯 {t("notify.kind.focusEnd")}</li>
        </ul>
        {need === "allow" ? (
          <button type="button" className="btn is-block" disabled={busy} onClick={() => void allow()}>
            {busy ? <span className="spinner" aria-hidden="true" /> : null}
            {t("notify.permission.allow")}
          </button>
        ) : null}
        <button type="button" className="btn is-ghost is-block" onClick={() => later(need === "denied" ? 3 : 1)}>
          {t("notify.push.promptLater")}
        </button>
      </div>
    </Sheet>
  );
}
