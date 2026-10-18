import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  markEffectSeen,
  sendEffect,
  useCouple,
  useItems,
  useSignal,
  type CoupleItem,
  type EffectData,
} from "@/entities/couple";
import { customEmoji, effectById, effects } from "@/shared/config/effects";
import { playEffect } from "@/shared/lib/effects/play";
import { burst, haptic, pop } from "@/shared/lib/motion/fx";
import { Field, TextIn } from "@/shared/ui/bloom";
import { Glyph } from "@/shared/ui/glyph";
import { toast } from "@/shared/ui/kit";
import { Sheet } from "@/shared/ui/sheet";

function effectText(t: (key: string) => string, id: string, custom: string | null): string | null {
  if (custom) return custom;
  const preset = effectById(id);
  if (!preset?.say) return null;
  const said = t(`couple.fx.${id}.say`);
  return said && !said.startsWith("couple.") ? said : null;
}

/** The grid of little surprises. */
export function LoveGrid({ limit }: { limit?: number }) {
  const { t } = useTranslation();
  const couple = useCouple();
  const [customOpen, setCustomOpen] = useState(false);
  const name = couple.partner?.name || "♥";
  const list = limit ? effects.filter((effect) => effect.id !== "custom").slice(0, limit) : effects.filter((effect) => effect.id !== "custom");

  async function send(id: string, button: HTMLElement | null) {
    pop(button, 1.2);
    burst(button, { count: 10, spread: 34, colors: ["#ff8ba0", "#ffc23d", "#9f88ef"] });
    haptic(8);
    await sendEffect(id);
    toast(couple.presence.online ? t("couple.love.sent", { name }) : t("couple.love.offlineSent", { name }), "c-hug-heart");
  }

  return (
    <>
      <div className="love-grid">
        {list.map((effect) => (
          <button
            key={effect.id}
            type="button"
            className="love-btn"
            onClick={(event) => void send(effect.id, event.currentTarget)}
            onContextMenu={(event) => {
              event.preventDefault();
              playEffect(effect, { text: effectText(t, effect.id, null) });
            }}
          >
            <span className="love-icon">{effect.icon}</span>
            <span className="love-name">{t(`couple.fx.${effect.id}.name`)}</span>
          </button>
        ))}
        <button type="button" className="love-btn is-custom" onClick={() => setCustomOpen(true)}>
          <span className="love-icon">✍️</span>
          <span className="love-name">{t("couple.love.custom")}</span>
        </button>
      </div>
      <CustomLove open={customOpen} onClose={() => setCustomOpen(false)} />
    </>
  );
}

function CustomLove({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const couple = useCouple();
  const [text, setText] = useState("");
  const [emoji, setEmoji] = useState("💌");
  const name = couple.partner?.name || "♥";
  const preset = effectById("custom")!;
  return (
    <Sheet open={open} title={t("couple.love.customTitle")} closeLabel={t("common.cancel")} onClose={onClose}>
      <h2>{t("couple.love.customTitle")}</h2>
      <div className="form">
        <Field label={t("couple.love.custom")}>
          <TextIn value={text} onChange={setText} placeholder={t("couple.love.customPlaceholder")} maxLength={80} autoFocus />
        </Field>
        <Field label={t("couple.love.emoji")}>
          <div className="emoji-pick">
            {customEmoji.map((item) => (
              <button key={item} type="button" className={item === emoji ? "is-on" : ""} onClick={() => setEmoji(item)}>
                {item}
              </button>
            ))}
          </div>
        </Field>
        <div className="btn-row">
          <button type="button" className="btn is-soft is-sm" onClick={() => playEffect(preset, { text: text || t("couple.love.customPlaceholder"), emoji })}>
            <Glyph name="eye" size={18} />
            {t("couple.love.preview")}
          </button>
          <button
            type="button"
            className="btn is-pink is-grow"
            disabled={!text.trim()}
            onClick={async () => {
              await sendEffect("custom", text, emoji);
              toast(t("couple.love.sent", { name }), "c-hug-heart");
              setText("");
              onClose();
            }}
          >
            <Glyph name="heart" size={18} fill />
            {t("couple.love.send")}
          </button>
        </div>
      </div>
    </Sheet>
  );
}

/** Lives in the app shell: plays what the partner sends and tells about new chat messages. */
export function LoveReceiver() {
  const { t } = useTranslation();
  const couple = useCouple();
  const effectsList = useItems<EffectData>("effect");
  const played = useRef(new Set<string>());
  const queue = useRef<Array<{ id: string; effect: string; text: string | null; emoji: string | null }>>([]);
  const busy = useRef(false);
  const me = couple.me?.id;
  const name = couple.partner?.name || "♥";

  function play(id: string, effect: string, text: string | null, emoji: string | null) {
    if (played.current.has(id)) return;
    played.current.add(id);
    // Each queued surprise carries its own text, so a custom message never shows an older one.
    queue.current.push({ id, effect, text, emoji });
    const run = () => {
      if (busy.current) return;
      const next = queue.current.shift();
      if (!next) return;
      busy.current = true;
      const preset = effectById(next.effect);
      if (preset) playEffect(preset, { text: effectText(t, next.effect, next.text), from: t("couple.love.from", { name }), emoji: next.emoji });
      void markEffectSeen(next.id);
      window.setTimeout(() => {
        busy.current = false;
        run();
      }, 4600);
    };
    run();
  }

  useSignal("effect", (payload) => {
    play(String(payload.id), String(payload.effect), (payload.text as string | null) ?? null, (payload.emoji as string | null) ?? null);
  });

  // Effects sent while this device was closed.
  useEffect(() => {
    if (!me) return;
    for (const item of effectsList as Array<CoupleItem<EffectData>>) {
      if (item.data.to === me && !item.data.seen && !played.current.has(item.id)) {
        if (Date.now() - new Date(item.created_at).getTime() > 3 * 86_400_000) continue;
        play(item.id, item.data.effect, item.data.text, item.data.emoji);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectsList, me]);

  // New messages are announced by the notification host (features/notify).

  return null;
}
