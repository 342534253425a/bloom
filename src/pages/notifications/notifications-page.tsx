import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { kindOn, kindTime, pushSnapshot, setPushActive, timePatch, togglePatch } from "@/entities/notify";
import { savePrefs, usePrefs, type Prefs } from "@/entities/prefs";
import { useUser } from "@/entities/session";
import { notifyGroups, notifyKinds } from "@/shared/config/notifications";
import { currentLang } from "@/shared/i18n";
import { currentSubscription, enablePush, lastPushError, listPushDevices, needsInstallForPush, pushSupported, removePushDevice, type EnableResult, type PushDevice } from "@/shared/lib/push";
import { PageHead } from "@/shared/ui/bloom";
import { Glyph } from "@/shared/ui/glyph";
import { Toggle, toast } from "@/shared/ui/kit";
import { androidNotificationsAllowed, askAndroidNotifications, desktop, shell } from "@/shared/lib/native";

export function NotificationsPage() {
  const { t } = useTranslation();
  const user = useUser();
  const prefs = usePrefs(user.id);
  return (
    <div className="page">
      <PageHead title={t("notify.title")} sub={t("notify.sub")} back />
      {prefs ? <Settings userId={user.id} prefs={prefs} /> : null}
    </div>
  );
}

/** A short human name for this device and browser, so it's clear which one is being switched on. */
function deviceName() {
  const ua = navigator.userAgent;
  const os = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "";
  const browser = /YaBrowser/.test(ua) ? "Yandex Browser" : /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "";
  return [browser, os].filter(Boolean).join(" · ") || "—";
}

function permissionState(): NotificationPermission | "unsupported" {
  return "Notification" in window ? Notification.permission : "unsupported";
}

const deviceIcon: Record<PushDevice["kind"], string> = { android: "🤖", iphone: "📱", browser: "🌐", windows: "💻" };

/** Every phone and browser that gets this account's notifications, so old ones can be switched off. */
function Devices() {
  const { t } = useTranslation();
  const [list, setList] = useState<PushDevice[] | null>(null);
  const load = () => void listPushDevices().then(setList).catch(() => setList([]));
  useEffect(load, []);
  if (!list?.length) return null;
  return (
    <section className="card notify-group rise">
      <h3 className="tiny-head">{t("notify.devices.title")}</h3>
      <p className="tiny">{t("notify.devices.hint")}</p>
      {list.map((device) => (
        <div key={device.endpoint} className="notify-row">
          <span className="notify-icon">{deviceIcon[device.kind]}</span>
          <span className="notify-copy">
            <strong>
              {t(`notify.devices.${device.kind}`)}
              {device.current ? ` · ${t("notify.devices.this")}` : ""}
            </strong>
            <small>{t("notify.devices.seen", { date: new Date(device.updatedAt).toLocaleString(currentLang(), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) })}</small>
          </span>
          <button
            type="button"
            className="btn is-sm is-ghost"
            onClick={() => {
              void removePushDevice(device.endpoint).then(load);
              toast(t("notify.devices.removed"), "c-arms-up");
            }}
          >
            {t("notify.devices.remove")}
          </button>
        </div>
      ))}
    </section>
  );
}

/** In the Windows and Android apps notifications come from the app itself. */
function AppNotifications() {
  const { t } = useTranslation();
  const [allowed, setAllowed] = useState<boolean | null>(shell === "desktop" ? true : null);
  const [autostart, setAutostart] = useState<boolean | null>(null);
  useEffect(() => {
    if (shell === "android") void androidNotificationsAllowed().then(setAllowed);
    void desktop?.getAutostart().then(setAutostart);
  }, []);
  return (
    <>
      <strong>{allowed ? t("notify.app.on") : t("notify.permission.title")}</strong>
      <p className="sub">{shell === "desktop" ? t("notify.app.desktopBody") : allowed ? t("notify.app.androidBody") : t("notify.permission.body")}</p>
      {shell === "android" && allowed === false ? (
        <button type="button" className="btn" onClick={() => void askAndroidNotifications().then(setAllowed)}>
          <Glyph name="bell" size={18} />
          {t("notify.device.allow")}
        </button>
      ) : null}
      {desktop && autostart !== null ? (
        <label className="notify-row">
          <span className="notify-copy">
            <strong>{t("notify.app.autostart")}</strong>
            <small>{t("notify.app.autostartBody")}</small>
          </span>
          <Toggle on={autostart} label={t("notify.app.autostart")} onChange={(on) => void desktop!.setAutostart(on).then(setAutostart)} />
        </label>
      ) : null}
    </>
  );
}

