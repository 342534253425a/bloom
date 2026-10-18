import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { kindOn } from "@/entities/notify";
import type { Prefs } from "@/entities/prefs";
import { notifyKinds } from "@/shared/config/notifications";
import { Section } from "@/shared/ui/bloom";
import { Glyph } from "@/shared/ui/glyph";
import { Tile } from "@/shared/ui/kit";

/** Entry to the notification centre, where every reminder and partner alert is set up. */
export function Reminders({ prefs }: { userId: string; prefs: Prefs }) {
  const { t } = useTranslation();
  const on = notifyKinds.filter((kind) => kindOn(prefs, kind.id)).length;
  return (
    <Section title={t("together.reminders")} tour="together-reminders">
      <Link to="/notifications" className="card settings-link pressable rise">
        <Tile name="i-bell" tone="sun" size={44} />
        <span>
          <strong>{t("notify.title")}</strong>
          <small>
            {on}/{notifyKinds.length} · {t("notify.sub")}
          </small>
        </span>
        <Glyph name="chevron" size={18} stroke={2.4} />
      </Link>
    </Section>
  );
}
