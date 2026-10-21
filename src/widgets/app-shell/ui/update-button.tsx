import { useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { getAppUpdate, installAppUpdate, subscribeAppUpdate } from "@/shared/lib/native";

/**
 * "Update Bloom", like Telegram's button: appears when a new version of the Windows or Android app
 * is out. On wide screens it sits in the sidebar, on phones it floats at the top.
 */
export function UpdateButton({ place }: { place: "side" | "float" }) {
  const { t } = useTranslation();
  const update = useSyncExternalStore(subscribeAppUpdate, getAppUpdate);
  if (update.state === "none") return null;
  const ready = update.state === "ready";
  return (
    <button
      type="button"
      className={`update-btn is-${place} ${ready ? "is-ready" : "is-loading"}`}
      disabled={!ready}
      onClick={installAppUpdate}
      title={update.version ? `Bloom ${update.version}` : undefined}
    >
      <span className="update-icon" aria-hidden="true">
        {ready ? "⬆" : <i style={{ width: `${update.percent}%` }} />}
      </span>
      <span className="update-copy">
        <strong>{ready ? t("update.button") : t("update.loading", { percent: update.percent })}</strong>
        {ready ? <small>{t("update.hint")}</small> : null}
      </span>
    </button>
  );
}
