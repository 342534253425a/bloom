import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { getCall } from "@/entities/call";
import { desktop, type ScreenSource } from "@/shared/lib/native";

type Pending = { sources: ScreenSource[]; resolve: (choice: { id: string; audio: boolean } | null) => void };

/**
 * Windows app: choosing which screen or window to show (in a call or the cinema), like Telegram.
 * The browser shows its own chooser instead.
 */
export function ScreenPicker() {
  const { t } = useTranslation();
  const [pending, setPending] = useState<Pending | null>(null);
  const [tab, setTab] = useState<"screen" | "window">("screen");
  const [audio, setAudio] = useState(true);
  const [picked, setPicked] = useState<string | null>(null);

  useEffect(
    () =>
      desktop?.onPickScreen?.(
        (sources) =>
          new Promise((resolve) => {
            setTab("screen");
            // In a call the computer's sound would also carry the partner's own voice back to them.
            setAudio(getCall().phase === "idle");
            setPicked(sources.find((source) => source.screen)?.id ?? sources[0]?.id ?? null);
            setPending({ sources, resolve });
          }),
      ),
    [],
  );

  if (!pending) return null;
  const close = (choice: { id: string; audio: boolean } | null) => {
    pending.resolve(choice);
    setPending(null);
  };
  const list = pending.sources.filter((source) => source.screen === (tab === "screen"));
  return (
    <div className="screen-pick" onClick={(event) => event.target === event.currentTarget && close(null)}>
      <div className="screen-pick-card" role="dialog" aria-label={t("call.pickScreen")}>
        <h3>{t("call.pickScreen")}</h3>
        <div className="screen-pick-tabs">
          <button type="button" className={tab === "screen" ? "is-on" : ""} onClick={() => setTab("screen")}>
            {t("call.pickScreens")}
          </button>
          <button type="button" className={tab === "window" ? "is-on" : ""} onClick={() => setTab("window")}>
            {t("call.pickWindows")}
          </button>
        </div>
        <div className="screen-pick-grid">
          {list.map((source) => (
            <button key={source.id} type="button" className={picked === source.id ? "is-on" : ""} onClick={() => setPicked(source.id)} onDoubleClick={() => close({ id: source.id, audio })}>
              <img src={source.thumb} alt="" />
              <span>{source.name}</span>
            </button>
          ))}
        </div>
        <label className="screen-pick-audio">
          <input type="checkbox" checked={audio} onChange={(event) => setAudio(event.target.checked)} />
          {t("call.withSound")}
        </label>
        <div className="screen-pick-actions">
          <button type="button" className="btn is-ghost" onClick={() => close(null)}>
            {t("call.cancel")}
          </button>
          <button type="button" className="btn" disabled={!picked} onClick={() => picked && close({ id: picked, audio })}>
            {t("call.share")}
          </button>
        </div>
      </div>
    </div>
  );
}
