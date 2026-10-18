import { useTranslation } from "react-i18next";
import { useUser } from "@/entities/session";
import { syncNow, useSyncState } from "@/shared/api/sync";
import { localeOf } from "@/shared/i18n";
import { Section } from "@/shared/ui/bloom";
import { Glyph } from "@/shared/ui/glyph";
import { Tile } from "@/shared/ui/kit";

export function SyncBadge() {
  const { t } = useTranslation();
  const sync = useSyncState();
  const tone = sync.status === "synced" ? "is-ok" : sync.status === "syncing" ? "is-busy" : "is-warn";
  return (
    <span className={`sync-badge ${tone}`} title={t(`sync.status.${sync.status}`)}>
      <i />
      {t(`sync.status.${sync.status}`)}
    </span>
  );
}

export function SyncCard() {
  const { t } = useTranslation();
  const user = useUser();
  const sync = useSyncState();
  return (
    <Section title={t("sync.title")} tour="privacy-sync">
      <section className="card rise">
        <div className="row">
          <Tile name="i-cloud" tone="sky" size={44} />
          <span className="row-copy">
            <strong>{user.email}</strong>
            <small>
              <SyncBadge />
              {sync.lastSync ? ` · ${new Intl.DateTimeFormat(localeOf(), { hour: "2-digit", minute: "2-digit" }).format(new Date(sync.lastSync))}` : ""}
              {sync.pending ? ` · ${t("sync.pending", { count: sync.pending })}` : ""}
            </small>
          </span>
          <button type="button" className="icon-btn" aria-label={t("sync.now")} title={t("sync.now")} onClick={() => void syncNow()}>
            <Glyph name="reset" size={19} />
          </button>
        </div>
        <p className="tiny card-note">{t("sync.body")}</p>
      </section>
    </Section>
  );
}
