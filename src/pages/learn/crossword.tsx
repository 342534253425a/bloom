import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Word } from "@/shared/data/ielts";
import { grade, pickRound } from "@/entities/vocab";
import { burst, haptic } from "@/shared/lib/motion/fx";
import { Glyph } from "@/shared/ui/glyph";
import type { GameProps } from "./ielts-games";
import { WordFacts } from "./ielts-games";

type Dir = "across" | "down";
type Placed = { word: Word; text: string; row: number; col: number; dir: Dir; num: number };

const size = 15;
const key = (r: number, c: number) => `${r},${c}`;

/** Greedy crossword builder: each new word must cross an existing one and never touch it side by side. */
function build(words: Word[], max = 8): Placed[] {
  const grid = new Map<string, string>();
  const placed: Array<Omit<Placed, "num">> = [];
  const step = (dir: Dir) => (dir === "across" ? [0, 1] : [1, 0]);

  function fits(text: string, row: number, col: number, dir: Dir) {
    const [dr, dc] = step(dir);
    const [pr, pc] = [dc, dr];
    if (row < 0 || col < 0 || row + dr * (text.length - 1) >= size || col + dc * (text.length - 1) >= size) return -1;
    if (grid.has(key(row - dr, col - dc)) || grid.has(key(row + dr * text.length, col + dc * text.length))) return -1;
    let crossings = 0;
    for (let i = 0; i < text.length; i++) {
      const r = row + dr * i;
      const c = col + dc * i;
      const here = grid.get(key(r, c));
      if (here) {
        if (here !== text[i]) return -1;
        crossings += 1;
      } else if (grid.has(key(r + pr, c + pc)) || grid.has(key(r - pr, c - pc))) return -1;
    }
    return crossings;
  }

  function put(word: Word, text: string, row: number, col: number, dir: Dir) {
    const [dr, dc] = step(dir);
    for (let i = 0; i < text.length; i++) grid.set(key(row + dr * i, col + dc * i), text[i]);
    placed.push({ word, text, row, col, dir });
  }

  for (const word of words) {
    if (placed.length >= max) break;
    const text = word.word.toLowerCase();
    if (!placed.length) {
      put(word, text, Math.floor(size / 2), Math.floor((size - text.length) / 2), "across");
      continue;
    }
    let best: { row: number; col: number; dir: Dir; score: number } | null = null;
    for (const other of placed) {
      const dir: Dir = other.dir === "across" ? "down" : "across";
      for (let i = 0; i < text.length; i++)
        for (let j = 0; j < other.text.length; j++) {
          if (text[i] !== other.text[j]) continue;
          const [odr, odc] = step(other.dir);
          const [dr, dc] = step(dir);
          const row = other.row + odr * j - dr * i;
          const col = other.col + odc * j - dc * i;
          const score = fits(text, row, col, dir);
          if (score > 0 && (!best || score > best.score)) best = { row, col, dir, score };
        }
    }
    if (best) put(word, text, best.row, best.col, best.dir);
  }

  // Trim to the used area and number the starts in reading order.
  const minR = Math.min(...placed.map((p) => p.row));
  const minC = Math.min(...placed.map((p) => p.col));
  const shifted = placed.map((p) => ({ ...p, row: p.row - minR, col: p.col - minC }));
  const starts = [...new Set(shifted.map((p) => key(p.row, p.col)))].sort((a, b) => {
    const [ar, ac] = a.split(",").map(Number);
    const [br, bc] = b.split(",").map(Number);
    return ar - br || ac - bc;
  });
  return shifted.map((p) => ({ ...p, num: starts.indexOf(key(p.row, p.col)) + 1 }));
}

function cellsOf(p: Placed) {
  return Array.from({ length: p.text.length }, (_, i) => (p.dir === "across" ? key(p.row, p.col + i) : key(p.row + i, p.col)));
}

