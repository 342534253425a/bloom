import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { clearInbox, kindOn, kindTime, markAllRead, pushSnapshot, setPushActive, timePatch, togglePatch, useInbox } from "@/entities/notify";
import { savePrefs, usePrefs, type Prefs } from "@/entities/prefs";
import { useUser } from "@/entities/session";
import { kindById, notifyGroups, notifyKinds } from "@/shared/config/notifications";
import { currentLang } from "@/shared/i18n";
import { currentSubscription, enablePush, lastPushError, needsInstallForPush, pushSupported, type EnableResult } from "@/shared/lib/push";
import { Empty, PageHead, Tabs } from "@/shared/ui/bloom";
import { Glyph } from "@/shared/ui/glyph";
import { Toggle, toast } from "@/shared/ui/kit";

type Tab = "inbox" | "settings";

export function NotificationsPage() {
  const { t } = useTranslation();
  const user = useUser();
  const prefs = usePrefs(user.id);
  const inbox = useInbox(user.id);
  const unread = inbox.filter((item) => !item.read).length;
  const [tab, setTab] = useState<Tab>(() => (inbox.length ? "inbox" : "settings"));

  // Opening the inbox marks everything read after a moment.
  useEffect(() => {
    if (tab !== "inbox" || !unread) return;
    const timer = window.setTimeout(markAllRead, 1500);
    return () => window.clearTimeout(timer);
  }, [tab, unread]);

  return (
    <div className="page">
      <PageHead title={t("notify.title")} sub={t("notify.sub")} art="i-bell" back />
      <Tabs
        value={tab}
        onChange={setTab}
        options={[
          { id: "inbox", label: `${t("notify.inbox")}${unread ? ` · ${unread}` : ""}` },
          { id: "settings", label: t("notify.settings") },
        ]}
      />
      {tab === "inbox" ? <Inbox userId={user.id} /> : prefs ? <Settings userId={user.id} prefs={prefs} /> : null}
    </div>
  );
}

function timeAgo(iso: string, lang: string) {
  const diff = (Date.now() - Date.parse(iso)) / 1000;
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: "auto" });
  if (diff < 60) return rtf.format(0, "second");
  if (diff < 3600) return rtf.format(-Math.round(diff / 60), "minute");
  if (diff < 86400) return rtf.format(-Math.round(diff / 3600), "hour");
  return rtf.format(-Math.round(diff / 86400), "day");
}

function Inbox({ userId }: { userId: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const inbox = useInbox(userId);
  if (!inbox.length) return <Empty art="c-sleep-cloud" title={t("notify.empty")} body={t("notify.emptyBody")} />;
  return (
    <div className="inbox">
      <div className="row-btns is-end">
        <button type="button" className="btn is-sm is-ghost" onClick={markAllRead}>
          {t("notify.markRead")}
        </button>
        <button type="button" className="btn is-sm is-ghost" onClick={clearInbox}>
          {t("notify.clear")}
        </button>
      </div>
      {inbox.map((item) => (
        <button key={item.id} type="button" className={`card inbox-row ${item.read ? "" : "is-unread"}`} onClick={() => void navigate({ to: item.to as "/" })}>
          <span className="inbox-icon">{kindById.get(item.kind)?.icon ?? "🔔"}</span>
          <span className="inbox-copy">
            <strong>{item.title}</strong>
            <span>{item.body}</span>
          </span>
          <small className="inbox-time">{timeAgo(item.at, currentLang())}</small>
        </button>
      ))}
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
          <small className="tiny">{t("notify.device.this", { device: deviceName() })}</small>
          {needsInstallForPush() ? (
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
