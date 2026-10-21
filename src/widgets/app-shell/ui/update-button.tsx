import { useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { getAppUpdate, installAppUpdate, subscribeAppUpdate } from "@/shared/lib/native";

/**
 * Windows app, like Telegram: once a new version has downloaded by itself, one click restarts Bloom into it.
 * Nothing shows while there is no update.
 */
export function UpdateButton() {
  const { t } = useTranslation();
  const update = useSyncExternalStore(subscribeAppUpdate, getAppUpdate);
  if (update.state !== "ready") return null;
  return (
    <button type="button" className="update-btn is-side is-ready" onClick={installAppUpdate} title={update.version ? `Bloom ${update.version}` : undefined}>
      <span className="update-icon" aria-hidden="true">
        ⬆
      </span>
      <span className="update-copy">
        <strong>{t("update.button")}</strong>
        <small>{t("update.hint")}</small>
      </span>
    </button>
  );
}
