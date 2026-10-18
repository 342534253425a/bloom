import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { VocabCard } from "@/shared/db";
import { findInExample, ieltsWords, wordById, type Word } from "@/shared/data/ielts";
import { distractors, grade, markSpoken, pickRound, shuffle, type LevelFilter } from "@/entities/vocab";
import { canListen, canSpeak, checkWord, listen, speak, syllables, type ListenError } from "@/shared/lib/speech";
import { burst, haptic } from "@/shared/lib/motion/fx";
import { Glyph } from "@/shared/ui/glyph";
import { Art, Bar } from "@/shared/ui/kit";

export type GameProps = { userId: string; level: LevelFilter; cards: Map<string, VocabCard>; onExit: () => void };

/* ---------------------------------------------------------------- shared bits */

export function SpeakButtons({ text, compact = false }: { text: string; compact?: boolean }) {
  const { t } = useTranslation();
  if (!canSpeak) return null;
  return (
    <span className={`say-btns ${compact ? "is-compact" : ""}`}>
      <button type="button" className="say-btn" aria-label={t("learn.ielts.listen")} onClick={(e) => (e.stopPropagation(), void speak(text, "en-GB", 0.95))}>
        🔊{compact ? null : <span>{t("learn.ielts.listen")}</span>}
      </button>
      <button type="button" className="say-btn" aria-label={t("learn.ielts.listenSlow")} onClick={(e) => (e.stopPropagation(), void speak(text, "en-GB", 0.55))}>
        🐢{compact ? null : <span>{t("learn.ielts.listenSlow")}</span>}
      </button>
    </span>
  );
}

/** The example sentence with the headword highlighted or blanked out. */
export function Example({ word, blank = false }: { word: Word; blank?: boolean }) {
  const range = findInExample(word);
  if (!range) return <span>{word.example}</span>;
  const before = word.example.slice(0, range.start);
  const hit = word.example.slice(range.start, range.end);
  const after = word.example.slice(range.end);
  return (
    <span>
      {before}
      {blank ? <span className="gap">{"_".repeat(Math.max(4, Math.min(10, hit.length)))}</span> : <mark className="hit">{hit}</mark>}
      {after}
    </span>
  );
}

export function WordFacts({ word, showZh = true }: { word: Word; showZh?: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="word-facts">
      <div className="word-line">
        <strong className="word-big">{word.word}</strong>
        <span className="word-tag">{word.pos}</span>
        <span className={`word-tag is-${word.level.toLowerCase()}`}>{word.level}</span>
        <SpeakButtons text={word.word} compact />
      </div>
      <p className="word-def">{word.definition}</p>
      {showZh ? (
        <p className="word-zh" lang="zh-CN">
          {word.zh}
        </p>
      ) : null}
      <p className="word-ex">
        <small>{t("learn.ielts.example")}</small>
        <Example word={word} />
        <SpeakButtons text={word.example} compact />
      </p>
    </div>
  );
}

function RoundHead({ index, total, right, onExit }: { index: number; total: number; right: number; onExit: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="round-head">
      <button type="button" className="round-btn" aria-label={t("learn.ielts.exit")} onClick={onExit}>
        <Glyph name="close" size={18} stroke={2.4} />
      </button>
      <div className="round-bar">
        <Bar value={total ? index / total : 0} tone="lav" height={10} />
      </div>
      <span className="round-score">
        ✅ {right}/{total}
      </span>
    </div>
  );
}

export function RoundDone({ right, total, onAgain, onExit, extra }: { right: number; total: number; onAgain: () => void; onExit: () => void; extra?: ReactNode }) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (right / Math.max(1, total) >= 0.7) burst(ref.current, { count: 40 });
  }, [right, total]);
  return (
    <div className="card round-done rise" ref={ref}>
      <Art name={right / Math.max(1, total) >= 0.7 ? "c-arms-up" : "c-hug-heart"} className="round-done-art" />
      <strong className="heading">{t("learn.ielts.roundDone")}</strong>
      <span className="round-done-score">{t("learn.ielts.score", { right, total })}</span>
      <p className="sub">{t("learn.ielts.roundBody")}</p>
      {extra}
      <div className="row-btns">
        <button type="button" className="btn is-ghost" onClick={onExit}>
          {t("learn.ielts.exit")}
        </button>
        <button type="button" className="btn" onClick={onAgain}>
          {t("learn.ielts.again")}
        </button>
      </div>
    </div>
  );
}

