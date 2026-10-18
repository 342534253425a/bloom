/** The little surprises one partner can send to the other's screen. */
export type EffectEngine = "rain" | "burst" | "rise" | "pulse" | "confetti" | "snow" | "swirl" | "none";

export type EffectPreset = {
  id: string;
  /** Icon on the button. */
  icon: string;
  engine: EffectEngine;
  /** Emoji used by the particle engine. */
  emoji: string[];
  /** Big text card (translation key under couple.fx.<id>.say), shown with an illustration. */
  say?: boolean;
  art?: string;
  vibrate?: number[];
  /** Background glow color for the text card. */
  glow?: string;
};

export const effects: EffectPreset[] = [
  { id: "hearts", icon: "💕", engine: "rain", emoji: ["❤️", "💖", "💗", "💕", "💞"], vibrate: [20, 40, 20] },
  { id: "thinking", icon: "💭", engine: "rise", emoji: ["💭", "💗", "✨"], say: true, art: "c-hug-heart", glow: "#ffe1e8" },
  { id: "hug", icon: "🤗", engine: "pulse", emoji: ["🤗"], say: true, art: "c-hug-big-heart", vibrate: [60, 60, 60], glow: "#fff0c9" },
  { id: "kiss", icon: "😘", engine: "burst", emoji: ["💋", "😘", "💋", "❤️"], vibrate: [15, 30, 15] },
  { id: "best", icon: "🏆", engine: "confetti", emoji: [], say: true, art: "c-hug-star", glow: "#fff0c9" },
  { id: "cando", icon: "💪", engine: "rise", emoji: ["✨", "💪", "⭐"], say: true, art: "c-arms-up", glow: "#d5f3e6" },
  { id: "cutie", icon: "🥰", engine: "pulse", emoji: ["🥰"], say: true, art: "c-two-wink", glow: "#ffe1e8" },
  { id: "miss", icon: "🥺", engine: "rain", emoji: ["🥺", "💧", "💗"], say: true, art: "c-sad-grass", glow: "#e8e0ff" },
  { id: "water", icon: "💧", engine: "rain", emoji: ["💧", "🥤", "💦"], say: true, art: "c-mug", glow: "#d6ecfd" },
  { id: "sleep", icon: "🌙", engine: "snow", emoji: ["⭐", "🌙", "✨", "💤"], say: true, art: "c-sleep-cloud", glow: "#e8e0ff" },
  { id: "morning", icon: "☀️", engine: "rise", emoji: ["☀️", "🌼", "🌷", "✨"], say: true, art: "c-wave-sun", glow: "#fff0c9" },
  { id: "break", icon: "☕", engine: "rise", emoji: ["☕", "🍪", "🧁"], say: true, art: "c-read-cup", glow: "#ffe8da" },
  { id: "proud", icon: "🌟", engine: "confetti", emoji: [], say: true, art: "c-flower-arms", glow: "#fff0c9" },
  { id: "stars", icon: "⭐", engine: "rain", emoji: ["⭐", "🌟", "✨", "💫"] },
  { id: "flowers", icon: "🌸", engine: "rain", emoji: ["🌸", "🌷", "🌼", "🌺", "💮"] },
  { id: "fireworks", icon: "🎆", engine: "burst", emoji: ["🎆", "🎇", "✨", "💥", "🌟"], vibrate: [10, 30, 10, 30, 10] },
  { id: "party", icon: "🎉", engine: "confetti", emoji: [], vibrate: [20, 20, 20] },
  { id: "heartbeat", icon: "💓", engine: "pulse", emoji: ["💓"], vibrate: [80, 120, 80, 400, 80, 120, 80] },
  { id: "butterflies", icon: "🦋", engine: "swirl", emoji: ["🦋", "🦋", "🌸"] },
  { id: "rainbow", icon: "🌈", engine: "rise", emoji: ["🌈", "☁️", "✨"], say: true, art: "o-cloud-face", glow: "#d6ecfd" },
  { id: "cats", icon: "🐱", engine: "rain", emoji: ["🐱", "😺", "😻", "🐾"] },
  { id: "sweets", icon: "🍩", engine: "rain", emoji: ["🍩", "🍓", "🍰", "🧁", "🍬"] },
  { id: "poke", icon: "👉", engine: "pulse", emoji: ["👉"], say: true, art: "c-peek-right", vibrate: [30], glow: "#e8e0ff" },
  { id: "cheer", icon: "🫂", engine: "rise", emoji: ["🫂", "💗"], say: true, art: "c-hug-baby-heart", glow: "#ffe1e8" },
  { id: "fire", icon: "🔥", engine: "burst", emoji: ["🔥", "💥", "⚡"], say: true, art: "c-dumbbells", glow: "#ffe8da" },
  { id: "love", icon: "❤️", engine: "pulse", emoji: ["❤️"], say: true, art: "c-pair-hearts", vibrate: [100, 80, 100], glow: "#ffe1e8" },
  { id: "snow", icon: "❄️", engine: "snow", emoji: ["❄️", "❅", "❆"] },
  { id: "bubbles", icon: "🫧", engine: "rise", emoji: ["🫧", "🫧", "🫧", "💙"] },
  { id: "hello", icon: "👋", engine: "swirl", emoji: ["👋", "💛"], say: true, art: "c-wave", glow: "#fff0c9" },
  { id: "food", icon: "🍜", engine: "rain", emoji: ["🍜", "🥟", "🍱", "🍙"], say: true, art: "c-cup-flowers", glow: "#ffe8da" },
  { id: "plant", icon: "🌱", engine: "rise", emoji: ["🌱", "🌿", "🍀"], say: true, art: "c-watering", glow: "#d5f3e6" },
  { id: "custom", icon: "✍️", engine: "rain", emoji: ["💌", "💗", "✨"], say: true, art: "c-hold-daisy", glow: "#ffe1e8" },
];

export const customEmoji = ["💌", "❤️", "🌸", "⭐", "🥰", "🍀", "🦋", "🍓", "🌈", "🐱", "☀️", "🔥"];

export function effectById(id: string): EffectPreset | undefined {
  return effects.find((effect) => effect.id === id);
}
