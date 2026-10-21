import { useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { getAppUpdate, installAppUpdate, shell, skipAppUpdate, subscribeAppUpdate } from "@/shared/lib/native";

/**
 * "Update Bloom", like Telegram. Windows: once the new version has downloaded by itself, one click restarts into it
 * (in the sidebar). Android: while a newer APK is published, a pill at the top downloads it; × hides it until the next one.
 * Nothing shows while there is no update.
 */
export function UpdateButton({ place }: { place: "side" | "float" }) {
  const { t } = useTranslation();
  const update = useSyncExternalStore(subscribeAppUpdate, getAppUpdate);
  const phone = shell === "android";
  if (update.state === "none" || (update.state === "downloading" && !phone)) return null;
  if ((place === "side") !== (shell === "desktop")) return null;
  const loading = update.state === "downloading";
  return (
    <div className={`update-btn is-${place} is-ready`}>
      <button type="button" className="update-main" disabled={loading} onClick={installAppUpdate} title={update.version ? `Bloom ${update.version}` : undefined}>
        <span className="update-icon" aria-hidden="true">
          ⬆
        </span>
        <span className="update-copy">
          <strong>{t("update.button")}</strong>
          <small>{loading ? t("update.loading", { percent: update.percent }) : phone ? t("update.hintApk") : t("update.hint")}</small>
        </span>
      </button>
      {phone && !loading ? (
        <button type="button" className="update-skip" aria-label={t("common.close")} onClick={skipAppUpdate}>
          ×
        </button>
      ) : null}
    </div>
  );
}
