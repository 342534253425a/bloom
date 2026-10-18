import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { pickRound } from "@/entities/vocab";
import { RecordButton } from "@/features/couple/voice";
import type { Recording } from "@/shared/lib/media";
import { Glyph } from "@/shared/ui/glyph";
import { Tabs } from "@/shared/ui/bloom";
import type { GameProps } from "./ielts-games";

const part1 = [
  "Do you work or are you a student?",
  "What do you like most about your hometown?",
  "How do you usually spend your weekends?",
  "Do you prefer reading books or watching films? Why?",
  "How often do you use public transport?",
  "Do you like cooking? What do you usually cook?",
  "What kind of music do you listen to?",
  "Is it easy to make friends in your city?",
  "Do you think you use your phone too much?",
  "What did you enjoy doing as a child?",
  "Do you prefer mornings or evenings?",
  "How do you usually celebrate your birthday?",
  "Would you like to learn another language? Why?",
  "Do you like rainy days?",
  "What's your favourite season and why?",
  "Do you often go shopping?",
];

const part2 = [
  "Describe a person who has inspired you. You should say: who this person is, how you know them, what they did, and explain why they inspired you.",
  "Describe a place you would like to visit in the future. You should say: where it is, how you know about it, what you would do there, and explain why you want to go.",
  "Describe a skill you learned that was difficult. You should say: what the skill is, when you learned it, how you learned it, and explain why it was difficult.",
  "Describe a memorable journey you have taken. You should say: where you went, who you went with, what happened, and explain why it was memorable.",
  "Describe a piece of technology you find useful. You should say: what it is, how often you use it, what you use it for, and explain why it is useful.",
  "Describe a time you helped someone. You should say: who you helped, how you helped them, why they needed help, and explain how you felt.",
  "Describe a book or film that made you think. You should say: what it was, when you read or saw it, what it was about, and explain why it made you think.",
  "Describe an important decision you made. You should say: what the decision was, when you made it, why you made it, and explain how it changed your life.",
  "Describe a festival that is important in your country. You should say: what it is, when it happens, what people do, and explain why it is important.",
  "Describe a goal you want to achieve. You should say: what it is, why you want to achieve it, how you plan to do it, and explain how you will feel when you achieve it.",
];

const part3 = [
  "Why do some people prefer living in big cities?",
  "How has technology changed the way people communicate?",
  "Should university education be free for everyone?",
  "What are the advantages and disadvantages of working from home?",
  "Do you think tourism does more harm than good?",
  "How can governments encourage people to live more healthily?",
  "Is it important for children to learn a foreign language at a young age?",
  "What problems are caused by an ageing population?",
  "Do you think social media has a positive influence on young people?",
  "How can individuals help to protect the environment?",
  "Why do some people find it hard to save money?",
  "Will robots replace teachers in the future?",
];

const task2 = [
  "Some people believe that university students should pay all the cost of their studies. Others think that university education should be free. Discuss both views and give your own opinion.",
  "In many countries, people are living longer. What problems does this cause? What solutions can you suggest?",
  "Some people think that the best way to reduce crime is to give longer prison sentences. Others believe there are better ways. Discuss both views and give your opinion.",
  "Many people now work from home using technology. Do the advantages of this outweigh the disadvantages?",
  "Tourism brings many benefits, but it can also damage the environment and local culture. To what extent do you agree?",
  "Some people say that advertising encourages us to buy things we do not need. Others say it is a useful source of information. Discuss both views.",
  "Children today spend too much time on screens. What are the causes of this, and how can the problem be solved?",
  "Governments should spend more money on public transport than on building new roads. To what extent do you agree or disagree?",
  "It is more important to protect wildlife than to develop land for housing. Do you agree or disagree?",
  "Some believe that learning a foreign language at school is a waste of time because of translation technology. To what extent do you agree?",
];

const task1 = [
  "The line graph shows the number of international students in three countries between 2000 and 2020. Summarise the information by selecting and reporting the main features, and make comparisons where relevant.",
  "The bar chart compares the percentage of household income spent on housing, food, transport and leisure in 1990 and 2020. Summarise the main features.",
  "The pie charts show the sources of electricity in a country in 2005 and 2025. Summarise the information and make comparisons where relevant.",
  "The diagram shows how recycled paper is produced. Summarise the information by describing the main stages of the process.",
];

const pickOne = (list: string[], not?: string) => {
  const options = list.filter((item) => item !== not);
  return options[Math.floor(Math.random() * options.length)];
};

export function ExamPractice(props: GameProps) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<"speaking" | "writing">("speaking");
  return (
    <div className="game">
      <div className="round-head">
        <button type="button" className="round-btn" aria-label={t("learn.ielts.exit")} onClick={props.onExit}>
          <Glyph name="back" size={18} stroke={2.4} />
        </button>
        <strong className="round-title">🎓 {t("learn.ielts.game.exam")}</strong>
      </div>
      <Tabs
        value={tab}
        onChange={setTab}
        options={[
          { id: "speaking", label: `🗣️ ${t("learn.ielts.exam.speaking")}` },
          { id: "writing", label: `✍️ ${t("learn.ielts.exam.writing")}` },
        ]}
      />
      {tab === "speaking" ? <Speaking /> : <Writing {...props} />}
      <div className="card exam-ai">
        <strong>🤖 {t("learn.ielts.exam.ai")}</strong>
        <p className="sub">{t("learn.ielts.exam.aiSoon")}</p>
      </div>
    </div>
  );
}

