import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { createHabit, updateHabit } from "@/entities/habit";
import { flatten, useGoalTree } from "@/entities/goal";
import type { Habit } from "@/shared/db";
import { habitIcons } from "@/shared/config/spaces";
import { haptic } from "@/shared/lib/motion/fx";
import { DaysPicker, Field, IconPicker, TextIn, TonePicker } from "@/shared/ui/bloom";
import { Art, Stepper, Tile, toast } from "@/shared/ui/kit";
import type { Tone } from "@/shared/db";
import { Sheet } from "@/shared/ui/sheet";

const templates: Array<{ key: string; icon: string; tone: Tone; target?: number; days?: number[] }> = [
  { key: "water", icon: "i-drop", tone: "sky", target: 8 },
  { key: "wake", icon: "i-sun", tone: "sun" },
  { key: "move", icon: "i-shoe", tone: "pink" },
  { key: "read", icon: "i-book", tone: "lav" },
  { key: "meditate", icon: "i-lotus", tone: "peach" },
  { key: "words", icon: "i-bulb", tone: "sun", target: 1 },
  { key: "sleep", icon: "i-moon", tone: "lav" },
  { key: "walk", icon: "i-flower", tone: "mint" },
  { key: "journal", icon: "i-pencil", tone: "peach" },
];

type Draft = { name: string; icon: string; tone: Tone; days: number[]; target: number; minimum: string; goalId: string | null; reminder: string };

const blank: Draft = { name: "", icon: "i-sprout", tone: "mint", days: [], target: 1, minimum: "", goalId: null, reminder: "" };

export function HabitSheet({ open, onClose, userId, habit }: { open: boolean; onClose: () => void; userId: string; habit?: Habit | null }) {
  const { t } = useTranslation();
  const goals = useGoalTree(userId);
  const [draft, setDraft] = useState<Draft>(blank);
  const [custom, setCustom] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (habit) {
      setDraft({
        name: habit.name,
        icon: habit.icon ?? "i-sprout",
        tone: (habit.tone ?? "mint") as Tone,
        days: habit.days ?? [],
        target: habit.targetCount ?? 1,
        minimum: habit.minimum ?? "",
        goalId: habit.goalId ?? null,
        reminder: habit.reminder ?? "",
      });
      setCustom(true);
    } else {
      setDraft(blank);
      setCustom(false);
    }
  }, [open, habit]);

  const set = (patch: Partial<Draft>) => setDraft((current) => ({ ...current, ...patch }));

  async function save() {
    if (!draft.name.trim()) return;
    const fields = {
      name: draft.name.trim(),
      icon: draft.icon,
      tone: draft.tone,
      days: draft.days.length ? draft.days : null,
      targetCount: draft.target,
      minimum: draft.minimum.trim() || null,
      goalId: draft.goalId,
      reminder: draft.reminder || null,
    };
    if (habit) await updateHabit(userId, habit.id, fields);
    else await createHabit(userId, fields);
    haptic([8, 40, 10]);
    toast(habit ? t("common.saved") : t("habits.created"), "c-watering");
    onClose();
  }

  const goalOptions = flatten(goals ?? []).filter((goal) => !goal.doneAt);

  return (
    <Sheet open={open} title={habit ? t("habits.edit") : t("habits.new")} closeLabel={t("common.cancel")} onClose={onClose}>
      <h2>{habit ? t("habits.edit") : t("habits.new")}</h2>
      {!custom ? (
        <>
          <p className="eyebrow">{t("habits.templates")}</p>
          <div className="tpl-grid">
            {templates.map((tpl) => (
              <button
                key={tpl.key}
                type="button"
                className={`tpl card tone-${tpl.tone} pressable`}
                onClick={() => {
                  setDraft({
                    ...blank,
                    name: t(`habits.tpl.${tpl.key}`),
                    minimum: t(`habits.tplMin.${tpl.key}`),
                    icon: tpl.icon,
                    tone: tpl.tone,
                    target: tpl.target ?? 1,
                  });
                  setCustom(true);
                }}
              >
                <Tile name={tpl.icon} size={40} />
                <span>{t(`habits.tpl.${tpl.key}`)}</span>
              </button>
            ))}
          </div>
          <button type="button" className="btn is-soft is-block" onClick={() => setCustom(true)}>
            <Art name="i-pencil" />
            {t("habits.custom")}
          </button>
        </>
      ) : (
        <div className="form">
          <div className="form-preview">
            <Tile name={draft.icon} tone={draft.tone} size={58} />
            <strong>{draft.name || t("habits.namePlaceholder")}</strong>
          </div>
          <Field label={t("habits.name")}>
            <TextIn value={draft.name} onChange={(name) => set({ name })} placeholder={t("habits.namePlaceholder")} autoFocus={!habit} maxLength={60} />
          </Field>
          <Field label={t("habits.icon")}>
            <IconPicker icons={habitIcons} value={draft.icon} onPick={(icon) => set({ icon })} />
          </Field>
          <Field label={t("habits.color")}>
            <TonePicker value={draft.tone} onPick={(tone) => set({ tone })} />
          </Field>
          <Field label={t("habits.days")}>
            <DaysPicker value={draft.days} onChange={(days) => set({ days })} />
          </Field>
          <div className="field-row">
            <span className="field-label">{t("habits.target")}</span>
            <Stepper value={draft.target} min={1} max={30} label={t("habits.target")} onChange={(target) => set({ target })} />
          </div>
          <Field label={t("habits.minimumLabel")} hint={t("habits.minimumHint")}>
            <TextIn value={draft.minimum} onChange={(minimum) => set({ minimum })} placeholder={t("habits.minimumPlaceholder")} maxLength={80} />
          </Field>
          <Field label={t("habits.remindAt")} hint={t("habits.remindHint")}>
            <span className="input is-time">
              <input type="time" value={draft.reminder} onChange={(event) => set({ reminder: event.target.value })} />
            </span>
          </Field>
          {goalOptions.length ? (
            <Field label={t("habits.goal")}>
              <span className="input">
                <select value={draft.goalId ?? ""} onChange={(event) => set({ goalId: event.target.value || null })}>
                  <option value="">{t("habits.noGoal")}</option>
                  {goalOptions.map((goal) => (
                    <option key={goal.id} value={goal.id}>
                      {goal.title}
                    </option>
                  ))}
                </select>
              </span>
            </Field>
          ) : null}
          <button type="button" className="btn is-block" disabled={!draft.name.trim()} onClick={() => void save()}>
            {habit ? t("common.save") : t("habits.create")}
          </button>
        </div>
      )}
    </Sheet>
  );
}