export function Crossword(props: GameProps) {
  const { t } = useTranslation();
  const [seed, setSeed] = useState(0);
  const puzzle = useMemo(() => {
    const pool = pickRound(props.cards, props.level, 60, (w) => !w.word.includes(" ") && !w.word.includes("-") && w.word.length >= 4 && w.word.length <= 9);
    // Try a few orderings and keep the fullest grid.
    let best: Placed[] = [];
    for (let attempt = 0; attempt < 6 && best.length < 7; attempt++) {
      const order = attempt === 0 ? pool : [...pool].sort(() => Math.random() - 0.5);
      const result = build(order);
      if (result.length > best.length) best = result;
    }
    return best;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed, props.level]);

  const solution = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of puzzle) cellsOf(p).forEach((k, i) => map.set(k, p.text[i]));
    return map;
  }, [puzzle]);
  const numbers = useMemo(() => new Map(puzzle.map((p) => [key(p.row, p.col), p.num])), [puzzle]);
  const rows = Math.max(...puzzle.map((p) => p.row + (p.dir === "down" ? p.text.length : 1)));
  const cols = Math.max(...puzzle.map((p) => p.col + (p.dir === "across" ? p.text.length : 1)));

  const [entries, setEntries] = useState<Record<string, string>>({});
  const [active, setActive] = useState(0);
  const [checked, setChecked] = useState(false);
  const [graded, setGraded] = useState<Set<number>>(new Set());
  const [hinted, setHinted] = useState<Set<number>>(new Set());
  const inputs = useRef(new Map<string, HTMLInputElement>());
  const boardRef = useRef<HTMLDivElement>(null);
  const current = puzzle[active];
  const activeCells = current ? cellsOf(current) : [];
  const solvedWords = puzzle.map((p) => cellsOf(p).every((k) => entries[k] === solution.get(k)));
  const allSolved = puzzle.length > 0 && solvedWords.every(Boolean);

  function focus(k: string) {
    inputs.current.get(k)?.focus();
  }

  function select(k: string) {
    const options = puzzle.map((p, i) => ({ p, i })).filter(({ p }) => cellsOf(p).includes(k));
    if (!options.length) return;
    const same = options.find(({ i }) => i === active);
    const pick = same && options.length > 1 && activeCells.includes(k) ? options.find(({ i }) => i !== active) ?? same : options.find(({ p }) => p.dir === current?.dir) ?? options[0];
    setActive(pick.i);
  }

  function type(k: string, value: string) {
    // Fast typing, paste or autocorrect can deliver several letters at once: spread them along the word.
    const old = entries[k] ?? "";
    let letters = value.toLowerCase().replace(/[^a-z]/g, "");
    if (old && letters.length > 1 && letters.startsWith(old)) letters = letters.slice(old.length);
    else if (old && letters.length > 1 && letters.endsWith(old)) letters = letters.slice(0, -old.length);
    setChecked(false);
    const idx = activeCells.indexOf(k);
    if (!letters || idx < 0) {
      setEntries((prev) => ({ ...prev, [k]: letters.slice(-1) }));
      return;
    }
    const patch: Record<string, string> = {};
    let last = idx;
    for (let i = 0; i < letters.length && idx + i < activeCells.length; i++) {
      patch[activeCells[idx + i]] = letters[i];
      last = idx + i;
    }
    setEntries((prev) => ({ ...prev, ...patch }));
    const next = activeCells[last + 1];
    if (next) focus(next);
  }

  function back(k: string) {
    if (entries[k]) return;
    const idx = activeCells.indexOf(k);
    const prev = activeCells[idx - 1];
    if (prev) {
      setEntries((e) => ({ ...e, [prev]: "" }));
      focus(prev);
    }
  }

  function check() {
    setChecked(true);
    const done = new Set(graded);
    puzzle.forEach((p, i) => {
      if (done.has(i)) return;
      const filled = cellsOf(p).every((k) => entries[k]);
      if (!filled) return;
      done.add(i);
      void grade(props.userId, p.word.id, solvedWords[i] && !hinted.has(i), hinted.has(i) ? "hard" : "good");
    });
    setGraded(done);
    if (allSolved) {
      haptic([10, 40, 10]);
      burst(boardRef.current, { count: 60 });
    }
  }

  function reveal() {
    if (!current) return;
    const k = activeCells.find((c) => entries[c] !== solution.get(c));
    if (!k) return;
    setEntries((e) => ({ ...e, [k]: solution.get(k) ?? "" }));
    setHinted((h) => new Set(h).add(active));
    focus(k);
  }

  function restart() {
    setSeed((n) => n + 1);
    setEntries({});
    setActive(0);
    setChecked(false);
    setGraded(new Set());
    setHinted(new Set());
  }

  if (!puzzle.length) return null;

  const clueList = (dir: Dir) =>
    puzzle
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => p.dir === dir)
      .sort((a, b) => a.p.num - b.p.num);

  return (
    <div className="game">
      <div className="round-head">
        <button type="button" className="round-btn" aria-label={t("learn.ielts.exit")} onClick={props.onExit}>
          <Glyph name="close" size={18} stroke={2.4} />
        </button>
        <strong className="round-title">{t("learn.ielts.game.crossword")}</strong>
        <button type="button" className="round-btn" aria-label={t("learn.ielts.crossword.newOne")} onClick={restart}>
          🔄
        </button>
      </div>
      {current ? (
        <div className="card cw-clue">
          <b>
            {current.num} {t(`learn.ielts.crossword.${current.dir}`)}
          </b>
          <span>{current.word.definition}</span>
          <small className="tiny">({current.text.length})</small>
        </div>
      ) : null}
      <div className="cw-wrap" ref={boardRef} style={{ ["--cw-cell" as string]: `min(40px, calc((min(100vw, 640px) - 52px - ${(cols - 1) * 2}px) / ${cols}))` }}>
        <div className="cw" style={{ gridTemplateColumns: `repeat(${cols}, var(--cw-cell))` }}>
          {Array.from({ length: rows * cols }, (_, n) => {
            const r = Math.floor(n / cols);
            const c = n % cols;
            const k = key(r, c);
            const answer = solution.get(k);
            if (!answer) return <span key={k} className="cw-void" />;
            const value = entries[k] ?? "";
            const wrong = checked && value && value !== answer;
            const right = checked && value === answer;
            return (
              <label key={k} className={`cw-cell ${activeCells.includes(k) ? "is-active" : ""} ${wrong ? "is-wrong" : ""} ${right ? "is-right" : ""}`}>
                {numbers.has(k) ? <small>{numbers.get(k)}</small> : null}
                <input
                  ref={(el) => {
                    if (el) inputs.current.set(k, el);
                  }}
                  value={value.toUpperCase()}
                  inputMode="text"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  aria-label={k}
                  onFocus={() => {
                    if (!activeCells.includes(k)) select(k);
                  }}
                  onClick={() => select(k)}
                  onChange={(e) => type(k, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Backspace") back(k);
                  }}
                />
              </label>
            );
          })}
        </div>
      </div>
      <div className="row-btns">
        <button type="button" className="btn is-ghost" onClick={reveal}>
          💡 {t("learn.ielts.crossword.reveal")}
        </button>
        <button type="button" className="btn" onClick={check}>
          {t("learn.ielts.crossword.check")}
        </button>
      </div>
      {allSolved && checked ? (
        <div className="card round-done rise">
          <strong className="heading">{t("learn.ielts.crossword.solved")}</strong>
          <button type="button" className="btn" onClick={restart}>
            {t("learn.ielts.crossword.newOne")}
          </button>
        </div>
      ) : null}
      <div className="cw-clues">
        {(["across", "down"] as Dir[]).map((dir) => (
          <div key={dir}>
            <h3 className="tiny-head">{t(`learn.ielts.crossword.${dir}`)}</h3>
            {clueList(dir).map(({ p, i }) => (
              <button
                key={i}
                type="button"
                className={`cw-clue-row ${i === active ? "is-on" : ""} ${solvedWords[i] && checked ? "is-done" : ""}`}
                onClick={() => {
                  setActive(i);
                  focus(cellsOf(p).find((k) => !entries[k]) ?? cellsOf(p)[0]);
                }}
              >
                <b>{p.num}</b> {p.word.definition} <small>({p.text.length})</small>
              </button>
            ))}
          </div>
        ))}
      </div>
      {allSolved && checked ? (
        <div className="cw-review">
          {puzzle.map((p) => (
            <div key={p.word.id} className="card">
              <WordFacts word={p.word} />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
