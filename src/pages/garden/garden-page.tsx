import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { moodScore, useDays } from "@/entities/day";
import { savePrefs, usePrefs } from "@/entities/prefs";
import { addReward, plantStages, pointRules, redeemReward, removeReward, useProgress, useRewards, type RewardView } from "@/entities/progress";
import { useUser } from "@/entities/session";
import type { Consequence } from "@/shared/db";
import { rewardIcons } from "@/shared/config/spaces";
import { weatherOf } from "@/shared/lib/art/look";
import { dateKey, weekOf } from "@/shared/lib/date";
import { useIntent } from "@/shared/lib/intent";
import { burst, haptic, pop } from "@/shared/lib/motion/fx";
import { Field, IconButton, IconPicker, PageHead, Section, Tabs, TextIn } from "@/shared/ui/bloom";
import { Glyph } from "@/shared/ui/glyph";
import { Art, Bar, Tile, at, toast } from "@/shared/ui/kit";
import { Sheet } from "@/shared/ui/sheet";
import { Tour } from "@/widgets/tour/tour";

export function GardenPage() {
  const { t } = useTranslation();
  const user = useUser();
  const prefs = usePrefs(user.id);
  const progress = useProgress(user.id);
  const rewards = useRewards(user.id);
  const [addOpen, setAddOpen] = useState(false);
  const [rename, setRename] = useState(false);
  const [name, setName] = useState("");
  useIntent("reward", () => setAddOpen(true));
  const stages = t("garden.stages", { returnObjects: true }) as string[];
  const petName = prefs?.petName ?? "Bloomie";

  if (!progress || !rewards || !prefs) return <div className="page" />;
  const earned = progress.badges.filter((badge) => badge.earned).length;

  return (
    <div className="page">
      <PageHead title={t("garden.title")} sub={t("garden.sub")} art="o-pot-flower" help="garden" back />

      <section data-tour="garden-plant" className="card plant-hero rise" style={at(1)}>
        <Art name="s-meadow-peek" className="plant-hero-bg" />
        <button
          type="button"
          className="plant-big"
          aria-label={t("garden.water", { name: petName })}
          onClick={(event) => {
            pop(event.currentTarget, 1.08);
            burst(event.currentTarget, { count: 16, spread: 80, colors: ["#5aaff0", "#9fd3fa", "#d6ecfd"] });
            haptic(8);
            toast(t("garden.watered", { name: petName }), "c-watering");
          }}
        >
          <Art name={plantStages[progress.stage]} className="sway" eager />
        </button>
        <div className="plant-copy">
          <span className="pill">{t("garden.level", { level: progress.level.level })}</span>
          <h2 className="title">
            {petName}
            <button type="button" className="icon-btn" aria-label={t("garden.rename")} onClick={() => { setName(petName); setRename(true); }}>
              <Glyph name="edit" size={16} />
            </button>
          </h2>
          <p className="sub">{stages[progress.stage]}</p>
          <Bar value={progress.level.progress} tone="mint" height={10} />
          <small className="tiny">{t("garden.toNext", { points: progress.level.toNext })}</small>
          <div className="stage-row" aria-hidden="true">
            {plantStages.map((stage, index) => (
              <span key={stage} className={`stage ${index <= progress.stage ? "is-on" : ""} ${index === progress.stage ? "is-now" : ""}`}>
                <Art name={stage} />
              </span>
            ))}
          </div>
        </div>
      </section>

      <div className="two-col">
        <div className="side-stack">
          <Section title={t("garden.bank")} tour="garden-bank">
            <section className="card bank tone-sun rise">
              <Art name="o-piggy" className="bank-art float" />
              <div className="bank-nums">
                <span>
                  <b className="num">{progress.balance}</b>
                  <small>{t("garden.balance")}</small>
                </span>
                <span>
                  <b className="num">{progress.earned}</b>
                  <small>{t("garden.earned")}</small>
                </span>
                <span>
                  <b className="num">{progress.spent}</b>
                  <small>{t("garden.spent")}</small>
                </span>
              </div>
              <details className="earn-rules">
                <summary>{t("garden.howEarn")}</summary>
                <ul>
                  {(Object.keys(pointRules) as Array<keyof typeof pointRules>).map((key) => (
                    <li key={key}>
                      <span>{t(`garden.earn.${key}`)}</span>
                      <b>+{pointRules[key]}</b>
                    </li>
                  ))}
                </ul>
              </details>
            </section>
          </Section>

          <Section title={t("garden.streakRewards")} tour="garden-streak">
            <p className="sub">{t("garden.streakRewardsBody")}</p>
            <div className="reward-list">
              {rewards.streakRewards.map((reward) => (
                <RewardRow key={reward.id} reward={reward} userId={user.id} left={(reward.streak ?? 0) - rewards.currentBest} unit={t("common.days", { count: Math.max(0, (reward.streak ?? 0) - rewards.currentBest) })} />
              ))}
            </div>
          </Section>

          <Section
            tour="garden-shop"
            title={t("garden.shop")}
            action={
              <button type="button" className="link" onClick={() => setAddOpen(true)}>
                + {t("garden.addReward")}
              </button>
            }
          >
            <p className="sub">{t("garden.shopBody")}</p>
            <div className="reward-list">
              {rewards.shop.map((reward) => (
                <RewardRow key={reward.id} reward={reward} userId={user.id} left={reward.cost - rewards.balance} unit={`${reward.cost - rewards.balance} ${t("common.pts")}`} />
              ))}
            </div>
            <button type="button" className="btn is-soft is-block" onClick={() => setAddOpen(true)}>
              <Glyph name="gift" size={18} />
              {t("garden.addReward")}
            </button>
          </Section>
        </div>

        <div className="side-stack">
          <MoodWeather userId={user.id} weekStart={prefs.weekStart} />

          <Section tour="garden-badges" title={`${t("garden.badges")} · ${t("garden.badgesCount", { earned, total: progress.badges.length })}`}>
            <div className="badges">
              {progress.badges.map((badge, index) => {
                const [title, body] = t(`garden.badge.${badge.id}`, { returnObjects: true }) as string[];
                return (
                  <div key={badge.id} className={`card badge rise ${badge.earned ? "is-on" : ""}`} style={at(index)}>
                    <Art name={badge.art} className="badge-art" />
                    <strong>{title}</strong>
                    <small>{body}</small>
                    {!badge.earned ? <Bar value={badge.value / badge.goal} tone="lav" height={5} /> : <span className="pill">✓</span>}
                  </div>
                );
              })}
            </div>
          </Section>

          <Section title={t("garden.consequence")} tour="garden-rule">
            <section className="card rise">
              <p className="sub card-note">{t("garden.consequenceBody")}</p>
              <div className="radio-list">
                {(["none", "minimum", "donate"] as Consequence[]).map((key) => (
                  <button key={key} type="button" className={`radio ${prefs.consequence === key ? "is-on" : ""}`} onClick={() => void savePrefs(user.id, { consequence: key })}>
                    <i />
                    <span>{t(`garden.consequences.${key}`, { amount: `¥${prefs.donateAmount}` })}</span>
                  </button>
                ))}
              </div>
              {prefs.consequence === "donate" ? (
                <Field label={t("garden.donateAmount")}>
                  <TextIn type="number" inputMode="numeric" value={String(prefs.donateAmount)} onChange={(value) => void savePrefs(user.id, { donateAmount: Math.max(1, Number(value) || 1) })} />
                </Field>
              ) : null}
            </section>
          </Section>
        </div>
      </div>

      <Tour id="garden" />
      <RewardSheet open={addOpen} onClose={() => setAddOpen(false)} userId={user.id} />
      <Sheet open={rename} title={t("garden.rename")} closeLabel={t("common.cancel")} onClose={() => setRename(false)}>
        <h2>{t("garden.petName")}</h2>
        <TextIn value={name} onChange={setName} autoFocus maxLength={24} />
        <button
          type="button"
          className="btn is-block"
          disabled={!name.trim()}
          onClick={() => {
            void savePrefs(user.id, { petName: name.trim() });
            setRename(false);
          }}
        >
          {t("common.save")}
        </button>
      </Sheet>
    </div>
  );
}

