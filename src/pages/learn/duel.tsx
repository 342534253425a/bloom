import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { putItem, useCouple, useItems } from "@/entities/couple";
import { distractors, grade, pickRound, shuffle } from "@/entities/vocab";
import { findInExample, wordById, type Word } from "@/shared/data/ielts";
import { createId } from "@/shared/lib/id";
import { haptic } from "@/shared/lib/motion/fx";
import { Glyph } from "@/shared/ui/glyph";
import { toast } from "@/shared/ui/kit";
import { Example, RoundDone, WordFacts, type GameProps } from "./ielts-games";

type DuelData = { by: string; qs: Array<{ w: string; o: string[] }> };
type ScoreData = { duel: string; score: number; total: number };

const scoreId = (duel: string, uid: string) => `duelscore:${duel.replace("duel:", "")}:${uid}`;

/** Async duels: the same ten context questions for both partners; each score is its own item so neither overwrites the other. */
export function Duels(props: GameProps) {
  const { t } = useTranslation();
  const couple = useCouple();
  const duels = useItems<DuelData>("duel");
  const scores = useItems<ScoreData>("duelscore");
  const [playing, setPlaying] = useState<string | null>(null);
  const me = props.userId;
  const partner = couple.partner?.id ?? "";
  const name = couple.partner?.name || "♥";
  const scoreOf = (duel: string, uid: string) => scores.find((s) => s.id === scoreId(duel, uid))?.data;
  const list = [...duels].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 12);
  const active = duels.find((d) => d.id === playing);

  async function create() {
    const words = pickRound(props.cards, props.level, 10, (w) => findInExample(w) != null);
    const qs = words.map((w) => ({ w: w.id, o: shuffle([w, ...distractors(w, 3)]).map((x) => x.id) }));
    const id = `duel:${createId()}`;
    await putItem(id, "duel", { by: me, qs });
    setPlaying(id);
  }

  if (active) {
    return (
      <DuelRound
        duel={active.data}
        onExit={() => setPlaying(null)}
        onDone={async (score) => {
          await putItem(scoreId(active.id, me), "duelscore", { duel: active.id, score, total: active.data.qs.length });
          if (active.data.by === me) toast(t("learn.ielts.duel.sent"), "c-arms-up");
        }}
        userId={me}
      />
    );
  }

  return (
    <div className="game">
      <div className="round-head">
        <button type="button" className="round-btn" aria-label={t("learn.ielts.exit")} onClick={props.onExit}>
          <Glyph name="back" size={18} stroke={2.4} />
        </button>
        <strong className="round-title">⚔️ {t("learn.ielts.game.duel")}</strong>
      </div>
      {!partner ? (
        <p className="card sub">{t("learn.needPartner")}</p>
      ) : (
        <button type="button" className="card duel-new" onClick={() => void create()}>
          <strong className="heading">{t("learn.ielts.duel.new", { name })}</strong>
          <span className="sub">{t("learn.ielts.duel.newBody", { name })}</span>
        </button>
      )}
      {list.length ? <h3 className="tiny-head">{t("learn.ielts.duel.history")}</h3> : null}
      {list.map((duel) => {
        const mine = scoreOf(duel.id, me);
        const theirs = scoreOf(duel.id, partner);
        const fromThem = duel.data.by !== me;
        let status: string;
        if (!mine) status = fromThem ? t("learn.ielts.duel.from", { name }) : "…";
        else if (!theirs) status = t("learn.ielts.duel.waiting", { name });
        else status = mine.score > theirs.score ? t("learn.ielts.duel.won") : mine.score < theirs.score ? t("learn.ielts.duel.lost", { name }) : t("learn.ielts.duel.draw");
        return (
          <div key={duel.id} className={`card duel-row ${!mine ? "is-todo" : ""}`}>
            <span className="duel-vs">
              <b>{mine ? mine.score : "–"}</b>
              <small>:</small>
              <b>{theirs ? theirs.score : "–"}</b>
            </span>
            <span className="duel-copy">
              <strong>{status}</strong>
              <small className="tiny">{new Date(duel.created_at).toLocaleDateString()}</small>
            </span>
            {!mine ? (
              <button type="button" className="btn is-sm" onClick={() => setPlaying(duel.id)}>
                {t("learn.ielts.duel.play")}
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function DuelRound({ duel, onExit, onDone, userId }: { duel: DuelData; onExit: () => void; onDone: (score: number) => Promise<void>; userId: string }) {
  const { t } = useTranslation();
  const qs = useMemo(
    () =>
      duel.qs
        .map((q) => ({ word: wordById.get(q.w), options: q.o.map((id) => wordById.get(id)).filter(Boolean) as Word[] }))
        .filter((q): q is { word: Word; options: Word[] } => Boolean(q.word)),
    [duel],
  );
  const [index, setIndex] = useState(0);
  const [right, setRight] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  const q = qs[index];

  if (finished || !q) return <RoundDone right={right} total={qs.length} onAgain={onExit} onExit={onExit} />;

  return (
    <div className="game">
      <div className="round-head">
        <span className="round-score">
          ⚔️ {index + 1}/{qs.length}
        </span>
        <span className="round-score">✅ {right}</span>
      </div>
      <div className="card quiz-q">
        <p className="cloze-text">
          <Example word={q.word} blank={picked == null} />
        </p>
      </div>
      <div className="quiz-opts">
        {q.options.map((option) => {
          const state = picked == null ? "" : option.id === q.word.id ? "is-right" : option.id === picked ? "is-wrong" : "is-dim";
          return (
            <button
              key={option.id}
              type="button"
              className={`quiz-opt ${state}`}
              disabled={picked != null}
              onClick={() => {
                const ok = option.id === q.word.id;
                setPicked(option.id);
                haptic(ok ? 8 : [10, 40, 10]);
                if (ok) setRight((n) => n + 1);
                void grade(userId, q.word.id, ok);
              }}
            >
              {option.word}
            </button>
          );
        })}
      </div>
      {picked ? (
        <div className={`quiz-feedback rise ${picked === q.word.id ? "is-right" : "is-wrong"}`}>
          <WordFacts word={q.word} />
          <button
            type="button"
            className="btn is-block"
            onClick={async () => {
              setPicked(null);
              if (index + 1 >= qs.length) {
                await onDone(right);
                setFinished(true);
              } else setIndex(index + 1);
            }}
          >
            {t("learn.ielts.next")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
