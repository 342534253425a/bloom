import { useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { alwaysPrivate, setShareMode, setShareModule, setSharePaused, shareModules, useSharing } from "@/entities/prefs";
import { setAuthState, useUser } from "@/entities/session";
import { downloadJson, exportSpace, hasPasscode, importSpace, setPasscode } from "@/entities/space";
import { deleteAccount, logoutAccount } from "@/features/authenticate";
import { LocalAccounts } from "@/widgets/sync-card/local-accounts";
import { SyncCard } from "@/widgets/sync-card/sync-card";
import type { ShareMode } from "@/shared/db";
import { localeOf } from "@/shared/i18n";
import { dateKey } from "@/shared/lib/date";
import { haptic } from "@/shared/lib/motion/fx";
import { PageHead, Section, TextIn } from "@/shared/ui/bloom";
import { Glyph } from "@/shared/ui/glyph";
import { Art, Tile, Toggle, at, toast } from "@/shared/ui/kit";
import { Sheet } from "@/shared/ui/sheet";
import { PinPad } from "@/widgets/app-shell/ui/lock-screen";
import { Tour } from "@/widgets/tour/tour";

const modeArt: Record<ShareMode, string> = { private: "i-lock", partial: "i-shield", partner: "c-pair-hearts" };
const BACKUP_KEY = "bloom.lastBackup";

export function PrivacyPage() {
  const { t } = useTranslation();
  const user = useUser();
  const navigate = useNavigate();
  const share = useSharing(user.id);
  const [pinOpen, setPinOpen] = useState(false);
  const [locked, setLocked] = useState(() => hasPasscode(user.id));
  const [eraseOpen, setEraseOpen] = useState(false);
  const [word, setWord] = useState("");
  const [outOpen, setOutOpen] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const [lastBackup, setLastBackup] = useState(() => localStorage.getItem(`${BACKUP_KEY}.${user.id}`));

  const signOut = () =>
    void logoutAccount().then(() => {
      sessionStorage.removeItem("bloom.unlocked");
      setAuthState({ status: "anonymous" });
      void navigate({ to: "/login" });
    });

  return (
    <div className="page">
      <PageHead title={t("privacy.title")} sub={t("privacy.sub")} art="i-shield" help="privacy" back />

      <section className="card privacy-hero tone-mint rise" style={at(1)}>
        <Art name="o-lock-flower" className="privacy-art float" />
        <div>
          <strong className="heading">{t("privacy.where")}</strong>
          <p className="sub">{t("privacy.whereBody")}</p>
          <div className="tag-row">
            <span className="pill">
              <Glyph name="eyeOff" size={13} /> {t("privacy.noTracking")}
            </span>
            <span className="pill is-lav">
              <Glyph name="heart" size={13} /> {t("privacy.yours")}
            </span>
            <span className="pill is-sky">
              <Glyph name="globe" size={13} /> {t("privacy.offline")}
            </span>
          </div>
        </div>
      </section>

      <div className="two-col">
        <div className="side-stack">
          <Section title={t("privacy.mode")} tour="privacy-mode">
            <div className="mode-list">
              {(["private", "partial", "partner"] as ShareMode[]).map((mode) => {
                const [name, body] = t(`privacy.modes.${mode}`, { returnObjects: true }) as string[];
                return (
                  <button key={mode} type="button" className={`card mode-opt pressable ${share?.mode === mode ? "is-on" : ""}`} onClick={() => void setShareMode(user.id, mode)}>
                    <Tile name={modeArt[mode]} tone={mode === "private" ? "sky" : mode === "partial" ? "mint" : "pink"} size={44} />
                    <span className="row-copy">
                      <strong>{name}</strong>
                      <small>{body}</small>
                    </span>
                    <span className="radio-dot" />
                  </button>
                );
              })}
            </div>
          </Section>

          {share ? (
            <Section title={t("privacy.modules")} tour="privacy-modules">
              <section className="card rise">
                <p className="sub card-note">{t("privacy.modulesBody")}</p>
                <div className="rows">
                  {shareModules.map((module) => {
                    const fixed = alwaysPrivate.includes(module);
                    return (
                      <div key={module} className="row is-compact">
                        <span className="row-copy">
                          <strong>{t(`privacy.module.${module}`)}</strong>
                          {fixed ? (
                            <small>
                              <Glyph name="lock" size={12} /> {t("privacy.alwaysPrivate")}
                            </small>
                          ) : null}
                        </span>
                        {fixed ? <Glyph name="lock" size={20} /> : <Toggle on={share.modules[module]} label={t(`privacy.module.${module}`)} onChange={(on) => void setShareModule(user.id, module, on)} />}
                      </div>
                    );
                  })}
                  <div className="row">
                    <span className="row-copy">
                      <strong>{t("privacy.pause")}</strong>
                      <small>{t("privacy.pauseBody")}</small>
                    </span>
                    <Toggle on={share.paused} label={t("privacy.pause")} onChange={(on) => void setSharePaused(user.id, on)} />
                  </div>
                </div>
              </section>
            </Section>
          ) : null}
        </div>

        <div className="side-stack">
          <Section title={t("privacy.lock")} tour="privacy-lock">
            <section className="card rise">
              <div className="row">
                <Tile name="i-lock" tone="sky" size={44} />
                <span className="row-copy">
                  <strong>{locked ? t("privacy.lockOn") : t("privacy.lock")}</strong>
                  <small>{t("privacy.lockBody")}</small>
                </span>
              </div>
              <div className="btn-row">
                <button type="button" className="btn is-soft is-sm" onClick={() => setPinOpen(true)}>
                  <Glyph name="lock" size={18} />
                  {locked ? t("privacy.lockChange") : t("privacy.lockSet")}
                </button>
                {locked ? (
                  <button
                    type="button"
                    className="btn is-ghost is-sm"
                    onClick={() => {
                      void setPasscode(user.id, null);
                      setLocked(false);
                      toast(t("privacy.lockOff"), "c-wave");
                    }}
                  >
                    {t("privacy.lockRemove")}
                  </button>
                ) : null}
              </div>
            </section>
          </Section>

          <SyncCard />
          <LocalAccounts />

          <Section title={t("privacy.data")} tour="privacy-data">
            <section className="card rise">
              <button
                type="button"
                className="row"
                onClick={async () => {
                  downloadJson(`bloom-backup-${dateKey()}.json`, await exportSpace(user.id));
                  const now = new Date().toISOString();
                  localStorage.setItem(`${BACKUP_KEY}.${user.id}`, now);
                  setLastBackup(now);
                  toast(t("privacy.exported"), "c-hug-star");
                }}
              >
                <Tile name="o-notebook" tone="mint" size={44} />
                <span className="row-copy">
                  <strong>{t("privacy.export")}</strong>
                  <small>{t("privacy.exportBody")}</small>
                </span>
                <Glyph name="download" size={20} />
              </button>
              <button type="button" className="row" onClick={() => file.current?.click()}>
                <Tile name="o-house" tone="sun" size={44} />
                <span className="row-copy">
                  <strong>{t("privacy.import")}</strong>
                  <small>{t("privacy.importBody")}</small>
                </span>
                <Glyph name="upload" size={20} />
              </button>
              <input
                ref={file}
                type="file"
                accept="application/json,.json"
                hidden
                onChange={async (event) => {
                  const picked = event.target.files?.[0];
                  event.target.value = "";
                  if (!picked) return;
                  try {
                    const count = await importSpace(user.id, JSON.parse(await picked.text()));
                    toast(t("privacy.imported", { count }), "c-arms-up");
                  } catch {
                    toast(t("privacy.importError"), "c-frown");
                  }
                }}
              />
              <p className="tiny card-note">
                {lastBackup ? t("privacy.lastBackup", { date: new Intl.DateTimeFormat(localeOf(), { day: "numeric", month: "long", year: "numeric" }).format(new Date(lastBackup)) }) : t("privacy.noBackup")}
              </p>
            </section>
          </Section>

          <Section title={t("privacy.danger")}>
            <section className="card rise">
              <button type="button" className="row" onClick={() => setOutOpen(true)}>
                <Glyph name="logout" size={20} />
                <span className="row-copy">
                  <strong>{t("privacy.signOut")}</strong>
                  <small>{t("privacy.signOutBody")}</small>
                </span>
              </button>
              <button type="button" className="row is-danger" onClick={() => setEraseOpen(true)}>
                <Glyph name="trash" size={20} />
                <span className="row-copy">
                  <strong>{t("privacy.erase")}</strong>
                </span>
              </button>
            </section>
          </Section>
        </div>
      </div>

      <Tour id="privacy" />
      <PinSheet
        open={pinOpen}
        onClose={() => setPinOpen(false)}
        onSet={async (code) => {
          await setPasscode(user.id, code);
          sessionStorage.setItem("bloom.unlocked", user.id);
          setLocked(true);
          toast(t("privacy.lockOn"), "o-lock-flower");
        }}
      />

      <Sheet open={outOpen} title={t("privacy.signOut")} closeLabel={t("common.cancel")} onClose={() => setOutOpen(false)}>
        <Art name="c-wave" className="sheet-hero float" eager />
        <h2>{t("privacy.signOut")}</h2>
        <p className="sub">{t("privacy.signOutBody")}</p>
        <button type="button" className="btn is-block" onClick={signOut}>
          <Glyph name="logout" size={18} />
          {t("privacy.signOut")}
        </button>
      </Sheet>

      <Sheet open={eraseOpen} title={t("privacy.erase")} closeLabel={t("common.cancel")} onClose={() => setEraseOpen(false)}>
        <Art name="c-sad-grass" className="sheet-hero" eager />
        <h2>{t("privacy.erase")}</h2>
        <p className="sub">{t("privacy.eraseBody")}</p>
        <TextIn value={word} onChange={setWord} placeholder={t("privacy.eraseWord")} />
        <button
          type="button"
          className="btn is-coral is-block"
          disabled={word.trim().toUpperCase() !== t("privacy.eraseWord")}
          onClick={async () => {
            haptic([20, 60, 20]);
            try {
              await deleteAccount(user.id);
            } catch {
              toast(t("auth.offline"), "c-frown");
              return;
            }
            await setPasscode(user.id, null);
            toast(t("privacy.erased"), "c-wave");
            setAuthState({ status: "anonymous" });
            void navigate({ to: "/login" });
          }}
        >
          <Glyph name="trash" size={18} />
          {t("privacy.erase")}
        </button>
      </Sheet>
    </div>
  );
}

function PinSheet({ open, onClose, onSet }: { open: boolean; onClose: () => void; onSet: (code: string) => Promise<void> }) {
  const { t } = useTranslation();
  const [first, setFirst] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState(false);
  const close = () => {
    setFirst(null);
    setCode("");
    setError(false);
    onClose();
  };
  return (
    <Sheet open={open} title={t("privacy.lockSet")} closeLabel={t("common.cancel")} onClose={close}>
      <h2 className="center">{first ? t("privacy.lockRepeat") : t("privacy.lockEnter")}</h2>
      {error ? <p className="field-error center">{t("privacy.lockMismatch")}</p> : null}
      <PinPad
        value={code}
        onChange={setCode}
        onComplete={async (next) => {
          if (!first) {
            setFirst(next);
            setCode("");
            return;
          }
          if (first !== next) {
            setError(true);
            setFirst(null);
            setCode("");
            haptic([12, 40, 12]);
            return;
          }
          await onSet(next);
          close();
        }}
      />
    </Sheet>
  );
}