function RewardRow({ reward, userId, left, unit }: { reward: RewardView; userId: string; left: number; unit: string }) {
  const { t } = useTranslation();
  return (
    <div className={`card reward ${reward.unlocked ? "is-open" : ""}`}>
      <Tile name={reward.icon ?? "c-gift"} tone={reward.streak ? "peach" : "sun"} size={46} />
      <span className="reward-copy">
        <strong>{reward.title}</strong>
        <small>
          {reward.streak ? `🔥 ${t("common.days", { count: reward.streak })}` : `${reward.cost} ${t("common.pts")}`}
          {reward.redeemed ? ` · ${t("garden.times", { count: reward.redeemed })}` : ""}
        </small>
        {!reward.unlocked ? <Bar value={reward.progress} tone={reward.streak ? "peach" : "sun"} height={5} /> : null}
      </span>
      {reward.unlocked ? (
        <button
          type="button"
          className="btn is-sm"
          onClick={async (event) => {
            const target = event.currentTarget;
            if (await redeemReward(userId, reward.id)) {
              burst(target, { count: 28, spread: 110 });
              haptic([10, 60, 14]);
              toast(t("garden.redeemed"), "c-gift");
            }
          }}
        >
          {t("garden.redeem")}
        </button>
      ) : (
        <span className="tiny">{t("garden.locked", { left: left > 0 ? unit : "" })}</span>
      )}
      <IconButton glyph="close" label={t("common.delete")} className="reward-del" onClick={() => void removeReward(userId, reward.id)} />
    </div>
  );
}

