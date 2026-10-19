import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { savePrefs, usePrefs, type Prefs } from "@/entities/prefs";
import { setAuthState, useUser } from "@/entities/session";
import { logoutAccount, renameAccount } from "@/features/authenticate";
import { SyncCard } from "@/widgets/sync-card/sync-card";
import { InstallButton } from "@/widgets/install/install";
import type { Accent, ThemeName } from "@/shared/db";
import { currentLang, setLocale, type Lang } from "@/shared/i18n";
import { Field, PageHead, Section, TextIn } from "@/shared/ui/bloom";
import { Glyph } from "@/shared/ui/glyph";
import { Segmented, Stepper, Tile, Toggle, toast } from "@/shared/ui/kit";

const languages: Array<{ id: Lang; label: string }> = [
  { id: "en", label: "English" },
  { id: "ru", label: "Русский" },
  { id: "zh", label: "中文" },
];

const accents: Array<{ id: Accent; color: string }> = [
  { id: "mint", color: "#36c89c" },
  { id: "pink", color: "#ff8ba0" },
  { id: "lav", color: "#9f88ef" },
  { id: "sky", color: "#5aaff0" },
];

export function SettingsPage() {
  const { t } = useTranslation();
  const user = useUser();
  const navigate = useNavigate();
  const prefs = usePrefs(user.id);
  const [name, setName] = useState(user.displayName);
  const [lang, setLang] = useState<Lang>(currentLang());
  if (!prefs) return <div className="page" />;
  const set = (patch: Partial<Prefs>) => void savePrefs(user.id, patch);

  return (
    <div className="page">
      <PageHead title={t("settings.title")} sub={t("settings.sub")} art="o-gear" back />
      <div className="two-col">
        <div className="side-stack">
          <Section title={t("settings.profile")}>
            <section className="card rise">
              <Field label={t("settings.name")}>
                <div className="quick-add">
                  <TextIn value={name} onChange={setName} maxLength={40} />
                  <button
                    type="button"
                    className="icon-btn is-solid"
                    aria-label={t("common.save")}
                    disabled={!name.trim() || name.trim() === user.displayName}
                    onClick={async () => {
                      await renameAccount(name);
                      setAuthState({ status: "authenticated", user: { ...user, displayName: name.trim() } });
                      toast(t("common.saved"), "c-wave");
                    }}
                  >
                    <Glyph name="check" size={20} stroke={2.6} />
                  </button>
                </div>
              </Field>
              <p className="tiny">
                <Glyph name="mail" size={12} /> {user.email}
              </p>
            </section>
          </Section>

          <SyncCard />

          <Section title={t("settings.language")}>
            <section className="card rise">
              <Segmented
                label={t("settings.language")}
                value={lang}
                onChange={(next) => {
                  setLang(next);
                  setLocale(next);
                }}
                options={languages}
              />
            </section>
          </Section>

          <Section title={t("settings.look")}>
            <section className="card rise">
              <span className="field-label">{t("settings.theme")}</span>
              <div className="theme-pick">
                {(["bloom", "minimal"] as ThemeName[]).map((theme) => {
                  const [title, body] = t(`settings.themes.${theme}`, { returnObjects: true }) as string[];
                  return (
                    <button key={theme} type="button" className={`card theme-opt is-${theme} ${prefs.theme === theme ? "is-on" : ""}`} onClick={() => set({ theme })}>
                      <span className="theme-swatch" />
                      <strong>{title}</strong>
                      <small>{body}</small>
                    </button>
                  );
                })}
              </div>
              <span className="field-label">{t("settings.accent")}</span>
              <div className="tone-pick">
                {accents.map((accent) => (
                  <button
                    key={accent.id}
                    type="button"
                    aria-label={accent.id}
                    aria-pressed={prefs.accent === accent.id}
                    className={`tone-opt ${prefs.accent === accent.id ? "is-on" : ""}`}
                    style={{ background: accent.color }}
                    onClick={() => set({ accent: accent.id })}
                  >
                    {prefs.accent === accent.id ? <Glyph name="check" size={16} stroke={3} /> : null}
                  </button>
                ))}
              </div>
            </section>
          </Section>

          <Section title={t("tour.settingsTitle")}>
            <section className="card rise">
              <div className="row">
                <Tile name="c-hold-daisy" tone="sun" size={44} />
                <span className="row-copy">
                  <strong>{t("tour.settingsOn")}</strong>
                </span>
                <Toggle on={prefs.tours === "on"} label={t("tour.settingsOn")} onChange={(on) => set({ tours: on ? "on" : "off" })} />
              </div>
              <button
                type="button"
                className="btn is-soft is-sm"
                onClick={() => {
                  set({ tours: "on", toursSeen: [] });
                  toast(t("tour.settingsResetDone"), "c-hold-daisy");
                }}
              >
                <Glyph name="sparkle" size={18} />
                {t("tour.settingsReset")}
              </button>
            </section>
          </Section>

          <Section title={t("settings.app")}>
            <section className="card rise">
              <div className="row">
                <Tile name="i-offline" tone="sky" size={44} />
                <span className="row-copy">
                  <strong>{t("settings.install")}</strong>
                  <small>{t("settings.installBody")}</small>
                </span>
              </div>
              <div className="settings-actions">
                <InstallButton className="btn is-block" />
                <button type="button" className="btn is-soft is-block" onClick={() => set({ onboarded: false })}>
                  <Glyph name="sparkle" size={18} />
                  {t("settings.tour")}
                </button>
              </div>
            </section>
          </Section>
        </div>

        <div className="side-stack">
          <Section title={t("settings.units")}>
            <section className="card rise">
              <span className="field-label">{t("settings.week")}</span>
              <Segmented
                label={t("settings.week")}
                value={prefs.weekStart}
                onChange={(weekStart) => set({ weekStart })}
                options={[
                  { id: "monday", label: t("settings.monday") },
                  { id: "sunday", label: t("settings.sunday") },
                ]}
              />
              <span className="field-label">{t("settings.units")}</span>
              <Segmented
                label={t("settings.units")}
                value={prefs.units}
                onChange={(units) => set({ units })}
                options={[
                  { id: "metric", label: t("settings.metric") },
                  { id: "imperial", label: t("settings.imperial") },
                ]}
              />
              <Field label={`${t("settings.height")} (${prefs.units === "metric" ? "cm" : "in"})`}>
                <TextIn
                  type="number"
                  inputMode="numeric"
                  value={prefs.heightCm ? String(Math.round(prefs.units === "metric" ? prefs.heightCm : prefs.heightCm / 2.54)) : ""}
                  onChange={(value) => {
                    const number = Number(value);
                    set({ heightCm: number > 0 ? (prefs.units === "metric" ? number : number * 2.54) : null });
                  }}
                />
              </Field>
            </section>
          </Section>

          <Section title={t("settings.goals")}>
            <section className="card rise">
              <div className="field-row">
                <span className="field-label">{t("settings.waterGoal")}</span>
                <Stepper value={prefs.waterGoal} min={1} max={20} label={t("settings.waterGoal")} onChange={(waterGoal) => set({ waterGoal })} />
              </div>
              <div className="field-row">
                <span className="field-label">{t("settings.sleepGoal")}</span>
                <Stepper value={prefs.sleepGoal} min={4} max={12} label={t("settings.sleepGoal")} onChange={(sleepGoal) => set({ sleepGoal })} />
              </div>
              <div className="field-row">
                <span className="field-label">{t("settings.cycleLength")}</span>
                <Stepper value={prefs.cycleLength} min={20} max={45} label={t("settings.cycleLength")} onChange={(cycleLength) => set({ cycleLength })} />
              </div>
              <div className="field-row">
                <span className="field-label">
                  {t("settings.focusDefaults")} ({t("common.min")})
                </span>
                <Stepper value={prefs.focusMinutes} min={5} max={120} label={t("settings.focusDefaults")} onChange={(focusMinutes) => set({ focusMinutes })} />
              </div>
            </section>
          </Section>

          <Section title={t("settings.notifications")}>
            <Link to="/notifications" className="card settings-link pressable rise">
              <Tile name="i-bell" tone="sun" size={44} />
              <span>
                <strong>{t("settings.openReminders")}</strong>
                <small>{t("settings.notificationsBody")}</small>
              </span>
              <Glyph name="chevron" size={18} stroke={2.4} />
            </Link>
            <Link to="/privacy" className="card settings-link pressable rise">
              <Tile name="i-shield" tone="mint" size={44} />
              <span>
                <strong>{t("spaces.privacy.name")}</strong>
                <small>{t("spaces.privacy.short")}</small>
              </span>
              <Glyph name="chevron" size={18} stroke={2.4} />
            </Link>
          </Section>

          <button
            type="button"
            className="btn is-danger is-block"
            onClick={() =>
              void logoutAccount().then(() => {
                sessionStorage.removeItem("bloom.unlocked");
                setAuthState({ status: "anonymous" });
                void navigate({ to: "/login" });
              })
            }
          >
            <Glyph name="logout" size={18} />
            {t("settings.signOut")}
          </button>
          <button
            type="button"
            className="btn is-ghost is-block settings-erase"
            onClick={() => {
              sessionStorage.setItem("bloom.openErase", "1");
              void navigate({ to: "/privacy" });
            }}
          >
            <Glyph name="trash" size={18} />
            {t("privacy.erase")}
          </button>
          <p className="tiny center">{t("settings.version")}</p>
        </div>
      </div>
    </div>
  );
}
