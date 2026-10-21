import { useTranslation } from "react-i18next";
import type { ScreenSound } from "@/shared/lib/native";
import { Toggle } from "@/shared/ui/kit";

/** "Computer sound" and "Bloom sound" for a shared screen (Windows app): in the chooser, in a call and in the cinema. */
export function ScreenSoundSwitches({ value, onChange, compact = false }: { value: ScreenSound; onChange: (next: ScreenSound) => void; compact?: boolean }) {
  const { t } = useTranslation();
  const rows: Array<{ key: keyof ScreenSound; icon: string; label: string; hint: string }> = [
    { key: "pc", icon: "🔊", label: t("call.soundPc"), hint: t("call.soundPcHint") },
    { key: "bloom", icon: "💬", label: t("call.soundBloom"), hint: t("call.soundBloomHint") },
  ];
  return (
    <div className={`screen-sound ${compact ? "is-compact" : ""}`}>
      {rows.map((row) => (
        <label key={row.key} className="screen-sound-row">
          <span className="screen-sound-icon" aria-hidden="true">
            {row.icon}
          </span>
          <span className="screen-sound-copy">
            <strong>{row.label}</strong>
            {compact ? null : <small>{row.hint}</small>}
          </span>
          <Toggle on={value[row.key]} label={row.label} onChange={(on) => onChange({ ...value, [row.key]: on })} />
        </label>
      ))}
    </div>
  );
}
