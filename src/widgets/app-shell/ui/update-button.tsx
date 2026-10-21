import { useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { getAppUpdate, installAppUpdate, shell, skipAppUpdate, subscribeAppUpdate } from "@/shared/lib/native";

/**
 * "Update Bloom", like Telegram: appears by itself as soon as a new version is out — a new site (any device),
 * a downloaded Windows app (restarts into it) or a newer Android APK (installs in one tap).
 * Wide screens: pinned to the bottom of the sidebar; narrow ones: a pill at the top. Nothing shows without an update.
 */
export function UpdateButton({ place }: { place: "side" | "float" }) {
  const { t } = useTranslation();
  const update = useSyncExternalStore(subscribeAppUpdate, getAppUpdate);
  const phone = shell === "android";
  const shellReady = update.state === "ready";
  const loading = update.state === "downloading" && phone;
  if (!shellReady && !update.site && !loading) return null;
  const hint = loading
    ? t("update.loading", { percent: update.percent })
    : shellReady
      ? phone
        ? t("update.hintApk")
        : t("update.hint")
      : t("update.hintSite");
  return (
    <div className={`update-btn is-${place} is-ready`}>
      <button type="button" className="update-main" disabled={loading} onClick={installAppUpdate} title={update.version ? `Bloom ${update.version}` : undefined}>
        <span className="update-icon" aria-hidden="true">
          ⬆
        </span>
        <span className="update-copy">
          <strong>{t("update.button")}</strong>
          <small>{hint}</small>
        </span>
      </button>
      {!loading ? (
        <button type="button" className="update-skip" aria-label={t("common.close")} title={t("common.close")} onClick={skipAppUpdate}>
          ×
        </button>
      ) : null}
    </div>
  );
}