function Countdown({ seconds, running, onEnd }: { seconds: number; running: boolean; onEnd?: () => void }) {
  const [left, setLeft] = useState(seconds);
  useEffect(() => setLeft(seconds), [seconds]);
  useEffect(() => {
    if (!running) return;
    if (left <= 0) {
      onEnd?.();
      return;
    }
    const timer = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [running, left, onEnd]);
  const m = Math.floor(left / 60);
  const s = left % 60;
  return (
    <span className={`exam-clock ${left <= 10 && running ? "is-low" : ""}`}>
      ⏱ {m}:{String(s).padStart(2, "0")}
    </span>
  );
}

function Speaking() {
  const { t } = useTranslation();
  const [part, setPart] = useState<1 | 2 | 3>(1);
  const bank = part === 1 ? part1 : part === 2 ? part2 : part3;
  const [question, setQuestion] = useState(() => pickOne(part1));
  const [prep, setPrep] = useState(false);
  const [answer, setAnswer] = useState<{ url: string; duration: number } | null>(null);

  useEffect(() => {
    setQuestion(pickOne(bank));
    setAnswer(null);
    setPrep(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [part]);

  useEffect(() => () => (answer ? URL.revokeObjectURL(answer.url) : undefined), [answer]);

  function onRecorded(recording: Recording) {
    setAnswer({ url: URL.createObjectURL(recording.blob), duration: recording.duration });
  }

  return (
    <div className="exam">
      <div className="chips">
        {([1, 2, 3] as const).map((n) => (
          <button key={n} type="button" className={`chip ${part === n ? "is-on" : ""}`} onClick={() => setPart(n)}>
            {t("learn.ielts.exam.part", { n })}
          </button>
        ))}
      </div>
      <div className="card exam-q rise" key={question}>
        <p>{question}</p>
        {part === 2 ? (
          <div className="exam-row">
            <small className="tiny">{t("learn.ielts.exam.prep", { s: 60 })}</small>
            {prep ? <Countdown seconds={60} running={prep} onEnd={() => setPrep(false)} /> : <button type="button" className="btn is-sm is-ghost" onClick={() => setPrep(true)}>{t("learn.ielts.exam.startTimer")}</button>}
          </div>
        ) : null}
        <small className="tiny">{t("learn.ielts.exam.speak", { min: part === 1 ? 1 : 2 })}</small>
      </div>
      <div className="exam-row">
        <RecordButton onDone={onRecorded} label={t("learn.ielts.exam.record")} />
        <button type="button" className="btn is-sm is-ghost" onClick={() => setQuestion(pickOne(bank, question))}>
          🔄 {t("learn.ielts.exam.another")}
        </button>
      </div>
      {answer ? (
        <div className="card exam-answer">
          <small className="tiny">{t("learn.ielts.exam.yourAnswer")}</small>
          <audio src={answer.url} controls preload="metadata" />
        </div>
      ) : null}
    </div>
  );
}

const draftKey = "bloom.ielts.draft";

function Writing(props: GameProps) {
  const { t } = useTranslation();
  const [task, setTask] = useState<1 | 2>(2);
  const [prompt, setPrompt] = useState(() => pickOne(task2));
  const [text, setText] = useState(() => {
    try {
      return localStorage.getItem(draftKey) ?? "";
    } catch {
      return "";
    }
  });
  const [running, setRunning] = useState(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const useWords = useMemo(() => pickRound(props.cards, props.level, 6, (w) => w.level !== "B1").map((w) => w.word), [prompt]);
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const goal = task === 1 ? 150 : 250;

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(draftKey, text);
      } catch {
        /* storage may be unavailable */
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [text]);

  return (
    <div className="exam">
      <div className="chips">
        {([1, 2] as const).map((n) => (
          <button
            key={n}
            type="button"
            className={`chip ${task === n ? "is-on" : ""}`}
            onClick={() => {
              setTask(n);
              setPrompt(pickOne(n === 1 ? task1 : task2));
              setRunning(false);
            }}
          >
            {n === 1 ? t("learn.ielts.exam.task1") : t("learn.ielts.exam.task2")}
          </button>
        ))}
      </div>
      <div className="card exam-q rise" key={prompt}>
        <p>{prompt}</p>
        <small className="tiny">{t("learn.ielts.exam.useWords", { words: useWords.join(", ") })}</small>
        <div className="exam-row">
          {running ? <Countdown seconds={task === 1 ? 20 * 60 : 40 * 60} running={running} onEnd={() => setRunning(false)} /> : <button type="button" className="btn is-sm is-ghost" onClick={() => setRunning(true)}>⏱ {t("learn.ielts.exam.startTimer")}</button>}
          <button type="button" className="btn is-sm is-ghost" onClick={() => setPrompt(pickOne(task === 1 ? task1 : task2, prompt))}>
            🔄 {t("learn.ielts.exam.another")}
          </button>
        </div>
      </div>
      <textarea className="exam-text" value={text} placeholder={t("learn.ielts.exam.placeholder")} onChange={(e) => setText(e.target.value)} rows={12} />
      <div className="exam-row">
        <span className={`exam-count ${words >= goal ? "is-ok" : ""}`}>{t("learn.ielts.exam.words", { n: words })} / {goal}</span>
        <small className="tiny">{t("learn.ielts.exam.saved")}</small>
      </div>
    </div>
  );
}
