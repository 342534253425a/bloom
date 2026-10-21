import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { dismissInstall, installDismissed, useInstall, type Platform } from "@/shared/lib/install";
import { Tabs } from "@/shared/ui/bloom";
import { Glyph, type GlyphName } from "@/shared/ui/glyph";
import { Art } from "@/shared/ui/kit";
import { Sheet } from "@/shared/ui/sheet";
import { DOWNLOADS } from "@/shared/lib/native";

type Guide = "ios" | "android" | "desktop";

function guideFor(platform: Platform): Guide {
  if (platform === "ios" || platform === "ios-other") return "ios";
  return platform;
}

/** Adding Bloom to the iPhone home screen (Android and Windows have real apps to download). */
const iosSteps: Array<{ glyph: GlyphName; key: string }> = [
    { glyph: "globe", key: "ios1" },
    { glyph: "share", key: "ios2" },
    { glyph: "addSquare", key: "ios3" },
    { glyph: "check", key: "ios4" },
  ];

/** Native install where the browser allows it, otherwise clear steps for iPhone, Android or a computer. */
export function InstallGuide({ onDone }: { onDone?: () => void }) {
  const { t } = useTranslation();
  const install = useInstall();
  const [guide, setGuide] = useState<Guide>(guideFor(install.platform));

  if (install.standalone) {
    return (
      <div className="install-done">
        <Art name="c-arms-up" className="install-art float" />
        <strong className="heading">{t("install.already")}</strong>
        <p className="sub">{t("install.alreadyBody")}</p>
      </div>
    );
  }

  return (
    <div className="install">
      <div className="install-hero">
        <span className="install-icon">
          <img src="/mascot/wave.png" alt="" />
        </span>
        <div>
          <strong className="heading">{t("install.title")}</strong>
          <p className="sub">{t("install.why")}</p>
        </div>
      </div>

      <Tabs
        value={guide}
        onChange={setGuide}
        options={[
          { id: "ios", label: "iPhone" },
          { id: "android", label: "Android" },
          { id: "desktop", label: "Windows" },
        ]}
      />
      {guide === "ios" ? (
        <>
          {install.platform === "ios-other" ? (
            <p className="install-warn">
              <Glyph name="sparkle" size={16} />
              {t("install.openSafari")}
            </p>
          ) : null}
          <ol className="install-steps">
            {iosSteps.map((step, index) => (
              <li key={step.key}>
                <span className="install-num">{index + 1}</span>
                <span className="install-text">{t(`install.${step.key}`)}</span>
                <span className="install-glyph">
                  <Glyph name={step.glyph} size={20} stroke={2.2} />
                </span>
              </li>
            ))}
          </ol>
          <p className="tiny center">{t("install.note")}</p>
        </>
      ) : (
        <a className="btn is-block install-download" href={guide === "android" ? DOWNLOADS.android : DOWNLOADS.windows} target="_blank" rel="noopener" onClick={() => onDone?.()}>
          <Glyph name="download" size={20} stroke={2.4} />
          {guide === "android" ? t("install.getApk") : t("install.getWindows")}
        </a>
      )}
    </div>
  );
}

export function InstallSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <Sheet open={open} title={t("install.title")} closeLabel={t("common.close")} onClose={onClose}>
      <InstallGuide onDone={onClose} />
    </Sheet>
  );
}

/** A button that opens the install guide; hidden once Bloom runs as an installed app. */
export function InstallButton({ className = "btn is-soft is-sm", children }: { className?: string; children?: ReactNode }) {
  const { t } = useTranslation();
  const install = useInstall();
  const [open, setOpen] = useState(false);
  if (install.standalone) return null;
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {children ?? (
          <>
            <Glyph name="phone" size={18} stroke={2.2} />
            {t("install.short")}
          </>
        )}
      </button>
      <InstallSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}

/** Friendly card on the Today screen until Bloom is installed or the card is dismissed. */
export function InstallBanner() {
  const { t } = useTranslation();
  const install = useInstall();
  const [hidden, setHidden] = useState(installDismissed);
  const [open, setOpen] = useState(false);
  if (install.standalone || hidden) return null;
  return (
    <section className="card install-banner rise">
      <span className="install-icon is-small">
        <img src="/mascot/wave.png" alt="" />
      </span>
      <button type="button" className="install-banner-copy" onClick={() => setOpen(true)}>
        <strong>{t("install.bannerTitle")}</strong>
        <small>{t("install.bannerBody")}</small>
      </button>
      <button type="button" className="btn is-sm" onClick={() => setOpen(true)}>
        {t("install.short")}
      </button>
      <button
        type="button"
        className="install-close"
        aria-label={t("common.close")}
        onClick={() => {
          dismissInstall();
          setHidden(true);
        }}
      >
        <Glyph name="close" size={16} stroke={2.4} />
      </button>
      <InstallSheet open={open} onClose={() => setOpen(false)} />
    </section>
  );
}
