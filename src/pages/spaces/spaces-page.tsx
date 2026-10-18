import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useUser } from "@/entities/session";
import { PageHead } from "@/shared/ui/bloom";
import { Glyph } from "@/shared/ui/glyph";
import { Art, Tile } from "@/shared/ui/kit";
import { SpacesGrid } from "@/widgets/spaces-grid/spaces-grid";

export function SpacesPage() {
  const { t } = useTranslation();
  const user = useUser();
  return (
    <div className="page">
      <PageHead title={t("spaces.title")} sub={t("spaces.subtitle")} />
      <section className="banner-intro card tone-mint rise">
        <Art name="c-flower-arms" className="banner-intro-art float" />
        <div>
          <strong className="heading">{t("onboarding.s2t")}</strong>
          <p className="sub">{t("onboarding.s2b")}</p>
        </div>
      </section>
      <SpacesGrid userId={user.id} detailed />
      <Link to="/learn" className="card settings-link pressable rise">
        <Tile name="c-read" tone="sun" size={46} />
        <span>
          <strong>{t("learn.title")}</strong>
          <small>{t("learn.sub")}</small>
        </span>
        <Glyph name="chevron" size={18} stroke={2.4} />
      </Link>
      <Link to="/settings" className="card settings-link pressable rise">
        <Tile name="o-gear" tone="lav" size={46} />
        <span>
          <strong>{t("spaces.settings.name")}</strong>
          <small>{t("spaces.settings.short")}</small>
        </span>
        <Glyph name="chevron" size={18} stroke={2.4} />
      </Link>
    </div>
  );
}