function MoodWeather({ userId, weekStart }: { userId: string; weekStart: "monday" | "sunday" }) {
  const { t } = useTranslation();
  const keys = weekOf(dateKey(), weekStart);
  const days = useDays(userId, keys[0]!, keys[6]!);
  const weekdays = t("common.weekdays", { returnObjects: true }) as string[];
  const scores = (days ?? []).map(({ day }) => (day?.mood ? moodScore[day.mood] : null));
  const known = scores.filter((score): score is number => score !== null);
  const avg = known.length ? known.reduce((a, b) => a + b, 0) / known.length : null;
  const overall = weatherOf(avg);
  return (
    <Section title={t("garden.weather")} tour="garden-weather">
      <section className="card weather tone-sky rise">
        <div className="weather-head">
          <Art name={overall.art} className="weather-big float" />
          <span>
            <strong className="heading">{t(`weather.${overall.key}`)}</strong>
            <small>{known.length ? t("garden.weatherBody") : t("garden.weatherNone")}</small>
          </span>
        </div>
        <div className="weather-week">
          {(days ?? []).map(({ key }, index) => {
            const item = weatherOf(scores[index] ?? null);
            return (
              <span key={key} className={`weather-day ${key === dateKey() ? "is-today" : ""}`}>
                <small>{weekdays[(new Date(`${key}T12:00:00`).getDay() + 6) % 7]}</small>
                {scores[index] !== null ? <Art name={item.art} /> : <i>·</i>}
              </span>
            );
          })}
        </div>
      </section>
    </Section>
  );
}

function RewardSheet({ open, onClose, userId }: { open: boolean; onClose: () => void; userId: string }) {
  const { t } = useTranslation();
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<"points" | "streak">("points");
  const [cost, setCost] = useState("200");
  const [streak, setStreak] = useState("7");
  const [icon, setIcon] = useState("c-gift");
  useEffect(() => {
    if (open) setTitle("");
  }, [open]);
  return (
    <Sheet open={open} title={t("garden.addReward")} closeLabel={t("common.cancel")} onClose={onClose}>
      <h2>{t("garden.addReward")}</h2>
      <div className="form">
        <Field label={t("garden.rewardName")}>
          <TextIn value={title} onChange={setTitle} placeholder={t("garden.rewardPlaceholder")} autoFocus maxLength={60} />
        </Field>
        <Field label={t("goals.icon")}>
          <IconPicker icons={rewardIcons} value={icon} onPick={setIcon} />
        </Field>
        <Field label={t("garden.rewardType")}>
          <Tabs
            value={kind}
            onChange={setKind}
            options={[
              { id: "points", label: t("garden.byPoints") },
              { id: "streak", label: t("garden.byStreak") },
            ]}
          />
        </Field>
        {kind === "points" ? (
          <Field label={t("garden.cost")}>
            <TextIn type="number" inputMode="numeric" value={cost} onChange={setCost} min={1} />
          </Field>
        ) : (
          <Field label={t("garden.streakDays")}>
            <TextIn type="number" inputMode="numeric" value={streak} onChange={setStreak} min={2} />
          </Field>
        )}
        <button
          type="button"
          className="btn is-block"
          disabled={!title.trim()}
          onClick={async () => {
            await addReward(userId, title, kind === "points" ? { cost: Number(cost) || 100, icon } : { streak: Math.max(2, Number(streak) || 7), icon });
            toast(t("common.saved"), "c-gift");
            onClose();
          }}
        >
          {t("common.add")}
        </button>
      </div>
    </Sheet>
  );
}