/** Round state shared by question-style games. */
function useRound(props: GameProps, size: number, filter?: (w: Word) => boolean) {
  const [seed, setSeed] = useState(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const words = useMemo(() => pickRound(props.cards, props.level, size, filter), [seed, props.level]);
  const [index, setIndex] = useState(0);
  const [right, setRight] = useState(0);
  return {
    words,
    index,
    word: words[index] as Word | undefined,
    right,
    done: index >= words.length,
    async answer(ok: boolean, strength: "hard" | "good" | "easy" = "good") {
      haptic(ok ? 8 : [10, 40, 10]);
      if (ok) setRight((n) => n + 1);
      await grade(props.userId, words[index].id, ok, strength);
    },
    next: () => setIndex((n) => n + 1),
    restart: () => {
      setSeed((n) => n + 1);
      setIndex(0);
      setRight(0);
    },
  };
}

function Options({ options, correct, picked, onPick, render }: { options: Word[]; correct: string; picked: string | null; onPick: (id: string) => void; render: (w: Word) => ReactNode }) {
  return (
    <div className="quiz-opts">
      {options.map((option) => {
        const state = picked == null ? "" : option.id === correct ? "is-right" : option.id === picked ? "is-wrong" : "is-dim";
        return (
          <button key={option.id} type="button" className={`quiz-opt ${state}`} disabled={picked != null} onClick={() => onPick(option.id)}>
            {render(option)}
          </button>
        );
      })}
    </div>
  );
}

function Feedback({ ok, word, onNext }: { ok: boolean; word: Word; onNext: () => void }) {
  const { t } = useTranslation();
  return (
    <div className={`quiz-feedback rise ${ok ? "is-right" : "is-wrong"}`}>
      <strong>{ok ? t("learn.ielts.correct") : t("learn.ielts.incorrect")}</strong>
      <WordFacts word={word} />
      <button type="button" className="btn is-block" autoFocus onClick={onNext}>
        {t("learn.ielts.next")}
      </button>
    </div>
  );
}

/* ---------------------------------------------------------------- flashcards */

export function Flashcards(props: GameProps) {
  const { t } = useTranslation();
  const round = useRound(props, 15);
  const [flipped, setFlipped] = useState(false);
  if (round.done || !round.word) return <RoundDone right={round.right} total={round.words.length} onAgain={round.restart} onExit={props.onExit} />;
  const word = round.word;

  async function rate(ok: boolean, strength: "hard" | "good" | "easy") {
    await round.answer(ok, strength);
    setFlipped(false);
    round.next();
  }

  return (
    <div className="game">
      <RoundHead index={round.index} total={round.words.length} right={round.right} onExit={props.onExit} />
      <button type="button" className={`card flash ${flipped ? "is-flipped" : ""}`} onClick={() => setFlipped(true)}>
        {!flipped ? (
          <div className="flash-front">
            <strong className="word-huge">{word.word}</strong>
            <span className="word-tag">{word.pos}</span>
            <SpeakButtons text={word.word} />
            <small className="tiny">{t("learn.ielts.flash.tap")}</small>
          </div>
        ) : (
          <WordFacts word={word} />
        )}
      </button>
      {flipped ? (
        <div className="flash-rate rise">
          <button type="button" className="is-wrong" onClick={() => void rate(false, "good")}>
            😵 {t("learn.ielts.flash.forgot")}
          </button>
          <button type="button" className="is-almost" onClick={() => void rate(true, "hard")}>
            🤔 {t("learn.ielts.flash.hard")}
          </button>
          <button type="button" className="is-good" onClick={() => void rate(true, "good")}>
            🙂 {t("learn.ielts.flash.good")}
          </button>
          <button type="button" className="is-easy" onClick={() => void rate(true, "easy")}>
            😎 {t("learn.ielts.flash.easy")}
          </button>
        </div>
      ) : null}
    </div>
  );
}

/* ---------------------------------------------------------------- cloze & meaning */

export function Cloze(props: GameProps) {
  const { t } = useTranslation();
  const round = useRound(props, 10, (w) => findInExample(w) != null);
  const [picked, setPicked] = useState<string | null>(null);
  const [showZh, setShowZh] = useState(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const options = useMemo(() => (round.word ? shuffle([round.word, ...distractors(round.word, 3)]) : []), [round.word?.id]);
  if (round.done || !round.word) return <RoundDone right={round.right} total={round.words.length} onAgain={round.restart} onExit={props.onExit} />;
  const word = round.word;

  return (
    <div className="game">
      <RoundHead index={round.index} total={round.words.length} right={round.right} onExit={props.onExit} />
      <div className="card quiz-q">
        <p className="cloze-text">
          <Example word={word} blank={picked == null} />
        </p>
        {showZh ? (
          <p className="word-zh" lang="zh-CN">
            {word.zh}
          </p>
        ) : (
          <button type="button" className="link" onClick={() => setShowZh(true)}>
            {t("learn.ielts.showZh")}
          </button>
        )}
      </div>
      <Options
        options={options}
        correct={word.id}
        picked={picked}
        onPick={(id) => {
          setPicked(id);
          void round.answer(id === word.id, showZh ? "hard" : "good");
        }}
        render={(w) => w.word}
      />
      {picked ? (
        <Feedback
          ok={picked === word.id}
          word={word}
          onNext={() => {
            setPicked(null);
            setShowZh(false);
            round.next();
          }}
        />
      ) : null}
    </div>
  );
}

export function Meaning(props: GameProps) {
  const round = useRound(props, 10);
  const [picked, setPicked] = useState<string | null>(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const options = useMemo(() => (round.word ? shuffle([round.word, ...distractors(round.word, 3)]) : []), [round.word?.id]);
  if (round.done || !round.word) return <RoundDone right={round.right} total={round.words.length} onAgain={round.restart} onExit={props.onExit} />;
  const word = round.word;
  return (
    <div className="game">
      <RoundHead index={round.index} total={round.words.length} right={round.right} onExit={props.onExit} />
      <div className="card quiz-q is-center">
        <strong className="word-huge">{word.word}</strong>
        <span className="word-tag">{word.pos}</span>
        <SpeakButtons text={word.word} />
      </div>
      <Options
        options={options}
        correct={word.id}
        picked={picked}
        onPick={(id) => {
          setPicked(id);
          void round.answer(id === word.id);
        }}
        render={(w) => (
          <span className="opt-def">
            {w.definition}
            {picked ? <small lang="zh-CN"> · {w.zh}</small> : null}
          </span>
        )}
      />
      {picked ? (
        <Feedback
          ok={picked === word.id}
          word={word}
          onNext={() => {
            setPicked(null);
            round.next();
          }}
        />
      ) : null}
    </div>
  );
}

/* ---------------------------------------------------------------- riddles */

const single = (w: Word) => !w.word.includes(" ") && w.word.length >= 4 && w.word.length <= 13;

export function Riddle(props: GameProps) {
  const { t } = useTranslation();
  const round = useRound(props, 10, single);
  const [value, setValue] = useState("");
  const [hints, setHints] = useState(0);
  const [result, setResult] = useState<boolean | null>(null);
  if (round.done || !round.word) return <RoundDone right={round.right} total={round.words.length} onAgain={round.restart} onExit={props.onExit} />;
  const word = round.word;
  const target = word.word.toLowerCase();
  const shown = target.slice(0, 1 + hints);

  function submit(giveUp = false) {
    if (result != null) return;
    const ok = !giveUp && value.trim().toLowerCase() === target;
    setResult(ok);
    void round.answer(ok, hints >= 2 ? "hard" : "good");
  }

  return (
    <div className="game">
      <RoundHead index={round.index} total={round.words.length} right={round.right} onExit={props.onExit} />
      <div className="card quiz-q">
        <span className="riddle-mark">🧩</span>
        <p className="riddle-def">“{word.definition}”</p>
        <p className="tiny">{t("learn.ielts.riddle.clue", { letter: target[0].toUpperCase(), count: target.length })}</p>
        <div className="riddle-slots" aria-hidden>
          {target.split("").map((ch, i) => (
            <span key={i} className={i < shown.length || result != null ? "is-open" : ""}>
              {i < shown.length || result != null ? ch : ""}
            </span>
          ))}
        </div>
        {hints >= 2 ? (
          <p className="word-zh" lang="zh-CN">
            {word.zh}
          </p>
        ) : null}
      </div>
      {result == null ? (
        <form
          className="riddle-form"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <input className="input-big" value={value} autoFocus autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder={t("learn.ielts.riddle.placeholder")} onChange={(e) => setValue(e.target.value)} />
          <div className="row-btns">
            <button type="button" className="btn is-ghost" disabled={hints >= target.length - 2} onClick={() => setHints((n) => n + 1)}>
              💡 {t("learn.ielts.riddle.hint")}
            </button>
            <button type="button" className="btn is-ghost" onClick={() => submit(true)}>
              {t("learn.ielts.skip")}
            </button>
            <button type="submit" className="btn" disabled={!value.trim()}>
              {t("learn.ielts.check")}
            </button>
          </div>
        </form>
      ) : (
        <Feedback
          ok={result}
          word={word}
          onNext={() => {
            setResult(null);
            setValue("");
            setHints(0);
            round.next();
          }}
        />
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- anagram */

export function Anagram(props: GameProps) {
  const { t } = useTranslation();
  const round = useRound(props, 10, (w) => single(w) && w.word.length <= 11);
  const [used, setUsed] = useState<number[]>([]);
  const [result, setResult] = useState<boolean | null>(null);
  const target = round.word?.word.toLowerCase() ?? "";
  const tiles = useMemo(() => {
    let out = shuffle(target.split(""));
    for (let i = 0; i < 5 && out.join("") === target; i++) out = shuffle(out);
    return out;
  }, [target]);
  if (round.done || !round.word) return <RoundDone right={round.right} total={round.words.length} onAgain={round.restart} onExit={props.onExit} />;
  const word = round.word;
  const built = used.map((i) => tiles[i]).join("");

  function tap(i: number) {
    if (result != null || used.includes(i)) return;
    const next = [...used, i];
    setUsed(next);
    haptic(4);
    if (next.length === tiles.length) {
      const ok = next.map((k) => tiles[k]).join("") === target;
      setResult(ok);
      void round.answer(ok);
    }
  }

  return (
    <div className="game">
      <RoundHead index={round.index} total={round.words.length} right={round.right} onExit={props.onExit} />
      <div className="card quiz-q">
        <p className="riddle-def">“{word.definition}”</p>
        <div className={`ana-built ${result === true ? "is-right" : result === false ? "is-wrong" : ""}`}>
          {target.split("").map((_, i) => (
            <span key={i}>{built[i] ?? ""}</span>
          ))}
        </div>
      </div>
      {result == null ? (
        <>
          <div className="ana-tiles">
            {tiles.map((ch, i) => (
              <button key={i} type="button" className="ana-tile" disabled={used.includes(i)} onClick={() => tap(i)}>
                {ch}
              </button>
            ))}
          </div>
          <div className="row-btns">
            <button type="button" className="btn is-ghost" onClick={() => setUsed(used.slice(0, -1))}>
              ⌫
            </button>
            <button type="button" className="btn is-ghost" onClick={() => setUsed([])}>
              {t("learn.ielts.anagram.clear")}
            </button>
            <button
              type="button"
              className="btn is-ghost"
              onClick={() => {
                setResult(false);
                void round.answer(false);
              }}
            >
              {t("learn.ielts.skip")}
            </button>
          </div>
        </>
      ) : (
        <Feedback
          ok={result}
          word={word}
          onNext={() => {
            setResult(null);
            setUsed([]);
            round.next();
          }}
        />
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- speed round */

const bestKey = "bloom.ielts.speedBest";

export function Speed(props: GameProps) {
  const { t } = useTranslation();
  const [seed, setSeed] = useState(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const words = useMemo(() => pickRound(props.cards, props.level, 60), [seed]);
  const [index, setIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [left, setLeft] = useState(60);
  const [flash, setFlash] = useState<"" | "is-right" | "is-wrong">("");
  const best = Number(localStorage.getItem(bestKey) ?? 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const pair = useMemo(() => {
    const word = words[index % words.length];
    const truth = Math.random() < 0.5;
    const shown = truth ? word : distractors(word, 1)[0];
    return { word, truth, shown };
  }, [index, words]);

  useEffect(() => {
    if (left <= 0) {
      if (score > best) localStorage.setItem(bestKey, String(score));
      return;
    }
    const timer = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [left, score, best]);

  if (left <= 0)
    return (
      <RoundDone
        right={score}
        total={index}
        onExit={props.onExit}
        onAgain={() => {
          setSeed((n) => n + 1);
          setIndex(0);
          setScore(0);
          setLeft(60);
        }}
        extra={<span className="tiny">{t("learn.ielts.speed.best", { n: Math.max(best, score) })}</span>}
      />
    );

  function answer(yes: boolean) {
    const ok = yes === pair.truth;
    haptic(ok ? 6 : [10, 30, 10]);
    if (ok) setScore((n) => n + 1);
    else void grade(props.userId, pair.word.id, false);
    setFlash(ok ? "is-right" : "is-wrong");
    setTimeout(() => setFlash(""), 220);
    setIndex((n) => n + 1);
  }

  return (
    <div className="game">
      <div className="round-head">
        <button type="button" className="round-btn" aria-label={t("learn.ielts.exit")} onClick={props.onExit}>
          <Glyph name="close" size={18} stroke={2.4} />
        </button>
        <div className="round-bar">
          <Bar value={left / 60} tone={left > 10 ? "mint" : "coral"} height={10} />
        </div>
        <span className="round-score">
          ⚡ {score} · {t("learn.ielts.speed.time", { s: left })}
        </span>
      </div>
      <div className={`card quiz-q is-center speed-card ${flash}`}>
        <strong className="word-huge">{pair.word.word}</strong>
        <p className="tiny">{t("learn.ielts.speed.matches")}</p>
        <p className="riddle-def">{pair.shown.definition}</p>
      </div>
      <div className="speed-btns">
        <button type="button" className="is-wrong" onClick={() => answer(false)}>
          ✗ {t("learn.ielts.speed.no")}
        </button>
        <button type="button" className="is-good" onClick={() => answer(true)}>
          ✓ {t("learn.ielts.speed.yes")}
        </button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- say it */

type SpeakState = { kind: "idle" } | { kind: "listening" } | { kind: "ok" | "close" | "wrong"; heard: string } | { kind: "error"; error: ListenError };

export function SpeakCheck(props: GameProps & { only?: Word[] }) {
  const { t } = useTranslation();
  const [seed, setSeed] = useState(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const words = useMemo(() => props.only ?? pickRound(props.cards, props.level, 10), [seed]);
  const [index, setIndex] = useState(0);
  const [right, setRight] = useState(0);
  const [tries, setTries] = useState(0);
  const [state, setState] = useState<SpeakState>({ kind: "idle" });
  const stopRef = useRef<() => void>(() => {});
  const word = words[index];

  useEffect(() => () => stopRef.current(), []);

  if (!canListen)
    return (
      <div className="game">
        <div className="card quiz-q is-center">
          <Art name="c-frown" className="round-done-art" />
          <p>{t("learn.ielts.speak.unsupported")}</p>
          <button type="button" className="btn" onClick={props.onExit}>
            {t("learn.ielts.exit")}
          </button>
        </div>
      </div>
    );

  if (!word)
    return (
      <RoundDone
        right={right}
        total={words.length}
        onExit={props.onExit}
        onAgain={() => {
          setSeed((n) => n + 1);
          setIndex(0);
          setRight(0);
        }}
      />
    );

  async function go() {
    if (state.kind === "listening") return stopRef.current();
    setState({ kind: "listening" });
    haptic(10);
    const session = listen("en-GB");
    stopRef.current = session.stop;
    try {
      const heard = await session.done;
      const result = checkWord(word.word, heard);
      setTries((n) => n + 1);
      if (result.ok) {
        setState({ kind: "ok", heard: result.heard });
        haptic(12);
        await markSpoken(props.userId, word.id);
      } else setState({ kind: result.close ? "close" : "wrong", heard: result.heard || "…" });
    } catch (error) {
      setState({ kind: "error", error: (typeof error === "string" ? error : "other") as ListenError });
    }
  }

  function next() {
    const ok = state.kind === "ok";
    if (ok && tries <= 1) setRight((n) => n + 1);
    if (!props.only) void grade(props.userId, word.id, ok, tries <= 1 ? "good" : "hard");
    setTries(0);
    setState({ kind: "idle" });
    setIndex((n) => n + 1);
  }

  const errorText: Record<ListenError, string> = {
    unsupported: t("learn.ielts.speak.unsupported"),
    denied: t("learn.ielts.speak.denied"),
    network: t("learn.ielts.speak.network"),
    "no-speech": t("learn.ielts.speak.nothing"),
    aborted: t("learn.ielts.speak.nothing"),
    other: t("learn.ielts.speak.nothing"),
  };

  return (
    <div className="game">
      <RoundHead index={index} total={words.length} right={right} onExit={props.onExit} />
      <div className="card quiz-q is-center">
        <strong className="word-huge">{word.word}</strong>
        <span className="word-tag">{word.pos}</span>
        <p className="riddle-def">{word.definition}</p>
        <SpeakButtons text={word.word} />
        <div className="syl">
          <small className="tiny">{t("learn.ielts.speak.syllables")}:</small>
          {syllables(word.word).map((part, i) => (
            <button key={i} type="button" className="syl-chip" onClick={() => void speak(part, "en-GB", 0.6)}>
              {part}
            </button>
          ))}
        </div>
      </div>
      <button type="button" className={`mic-big ${state.kind === "listening" ? "is-on" : ""} ${state.kind === "ok" ? "is-ok" : ""}`} onClick={() => void go()}>
        <Glyph name="mic" size={34} stroke={2.2} />
      </button>
      <p className={`speak-result is-${state.kind}`} aria-live="polite">
        {state.kind === "idle" ? t("learn.ielts.speak.howTo") : null}
        {state.kind === "listening" ? t("learn.ielts.speak.listening") : null}
        {state.kind === "ok" ? t("learn.ielts.speak.ok", { heard: state.heard }) : null}
        {state.kind === "close" ? t("learn.ielts.speak.close", { heard: state.heard }) : null}
        {state.kind === "wrong" ? t("learn.ielts.speak.wrong", { heard: state.heard }) : null}
        {state.kind === "error" ? errorText[state.error] : null}
        {tries > 0 ? <small> · {t("learn.ielts.speak.tries", { n: tries })}</small> : null}
      </p>
      {state.kind === "close" || state.kind === "wrong" ? <SpellDiff target={word.word} heard={state.heard} /> : null}
      <button type="button" className={`btn is-block ${state.kind === "ok" ? "" : "is-ghost"}`} onClick={next}>
        {state.kind === "ok" ? t("learn.ielts.next") : t("learn.ielts.speak.skipWord")}
      </button>
    </div>
  );
}

/** Letter-level comparison of the target with what was heard, so she sees where it went off. */
function SpellDiff({ target, heard }: { target: string; heard: string }) {
  const a = target.toLowerCase();
  const b = heard.toLowerCase();
  const n = a.length;
  const m = b.length;
  const dp = Array.from({ length: n + 1 }, () => Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const marks: boolean[] = [];
  let i = 0;
  let j = 0;
  while (i < n) {
    if (j < m && a[i] === b[j]) {
      marks.push(true);
      i++;
      j++;
    } else if (j < m && dp[i][j + 1] >= dp[i + 1][j]) j++;
    else {
      marks.push(false);
      i++;
    }
  }
  return (
    <p className="spell-diff">
      {target.split("").map((ch, k) => (
        <span key={k} className={marks[k] ? "" : "is-off"}>
          {ch}
        </span>
      ))}
    </p>
  );
}

/* ---------------------------------------------------------------- dictionary */

export function Dictionary(props: GameProps & { onSpeak: (word: Word) => void }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const q = query.trim().toLowerCase();
  const list = ieltsWords.filter((w) => (props.level === "all" || w.level === props.level) && (!q || `${w.word} ${w.definition} ${w.zh}`.toLowerCase().includes(q)));
  return (
    <div className="game">
      <div className="round-head">
        <button type="button" className="round-btn" aria-label={t("learn.ielts.exit")} onClick={props.onExit}>
          <Glyph name="back" size={18} stroke={2.4} />
        </button>
        <span className="input is-grow">
          <Glyph name="search" size={18} />
          <input value={query} placeholder={t("learn.ielts.dict.search")} onChange={(e) => setQuery(e.target.value)} />
        </span>
      </div>
      <small className="tiny">{t("learn.ielts.dict.shown", { n: list.length })}</small>
      <div className="dict">
        {list.slice(0, 200).map((w) => {
          const card = props.cards.get(w.id);
          const dot = !card ? "is-new" : card.box >= 4 ? "is-mastered" : "is-learning";
          return (
            <div key={w.id} className={`dict-row ${open === w.id ? "is-open" : ""}`}>
              <button type="button" className="dict-head" onClick={() => setOpen(open === w.id ? null : w.id)}>
                <i className={`dict-dot ${dot}`} />
                <strong>{w.word}</strong>
                <span className="word-tag">{w.level}</span>
                {card?.spoken ? <span title="said right">🎤</span> : null}
                <span className="dict-zh" lang="zh-CN">
                  {w.zh}
                </span>
              </button>
              {open === w.id ? (
                <div className="dict-body">
                  <WordFacts word={w} showZh={false} />
                  <button type="button" className="btn is-sm" onClick={() => props.onSpeak(w)}>
                    <Glyph name="mic" size={16} /> {t("learn.ielts.game.speak")}
                  </button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export { wordById };
