import { useState } from "react";
import { useTranslation } from "react-i18next";
import { savePrefs } from "@/entities/prefs";
import { useUser } from "@/entities/session";
import { spaces } from "@/shared/config/spaces";
import { isStandalone } from "@/shared/lib/install";
import { haptic } from "@/shared/lib/motion/fx";
import { Glyph } from "@/shared/ui/glyph";
import { Art, Tile } from "@/shared/ui/kit";
import { Sheet } from "@/shared/ui/sheet";
import { InstallButton } from "@/widgets/install/install";

type Slide = { key: "s1" | "s2" | "s3" | "s4" | "install"; art: string | null };

const allSlides: Slide[] = [
  { key: "s1", art: "c-wave-sun" },
  { key: "s2", art: null },
  { key: "s3", art: "c-hug-heart" },
  { key: "install", art: "c-peek-open" },
  { key: "s4", art: "c-watering" },
];

export function Onboarding({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const user = useUser();
  const [choosing, setChoosing] = useState(true);
  const [step, setStep] = useState(0);
  const [open, setOpen] = useState(true);
  const [slides] = useState(() => allSlides.filter((item) => item.key !== "install" || !isStandalone()));
  const slide = slides[step]!;
  const last = step === slides.length - 1;

  function finish() {
    setOpen(false);
    window.setTimeout(onDone, 380);
  }

  if (choosing) {
    return (
      <Sheet open={open} title={t("tour.welcomeTitle")} closeLabel={t("common.skip")} onClose={finish} hideClose>
        <div className="tour">
          <Art name="c-wave-sun" className="tour-art float" eager />
          <h2>{t("tour.welcomeTitle")}</h2>
          <p className="sub">{t("tour.welcomeBody")}</p>
          <div className="choice-list">
            <button
              type="button"
              className="choice is-main"
              onClick={() => {
                haptic(8);
                void savePrefs(user.id, { tours: "on", toursSeen: [] });
                setChoosing(false);
              }}
            >
              <Art name="c-soil-eyes" className="choice-art" />
              <span className="choice-copy">
                <span className="choice-badge">
                  <Glyph name="star" size={12} fill />
                  {t("tour.recommended")}
                </span>
                <strong>{t("tour.newbie")}</strong>
                <small>{t("tour.newbieBody")}</small>
              </span>
              <Glyph name="chevron" size={18} stroke={2.6} />
            </button>
            <button
              type="button"
              className="choice"
              onClick={() => {
                haptic(8);
                void savePrefs(user.id, { tours: "off" });
                finish();
              }}
            >
              <Art name="c-flower-head" className="choice-art" />
              <span className="choice-copy">
                <strong>{t("tour.expert")}</strong>
                <small>{t("tour.expertBody")}</small>
              </span>
              <Glyph name="chevron" size={18} stroke={2.6} />
            </button>
          </div>
        </div>
      </Sheet>
    );
  }

  const title = slide.key === "install" ? t("install.tourTitle") : t(`onboarding.${slide.key}t`);
  return (
    <Sheet open={open} title={title} closeLabel={t("common.skip")} onClose={finish} hideClose>
      <div className="tour" key={step}>
        {slide.art ? (
          <Art name={slide.art} className="tour-art float" eager />
        ) : (
          <div className="tour-grid">
            {spaces.map((space) => (
              <span key={space.key} className="tour-cell">
                <Tile name={space.art} tone={space.tone} size={40} />
                <small>{t(`spaces.${space.key}.name`)}</small>
              </span>
            ))}
          </div>
        )}
        <h2>{title}</h2>
        <p className="sub">{slide.key === "install" ? t("install.tourBody") : t(`onboarding.${slide.key}b`)}</p>
        {slide.key === "install" ? (
          <InstallButton className="btn is-soft is-block">
            <Glyph name="phone" size={20} stroke={2.2} />
            {t("install.title")}
          </InstallButton>
        ) : null}
        <div className="tour-dots" aria-hidden="true">
          {slides.map((item, index) => (
            <i key={item.key} className={index === step ? "is-on" : ""} />
          ))}
        </div>
        <button
          type="button"
          className="btn is-block"
          onClick={() => {
            haptic(6);
            if (last) finish();
            else setStep(step + 1);
          }}
        >
          {last ? t("onboarding.go") : t("common.next")}
          <Glyph name="chevron" size={18} stroke={2.6} />
        </button>
        {!last ? (
          <button type="button" className="btn is-ghost is-block" onClick={finish}>
            {t("common.skip")}
          </button>
        ) : null}
      </div>
    </Sheet>
  );
}
