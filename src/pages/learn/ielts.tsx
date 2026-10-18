import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useUser } from "@/entities/session";
import { stats, useVocab, type LevelFilter } from "@/entities/vocab";
import { ieltsWords, type Word } from "@/shared/data/ielts";
import { Ring } from "@/shared/ui/kit";
import { Crossword } from "./crossword";
import { Duels } from "./duel";
import { ExamPractice } from "./exam";
import { Anagram, Cloze, Dictionary, Flashcards, Meaning, Riddle, SpeakCheck, Speed, type GameProps } from "./ielts-games";

type GameId = "flash" | "cloze" | "meaning" | "riddle" | "anagram" | "crossword" | "speed" | "speak" | "duel" | "dictionary" | "exam";

const games: Array<{ id: GameId; icon: string; tone: string }> = [
  { id: "cloze", icon: "🧠", tone: "lav" },
  { id: "flash", icon: "🃏", tone: "pink" },
  { id: "speak", icon: "🎤", tone: "mint" },
  { id: "crossword", icon: "✏️", tone: "sun" },
  { id: "riddle", icon: "🧩", tone: "sky" },
  { id: "meaning", icon: "🎯", tone: "peach" },
  { id: "anagram", icon: "🔤", tone: "cream" },
  { id: "speed", icon: "⚡", tone: "coral" },
  { id: "duel", icon: "⚔️", tone: "pink" },
  { id: "exam", icon: "🎓", tone: "lav" },
  { id: "dictionary", icon: "📖", tone: "mint" },
];

const levelKey = "bloom.ielts.level";

export function IeltsHub() {
  const { t } = useTranslation();
  const user = useUser();
  const userId = user.id;
  const cards = useVocab(userId || undefined);
  const [level, setLevelState] = useState<LevelFilter>(() => {
    try {
      return (localStorage.getItem(levelKey) as LevelFilter) || "all";
    } catch {
      return "all";
    }
  });
  const [game, setGame] = useState<GameId | null>(null);
  const [speakOnly, setSpeakOnly] = useState<Word[] | undefined>();
  const s = stats(cards, level);

  function setLevel(next: LevelFilter) {
    setLevelState(next);
    try {
      localStorage.setItem(levelKey, next);
    } catch {
      /* storage may be unavailable */
    }
  }

  const props: GameProps = {
    userId,
    level,
    cards,
    onExit: () => {
      setGame(null);
      setSpeakOnly(undefined);
      window.scrollTo({ top: 0 });
    },
  };

  if (game) {
    const key = `${game}-${level}`;
    if (game === "flash") return <Flashcards key={key} {...props} />;
    if (game === "cloze") return <Cloze key={key} {...props} />;
    if (game === "meaning") return <Meaning key={key} {...props} />;
    if (game === "riddle") return <Riddle key={key} {...props} />;
    if (game === "anagram") return <Anagram key={key} {...props} />;
    if (game === "crossword") return <Crossword key={key} {...props} />;
    if (game === "speed") return <Speed key={key} {...props} />;
    if (game === "speak") return <SpeakCheck key={key} {...props} only={speakOnly} />;
    if (game === "duel") return <Duels key={key} {...props} />;
    if (game === "exam") return <ExamPractice key={key} {...props} />;
    return (
      <Dictionary
        key={key}
        {...props}
        onSpeak={(word) => {
          setSpeakOnly([word]);
          setGame("speak");
        }}
      />
    );
  }

  const known = s.learning + s.mastered;

  return (
    <div className="learn">
      <section className="card learn-hero tone-lav rise">
        <Ring value={s.total ? s.mastered / s.total : 0} size={86} stroke={9} color="var(--lav)" track="var(--lav-100)">
          <span className="learn-ring">
            <b>{s.mastered}</b>
            <small>/{s.total}</small>
          </span>
        </Ring>
        <div>
          <strong className="heading">{t("learn.ielts.title")}</strong>
          <p className="sub">{t("learn.ielts.body", { count: ieltsWords.length })}</p>
          <div className="learn-progress">
            <span>
              🌱 {s.learning} {t("learn.ielts.learning")}
            </span>
            <span>
              🔁 {s.due} {t("learn.ielts.due")}
            </span>
            <span>
              🎤 {s.spoken} {t("learn.ielts.spoken")}
            </span>
          </div>
        </div>
      </section>

      <div className="chips">
        {(["all", "B1", "B2", "C1"] as LevelFilter[]).map((id) => (
          <button key={id} type="button" className={`chip ${level === id ? "is-on" : ""}`} onClick={() => setLevel(id)}>
            {id === "all" ? t("learn.ielts.all") : id}
          </button>
        ))}
      </div>

      <button type="button" className="card daily-mix rise" onClick={() => setGame(known ? "flash" : "cloze")}>
        <span className="daily-mix-icon">✨</span>
        <span>
          <strong className="heading">{t("learn.ielts.daily")}</strong>
          <small className="sub">{t("learn.ielts.dailyBody", { count: Math.max(15, s.due) })}</small>
        </span>
        <span className="btn is-sm">{t("learn.ielts.start")}</span>
      </button>

      <h3 className="tiny-head">{t("learn.ielts.games")}</h3>
      <div className="game-grid">
        {games.map((item, i) => (
          <button key={item.id} type="button" className={`card game-card tone-${item.tone} rise`} style={{ animationDelay: `${i * 30}ms` }} onClick={() => setGame(item.id)}>
            <span className="game-icon">{item.icon}</span>
            <strong>{t(`learn.ielts.game.${item.id}`)}</strong>
            <small>{t(`learn.ielts.game.${item.id}Body`)}</small>
          </button>
        ))}
      </div>
    </div>
  );
}
