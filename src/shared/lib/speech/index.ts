/**
 * Free, on-device speech: the browser's text-to-speech for model pronunciation and its speech
 * recognition for a word-level "did you say it right" check. No keys, no cost.
 */

let voicesReady: Promise<SpeechSynthesisVoice[]> | null = null;

function voices(): Promise<SpeechSynthesisVoice[]> {
  if (typeof speechSynthesis === "undefined") return Promise.resolve([]);
  voicesReady ??= new Promise((resolve) => {
    const now = speechSynthesis.getVoices();
    if (now.length) return resolve(now);
    const done = () => resolve(speechSynthesis.getVoices());
    speechSynthesis.addEventListener("voiceschanged", done, { once: true });
    setTimeout(done, 1200);
  });
  return voicesReady;
}

export const canSpeak = typeof window !== "undefined" && "speechSynthesis" in window;

/** Speaks text; `lang` like "en-GB" or "zh-CN", `rate` 0.5 (very slow) … 1.2 (fast). */
export async function speak(text: string, lang = "en-GB", rate = 0.95): Promise<void> {
  if (!canSpeak) return;
  const list = await voices();
  speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = lang;
  utter.rate = rate;
  const base = lang.slice(0, 2);
  utter.voice =
    list.find((v) => v.lang === lang && /natural|premium|enhanced|google/i.test(v.name)) ??
    list.find((v) => v.lang === lang) ??
    list.find((v) => v.lang.replace("_", "-").startsWith(base)) ??
    null;
  return new Promise((resolve) => {
    utter.onend = () => resolve();
    utter.onerror = () => resolve();
    speechSynthesis.speak(utter);
  });
}

type RecognitionCtor = new () => {
  lang: string;
  maxAlternatives: number;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string; confidence: number }>> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export const canListen = recognitionCtor() !== null;

export type Heard = { alternatives: Array<{ text: string; confidence: number }> };
export type ListenError = "unsupported" | "denied" | "no-speech" | "network" | "aborted" | "other";

export type Listening = { done: Promise<Heard>; stop: () => void };

/** Listens for one short utterance and returns what the recogniser thinks was said. */
export function listen(lang = "en-GB"): Listening {
  const Ctor = recognitionCtor();
  if (!Ctor) return { done: Promise.reject<Heard>("unsupported" satisfies ListenError), stop: () => {} };
  const rec = new Ctor();
  rec.lang = lang;
  rec.maxAlternatives = 5;
  rec.interimResults = false;
  rec.continuous = false;
  const done = new Promise<Heard>((resolve, reject) => {
    let got = false;
    rec.onresult = (event) => {
      got = true;
      const first = event.results[0];
      const alternatives = Array.from({ length: first.length }, (_, i) => ({ text: first[i].transcript, confidence: first[i].confidence }));
      resolve({ alternatives });
    };
    rec.onerror = (event) => {
      const map: Record<string, ListenError> = { "not-allowed": "denied", "service-not-allowed": "denied", "no-speech": "no-speech", network: "network", aborted: "aborted" };
      reject(map[event.error] ?? "other");
    };
    rec.onend = () => {
      if (!got) reject("no-speech" satisfies ListenError);
    };
  });
  rec.start();
  return { done, stop: () => rec.stop() };
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z\s-]/g, " ")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** British/American spelling pairs the recogniser may return for the same sound. */
function variants(word: string): string[] {
  const w = norm(word);
  const out = new Set([w]);
  out.add(w.replace(/ise\b/g, "ize").replace(/isation\b/g, "ization").replace(/our\b/g, "or").replace(/ogue\b/g, "og").replace(/ll(ed|ing)\b/g, "l$1"));
  out.add(w.replace(/ize\b/g, "ise").replace(/ization\b/g, "isation").replace(/or\b/g, "our"));
  out.add(w.replace(/fulfil\b/, "fulfill").replace(/enrol\b/, "enroll").replace(/ageing/, "aging").replace(/sceptical/, "skeptical").replace(/skeptical/, "sceptical"));
  return [...out];
}

export type Check = { ok: boolean; heard: string; close: boolean };

/** Compares recogniser alternatives with the target word or phrase. */
export function checkWord(target: string, heard: Heard): Check {
  const wanted = variants(target);
  const alts = heard.alternatives.map((a) => norm(a.text)).filter(Boolean);
  for (const alt of alts) {
    if (wanted.some((w) => alt === w || ` ${alt} `.includes(` ${w} `))) return { ok: true, heard: alt, close: true };
  }
  const best = alts[0] ?? "";
  const close = alts.some((alt) => wanted.some((w) => similarity(alt, w) >= 0.7));
  return { ok: false, heard: best, close };
}

/** 0..1 similarity from edit distance. */
export function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)] as number[]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return 1 - dp[a.length][b.length] / Math.max(a.length, b.length);
}

/** Rough syllable split for "say it slowly" hints: vowel groups with their consonants. */
export function syllables(word: string): string[] {
  return word
    .split(" ")
    .flatMap((part) => part.match(/[^aeiouy]*[aeiouy]+(?:[^aeiouy]*$|[^aeiouy](?=[^aeiouy]))?/gi) ?? [part]);
}
