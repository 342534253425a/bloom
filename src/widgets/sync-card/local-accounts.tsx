import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useUser } from "@/entities/session";
import { adoptLocalAccount, listLocalAccounts } from "@/features/authenticate";
import { Section } from "@/shared/ui/bloom";
import { Glyph } from "@/shared/ui/glyph";
import { Tile, toast } from "@/shared/ui/kit";

/** Accounts created before sync existed live only in this browser; this moves them into the cloud account. */
export function LocalAccounts() {
  const { t } = useTranslation();
  const user = useUser();
  const accounts = useLiveQuery(() => listLocalAccounts(), []);
  const [busy, setBusy] = useState<string | null>(null);
  const list = (accounts ?? []).filter((account) => account.id !== user.id);
  if (!list.length) return null;
  return (
    <Section title={t("sync.localTitle")}>
      <section className="card rise">
        <p className="sub card-note">{t("sync.localBody")}</p>
        {list.map((account) => (
          <div key={account.id} className="row">
            <Tile name="o-house" tone="sun" size={40} />
            <span className="row-copy">
              <strong>{account.name || account.email}</strong>
              <small>
                {account.email} · {t("common.items", { count: account.rows })}
              </small>
            </span>
            <button
              type="button"
              className="btn is-soft is-sm"
              disabled={busy !== null}
              onClick={async () => {
                setBusy(account.id);
                const moved = await adoptLocalAccount(account.id, user.id);
                setBusy(null);
                toast(t("sync.moved", { count: moved }), "c-arms-up");
              }}
            >
              <Glyph name="upload" size={16} />
              {t("sync.move")}
            </button>
          </div>
        ))}
      </section>
    </Section>
  );
}
