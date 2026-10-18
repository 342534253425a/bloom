import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { addCountdown, countdownKinds, createGoal, horizons, updateGoal } from "@/entities/goal";
import type { CountdownKind, Goal, GoalHorizon } from "@/shared/db";
import { goalIcons } from "@/shared/config/spaces";
import { haptic } from "@/shared/lib/motion/fx";
import { Field, IconPicker, TextIn, TonePicker } from "@/shared/ui/bloom";
import { Glyph } from "@/shared/ui/glyph";
import { Tile, toast } from "@/shared/ui/kit";
import type { Tone } from "@/shared/db";
import { Sheet } from "@/shared/ui/sheet";

type Draft = { title: string; why: string; horizon: GoalHorizon; icon: string; tone: Tone; due: string; steps: string[] };

export function GoalSheet({
  open,
  onClose,
  userId,
  goal,
  parent,
  horizon,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  userId: string;
  goal?: Goal | null;
  parent?: Goal | null;
  horizon?: GoalHorizon;
  onCreated?: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<Draft>({ title: "", why: "", horizon: "year", icon: "o-target-heart", tone: "pink", due: "", steps: [""] });

  useEffect(() => {
    if (!open) return;
    setDraft({
      title: goal?.title ?? "",
      why: goal?.why ?? "",
      horizon: goal?.horizon ?? horizon ?? "year",
      icon: goal?.icon ?? parent?.icon ?? "o-target-heart",
      tone: (goal?.tone ?? parent?.tone ?? "pink") as Tone,
      due: goal?.due ?? "",
      steps: [""],
    });
  }, [open, goal, parent, horizon]);

  const set = (patch: Partial<Draft>) => setDraft((current) => ({ ...current, ...patch }));
  const allowed = parent ? horizons.slice(horizons.indexOf(parent.horizon) + 1) : horizons;

  async function save() {
    if (!draft.title.trim()) return;
    if (goal) {
      await updateGoal(userId, goal.id, { title: draft.title.trim(), why: draft.why.trim() || null, horizon: draft.horizon, icon: draft.icon, tone: draft.tone, due: draft.due || null });
      toast(t("common.saved"), "c-hold-daisy");
    } else {
      const id = await createGoal(userId, { ...draft, parentId: parent?.id ?? null, due: draft.due || null });
      toast(t("goals.created"), "c-watering");
      onCreated?.(id);
    }
    haptic([8, 40, 10]);
    onClose();
  }

  return (
    <Sheet open={open} title={goal ? t("common.edit") : t("goals.new")} closeLabel={t("common.cancel")} onClose={onClose}>
      <h2>{goal ? t("common.edit") : t("goals.new")}</h2>
      {parent ? <p className="sub">{t("goals.subFor", { title: parent.title })}</p> : null}
      <div className="form">
        <div className="form-preview">
          <Tile name={draft.icon} tone={draft.tone} size={58} />
          <strong>{draft.title || t("goals.titlePlaceholder")}</strong>
        </div>
        <Field label={t("goals.titleLabel")}>
          <TextIn value={draft.title} onChange={(title) => set({ title })} placeholder={t("goals.titlePlaceholder")} autoFocus={!goal} maxLength={90} />
        </Field>
        <Field label={t("goals.ladder")}>
          <div className="chips is-wrap">
            {allowed.map((item) => (
              <button key={item} type="button" className={`chip ${draft.horizon === item ? "is-on" : ""}`} onClick={() => set({ horizon: item })}>
                {t(`goals.horizon.${item}`)}
              </button>
            ))}
          </div>
        </Field>
        <Field label={t("goals.whyLabel")}>
          <TextIn value={draft.why} onChange={(why) => set({ why })} placeholder={t("goals.whyPlaceholder")} maxLength={140} />
        </Field>
        <Field label={`${t("goals.due")} (${t("common.optional")})`}>
          <TextIn type="date" value={draft.due} onChange={(due) => set({ due })} />
        </Field>
        <Field label={t("goals.icon")}>
          <IconPicker icons={goalIcons} value={draft.icon} onPick={(icon) => set({ icon })} />
        </Field>
        <Field label={t("goals.color")}>
          <TonePicker value={draft.tone} onPick={(tone) => set({ tone })} />
        </Field>
        {!goal ? (
          <Field label={t("goals.firstSteps")}>
            <div className="step-inputs">
              {draft.steps.map((step, index) => (
                <TextIn
                  key={index}
                  value={step}
                  placeholder={t("goals.stepPlaceholder")}
                  onChange={(value) => {
                    const steps = draft.steps.slice();
                    steps[index] = value;
                    if (index === steps.length - 1 && value.trim() && steps.length < 8) steps.push("");
                    set({ steps });
                  }}
                />
              ))}
            </div>
          </Field>
        ) : null}
        <button type="button" className="btn is-block" disabled={!draft.title.trim()} onClick={() => void save()}>
          {goal ? t("common.save") : t("goals.new")}
        </button>
      </div>
    </Sheet>
  );
}

const kindArt: Record<CountdownKind, string> = {
  exam: "i-book",
  trip: "i-plane",
  birthday: "c-gift",
  event: "i-sun",
  goal: "o-target-heart",
  milestone: "o-mountain",
};

export function countdownArt(kind: CountdownKind) {
  return kindArt[kind] ?? "i-sun";
}

export function CountdownSheet({ open, onClose, userId }: { open: boolean; onClose: () => void; userId: string }) {
  const { t } = useTranslation();
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<CountdownKind>("trip");
  const [date, setDate] = useState("");

  useEffect(() => {
    if (open) {
      setTitle("");
      setDate("");
    }
  }, [open]);

  return (
    <Sheet open={open} title={t("countdowns.new")} closeLabel={t("common.cancel")} onClose={onClose}>
      <h2>{t("countdowns.new")}</h2>
      <div className="form">
        <div className="kind-grid">
          {countdownKinds.map((item) => (
            <button key={item} type="button" className={`kind-opt ${kind === item ? "is-on" : ""}`} onClick={() => setKind(item)}>
              <Tile name={kindArt[item]} size={40} />
              <span>{t(`countdowns.kind.${item}`)}</span>
            </button>
          ))}
        </div>
        <Field label={t("common.title")}>
          <TextIn value={title} onChange={setTitle} placeholder={t("countdowns.titlePlaceholder")} autoFocus maxLength={70} />
        </Field>
        <Field label={t("common.date")}>
          <TextIn type="date" value={date} onChange={setDate} />
        </Field>
        <button
          type="button"
          className="btn is-block"
          disabled={!title.trim() || !date}
          onClick={async () => {
            await addCountdown(userId, title, kind, date);
            haptic(8);
            toast(t("common.saved"), "c-wave-sun");
            onClose();
          }}
        >
          <Glyph name="calendar" size={18} />
          {t("common.add")}
        </button>
      </div>
    </Sheet>
  );
}
