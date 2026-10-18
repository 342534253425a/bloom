import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useCouple, useItem, useItems } from "@/entities/couple";
import {
  addCard,
  customCards,
  rateRecording,
  ratingId,
  recordingId,
  removeCard,
  saveRecording,
  starterCards,
  type Card,
  type CardData,
  type RatingData,
  type RecordingData,
  type Verdict,
} from "@/entities/couple/phrasebook";
import { RecordButton, VoicePlayer } from "@/features/couple/voice";
import { currentLang } from "@/shared/i18n";
import { chineseStarter } from "@/shared/data/chinese-starter";
import { haptic } from "@/shared/lib/motion/fx";
import { canSpeak, speak } from "@/shared/lib/speech";
import { Empty, Field, IconButton, TextIn } from "@/shared/ui/bloom";
import { Glyph } from "@/shared/ui/glyph";
import { toast } from "@/shared/ui/kit";
import { Sheet } from "@/shared/ui/sheet";

type Filter = "all" | "record" | "check" | "redo" | "good";
const speeds = [1, 0.75, 0.5];

function langIndex() {
  return { en: 0, ru: 1, zh: 2 }[currentLang()];
}

export function ChinesePhrasebook() {
  const { t } = useTranslation();
  const couple = useCouple();
  const custom = useItems<CardData>("cn");
  const recordings = useItems<RecordingData>("cnrec");
  const ratings = useItems<RatingData>("cnrate");
  const [deck, setDeck] = useState<string>("all");
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const me = couple.me?.id ?? "";
  const partner = couple.partner?.id ?? "";
  const name = couple.partner?.name || "♥";

  const cards = useMemo(() => [...customCards(custom), ...starterCards()], [custom]);
  const recById = useMemo(() => new Map(recordings.map((item) => [item.id, item.data])), [recordings]);
  const rateById = useMemo(() => new Map(ratings.map((item) => [item.id, item.data])), [ratings]);

  function status(card: Card) {
    const mine = recById.get(recordingId(card.id, me));
    const theirs = recById.get(recordingId(card.id, partner));
    const myRating = rateById.get(ratingId(card.id, me));
    const theirRating = rateById.get(ratingId(card.id, partner));
    const myCurrent = myRating && mine && myRating.recAt === mine.at ? myRating : null;
    return {
      mine,
      theirs,
      myRating: myCurrent,
      needsCheck: Boolean(theirs && (!theirRating || theirRating.recAt !== theirs.at)),
      redo: Boolean(myCurrent && myCurrent.verdict !== "good"),
      good: myCurrent?.verdict === "good",
    };
  }

  const counts = useMemo(() => {
    let record = 0;
    let check = 0;
    let redo = 0;
    let good = 0;
    for (const card of cards) {
      const s = status(card);
      if (!s.mine) record += 1;
      if (s.needsCheck) check += 1;
      if (s.redo) redo += 1;
      if (s.good) good += 1;
    }
    return { record, check, redo, good };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards, recById, rateById]);

  const shown = cards.filter((card) => {
    if (deck !== "all" && card.deck !== deck) return false;
    const q = query.trim().toLowerCase();
    if (q && !`${card.hanzi} ${card.pinyin} ${card.ru} ${card.en}`.toLowerCase().includes(q)) return false;
    const s = status(card);
    if (filter === "record") return !s.mine;
    if (filter === "check") return s.needsCheck;
    if (filter === "redo") return s.redo;
    if (filter === "good") return s.good;
    return true;
  });

  const decks = [{ id: "all", label: t("learn.cn.allDecks") }, { id: "mine", label: t("learn.cn.myDeck") }, ...Object.entries(chineseStarter).map(([id, value]) => ({ id, label: value.title[langIndex()] }))];

  return (
    <div className="learn">
      <section className="card learn-hero tone-pink rise">
        <span className="learn-hero-hanzi">中文</span>
        <div>
          <strong className="heading">{t("learn.cn.title")}</strong>
          <p className="sub">{t("learn.cn.body", { name })}</p>
          <div className="learn-progress">
            <span>✅ {counts.good}</span>
            <span>🎤 {counts.record}</span>
            <span>👂 {counts.check}</span>
            <span>🔁 {counts.redo}</span>
          </div>
        </div>
      </section>

      <div className="chips is-wrap">
        {(
          [
            ["all", t("learn.cn.filter.all"), cards.length],
            ["check", t("learn.cn.filter.check"), counts.check],
            ["redo", t("learn.cn.filter.redo"), counts.redo],
            ["record", t("learn.cn.filter.record"), counts.record],
            ["good", t("learn.cn.filter.good"), counts.good],
          ] as Array<[Filter, string, number]>
        ).map(([id, label, count]) => (
          <button key={id} type="button" className={`chip ${filter === id ? "is-on" : ""}`} onClick={() => setFilter(id)}>
            {label} · {count}
          </button>
        ))}
      </div>
      <div className="chips">
        {decks.map((item) => (
          <button key={item.id} type="button" className={`chip ${deck === item.id ? "is-on" : ""}`} onClick={() => setDeck(item.id)}>
            {item.label}
          </button>
        ))}
      </div>
      <div className="quick-add">
        <span className="input">
          <Glyph name="search" size={18} />
          <input value={query} placeholder={t("learn.cn.search")} onChange={(event) => setQuery(event.target.value)} />
        </span>
        <button type="button" className="btn is-sm" onClick={() => setAdding(true)}>
          <Glyph name="plus" size={18} stroke={2.6} />
          {t("learn.cn.add")}
        </button>
      </div>

      {shown.length === 0 ? <Empty art="c-read" title={t("learn.cn.empty")} /> : null}
      <div className="cn-grid">
        {shown.slice(0, 120).map((card) => (
          <PhraseCard key={card.id} card={card} meId={me} partnerId={partner} partnerName={name} state={status(card)} />
        ))}
      </div>
      <AddCardSheet open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}

function PhraseCard({
  card,
  meId,
  partnerId,
  partnerName,
  state,
}: {
  card: Card;
  meId: string;
  partnerId: string;
  partnerName: string;
  state: { mine?: RecordingData; theirs?: RecordingData; myRating: RatingData | null; needsCheck: boolean; redo: boolean; good: boolean };
}) {
  const { t } = useTranslation();
  const theirRating = useItem<RatingData>(ratingId(card.id, partnerId));
  const [note, setNote] = useState("");
  const [rating, setRating] = useState(false);
  const meaning = currentLang() === "ru" ? card.ru : card.en;
  const verdictLabel: Record<Verdict, string> = { good: t("learn.cn.good"), almost: t("learn.cn.almost"), wrong: t("learn.cn.wrong") };

  async function rate(verdict: Verdict) {
    await rateRecording(card.id, partnerId, verdict, note);
    haptic(8);
    setRating(false);
    setNote("");
    toast(t("learn.cn.rated"), verdict === "good" ? "c-arms-up" : "c-hug-heart");
  }

  return (
    <article className={`card cn-card rise ${state.good ? "is-good" : ""} ${state.redo ? "is-redo" : ""}`}>
      <div className="cn-top">
        <div className="cn-text">
          <strong className="cn-hanzi" lang="zh-CN">
            {card.hanzi}
          </strong>
          <span className="cn-pinyin">{card.pinyin}</span>
          <span className="cn-meaning">{meaning}</span>
          {canSpeak ? (
            <span className="say-btns is-compact" aria-label={t("learn.cn.listen")}>
              <button type="button" className="say-btn" onClick={() => void speak(card.hanzi, "zh-CN", 0.9)}>
                🔊 <span>{t("learn.cn.normal")}</span>
              </button>
              <button type="button" className="say-btn" onClick={() => void speak(card.hanzi, "zh-CN", 0.5)}>
                🐢 <span>{t("learn.cn.slow")}</span>
              </button>
            </span>
          ) : null}
        </div>
        {card.custom && card.author === meId ? <IconButton glyph="trash" label={t("common.delete")} onClick={() => void removeCard(card.id)} /> : null}
      </div>

      <div className="cn-voice">
        <span className="cn-who">{t("couple.you")}</span>
        {state.mine ? <VoicePlayer path={state.mine.path} duration={state.mine.duration} speeds={speeds} /> : <small className="tiny">{t("learn.cn.noRecording")}</small>}
        <RecordButton compact onDone={(recording) => saveRecording(card.id, recording)} />
      </div>
      {state.myRating ? (
        <p className={`cn-verdict is-${state.myRating.verdict}`}>
          {verdictLabel[state.myRating.verdict]} · {partnerName}
          {state.myRating.note ? `: ${state.myRating.note}` : ""}
        </p>
      ) : state.mine ? (
        <p className="cn-verdict">{t("learn.cn.waiting", { name: partnerName })}</p>
      ) : null}

      <div className="cn-voice is-partner">
        <span className="cn-who">{partnerName}</span>
        {state.theirs ? <VoicePlayer path={state.theirs.path} duration={state.theirs.duration} speeds={speeds} /> : <small className="tiny">{t("learn.cn.noRecordingPartner", { name: partnerName })}</small>}
      </div>
      {state.theirs ? (
        state.needsCheck || rating ? (
          <div className="cn-rate">
            <small className="tiny">{t("learn.cn.howSaid", { name: partnerName })}</small>
            <div className="cn-rate-btns">
              <button type="button" className="is-good" onClick={() => void rate("good")}>
                ✅ {t("learn.cn.good")}
              </button>
              <button type="button" className="is-almost" onClick={() => void rate("almost")}>
                🟡 {t("learn.cn.almost")}
              </button>
              <button type="button" className="is-wrong" onClick={() => void rate("wrong")}>
                ❌ {t("learn.cn.wrong")}
              </button>
            </div>
            <TextIn value={note} onChange={setNote} placeholder={t("learn.cn.notePlaceholder")} maxLength={200} />
          </div>
        ) : (
          <button type="button" className="link" onClick={() => setRating(true)}>
            {theirRating ? `${verdictLabel[theirRating.data.verdict]} · ${t("learn.cn.changeRating")}` : t("learn.cn.rate")}
          </button>
        )
      ) : null}
    </article>
  );
}

function AddCardSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const [hanzi, setHanzi] = useState("");
  const [pinyin, setPinyin] = useState("");
  const [meaning, setMeaning] = useState("");
  const [auto, setAuto] = useState(true);

  async function fillPinyin(value: string) {
    setHanzi(value);
    if (!auto || !value.trim()) return;
    const { pinyin: convert } = await import("pinyin-pro");
    setPinyin(convert(value, { toneType: "symbol" }));
  }

  return (
    <Sheet open={open} title={t("learn.cn.add")} closeLabel={t("common.cancel")} onClose={onClose}>
      <h2>{t("learn.cn.add")}</h2>
      <div className="form">
        <Field label={t("learn.cn.hanzi")}>
          <TextIn value={hanzi} onChange={(value) => void fillPinyin(value)} placeholder="我爱你" maxLength={80} autoFocus />
        </Field>
        <Field label={t("learn.cn.pinyin")} hint={t("learn.cn.pinyinHint")}>
          <TextIn
            value={pinyin}
            onChange={(value) => {
              setAuto(false);
              setPinyin(value);
            }}
            placeholder="wǒ ài nǐ"
            maxLength={160}
          />
        </Field>
        <Field label={t("learn.cn.meaning")}>
          <TextIn value={meaning} onChange={setMeaning} placeholder={t("learn.cn.meaningPlaceholder")} maxLength={160} />
        </Field>
        <button
          type="button"
          className="btn is-block"
          disabled={!hanzi.trim()}
          onClick={async () => {
            await addCard(hanzi, pinyin, meaning);
            setHanzi("");
            setPinyin("");
            setMeaning("");
            setAuto(true);
            toast(t("common.saved"), "c-read");
            onClose();
          }}
        >
          {t("common.add")}
        </button>
      </div>
    </Sheet>
  );
}