function Settings({ userId, prefs }: { userId: string; prefs: Prefs }) {
  const { t } = useTranslation();
  const [permission, setPermission] = useState(permissionState);
  const [push, setPush] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const save = (patch: Partial<Prefs>) => void savePrefs(userId, patch);

  useEffect(() => {
    void currentSubscription().then((sub) => setPush(Boolean(sub)));
  }, []);

  async function turnOn() {
    setBusy(true);
    let result: EnableResult = "unsupported";
    try {
      result = await enablePush(pushSnapshot(prefs, currentLang()));
    } finally {
      setBusy(false);
    }
    setPermission(permissionState());
    setError(result === "server" ? lastPushError : "");
    if (result === "ok") {
      setPush(true);
      setPushActive(true);
      if (!prefs.notify) save({ notify: true });
      toast(t("notify.push.on"), "c-arms-up");
    } else if (result === "server") {
      // Permission is granted, so notifications still work while Bloom is open.
      toast(t("notify.push.notReady"), "c-frown");
    } else if (result === "install") toast(t("notify.permission.iosInstall"), "c-frown");
    else if (result === "denied") toast(t("notify.permission.denied"), "c-frown");
  }

  function setAll(on: boolean) {
    let next = prefs;
    for (const kind of notifyKinds) next = { ...next, ...togglePatch(next, kind.id, on) };
    save({ notifyOff: next.notifyOff, morningOn: next.morningOn, eveningOn: next.eveningOn, missedOn: next.missedOn });
  }

  return (
    <div className="notify-settings">
      <section className="card notify-perm rise">
        <span className="notify-perm-icon">🔔</span>
        <div className="notify-perm-body">
          <small className="tiny">{t("notify.device.this", { device: shell === "desktop" ? "Bloom · Windows" : shell === "android" ? "Bloom · Android" : deviceName() })}</small>
          {shell !== "web" ? (
            <AppNotifications />
          ) : needsInstallForPush() ? (
            <>
              <strong>{t("notify.permission.title")}</strong>
              <p className="sub">{t("notify.permission.iosInstall")}</p>
            </>
          ) : permission === "unsupported" || !pushSupported ? (
            <p className="sub">{t("notify.permission.unsupported")}</p>
          ) : permission === "denied" ? (
            <>
              <strong>{t("notify.device.blocked")}</strong>
              <ol className="notify-steps">
                <li>{t("notify.device.step1")}</li>
                <li>{t("notify.device.step2")}</li>
                <li>{t("notify.device.step3")}</li>
              </ol>
              <button type="button" className="btn is-sm is-soft" onClick={() => window.location.reload()}>
                {t("notify.device.reload")}
              </button>
            </>
          ) : permission === "granted" && push ? (
            <>
              <strong>{t("notify.permission.granted")}</strong>
              <p className="sub">✅ {t("notify.push.on")}</p>
              <button type="button" className="btn is-sm is-soft" disabled={busy} onClick={() => void turnOn()}>
                <Glyph name="reset" size={16} />
                {t("notify.device.reconnect")}
              </button>
            </>
          ) : (
            <>
              <strong>{t("notify.permission.title")}</strong>
              <p className="sub">{t("notify.permission.body")}</p>
              <button type="button" className="btn" disabled={busy} onClick={() => void turnOn()}>
                {busy ? <span className="spinner" aria-hidden="true" /> : <Glyph name="bell" size={18} />}
                {t("notify.device.allow")}
              </button>
            </>
          )}
          {error ? <p className="tiny notify-error">{t("notify.push.error", { text: error })}</p> : null}
        </div>
      </section>

      <Devices />

      <div className="row-btns is-end">
        <button type="button" className="btn is-sm is-ghost" onClick={() => setAll(true)}>
          {t("notify.allOn")}
        </button>
        <button type="button" className="btn is-sm is-ghost" onClick={() => setAll(false)}>
          {t("notify.allOff")}
        </button>
      </div>

      <section className="card notify-group rise">
        <div className="notify-row">
          <span className="notify-icon">🌙</span>
          <span className="notify-copy">
            <strong>{t("notify.quiet")}</strong>
            <small>{t("notify.quietBody", { from: prefs.quietFrom, to: prefs.quietTo })}</small>
          </span>
          <Toggle on={prefs.quietOn} label={t("notify.quiet")} onChange={(quietOn) => save({ quietOn })} />
        </div>
        {prefs.quietOn ? (
          <div className="notify-times">
            <span className="input is-time">
              <input type="time" value={prefs.quietFrom} onChange={(e) => save({ quietFrom: e.target.value })} />
            </span>
            <span>→</span>
            <span className="input is-time">
              <input type="time" value={prefs.quietTo} onChange={(e) => save({ quietTo: e.target.value })} />
            </span>
          </div>
        ) : null}
      </section>

      {notifyGroups.map((group) => (
        <section key={group} className="card notify-group rise">
          <h3 className="tiny-head">{t(`notify.group.${group}`)}</h3>
          {notifyKinds
            .filter((kind) => kind.group === group)
            .map((kind) => {
              const on = kindOn(prefs, kind.id);
              return (
                <div key={kind.id} className={`notify-row ${on ? "" : "is-off"}`}>
                  <span className="notify-icon">{kind.icon}</span>
                  <span className="notify-copy">
                    <strong>{t(`notify.kind.${kind.id}`)}</strong>
                    <small>{t(`notify.kind.${kind.id}Body`)}</small>
                  </span>
                  {kind.time && on ? (
                    <span className="input is-time">
                      <input type="time" value={kindTime(prefs, kind.id)} onChange={(e) => save(timePatch(prefs, kind.id, e.target.value))} />
                    </span>
                  ) : null}
                  {kind.id === "water" && on ? (
                    <select className="notify-select" value={prefs.waterEvery || 2} onChange={(e) => save({ waterEvery: Number(e.target.value) })}>
                      {[1, 2, 3, 4].map((n) => (
                        <option key={n} value={n}>
                          {t("notify.waterEvery", { n })}
                        </option>
                      ))}
                    </select>
                  ) : null}
                  <Toggle on={on} label={t(`notify.kind.${kind.id}`)} onChange={(next) => save(togglePatch(prefs, kind.id, next))} />
                </div>
              );
            })}
        </section>
      ))}
    </div>
  );
}
