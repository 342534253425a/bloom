import type { GlyphName } from "@/shared/ui/glyph";
import type { Tone } from "@/shared/ui/kit";

export type SpaceKey = "goals" | "habits" | "tasks" | "body" | "reflect" | "stats" | "together" | "garden" | "privacy";
export type HelpKey = SpaceKey | "focus";

export type SpacePath = "/goals" | "/habits" | "/tasks" | "/body" | "/reflect" | "/stats" | "/together" | "/garden" | "/privacy";

export const spaces: Array<{ key: SpaceKey; to: SpacePath; art: string; tone: Tone; glyph: GlyphName; number: number }> = [
  { key: "goals", to: "/goals", art: "o-target-heart", tone: "pink", glyph: "target", number: 1 },
  { key: "habits", to: "/habits", art: "i-sprout", tone: "mint", glyph: "sprout", number: 2 },
  { key: "tasks", to: "/tasks", art: "i-list", tone: "sky", glyph: "list", number: 3 },
  { key: "body", to: "/body", art: "i-lotus", tone: "peach", glyph: "heart", number: 4 },
  { key: "reflect", to: "/reflect", art: "o-journal", tone: "sun", glyph: "pencil", number: 5 },
  { key: "stats", to: "/stats", art: "i-bars", tone: "lav", glyph: "chart", number: 6 },
  { key: "together", to: "/together", art: "c-pair-hearts", tone: "pink", glyph: "message", number: 7 },
  { key: "garden", to: "/garden", art: "o-pot-flower", tone: "mint", glyph: "gift", number: 8 },
  { key: "privacy", to: "/privacy", art: "i-shield", tone: "sky", glyph: "shield", number: 9 },
];

export const habitIcons = [
  "i-sprout", "i-drop", "i-shoe", "i-book", "i-lotus", "i-moon", "i-sun", "i-pencil",
  "i-heart", "i-food", "i-bulb", "i-target", "i-zzz", "i-flower", "o-headphones", "o-latte",
  "c-dumbbells", "c-read", "c-mug", "o-star-book",
];

export const goalIcons = [
  "o-target-heart", "o-mountain", "i-plane", "o-piggy", "o-star-book", "i-book", "i-moon", "i-shoe",
  "i-heart", "o-sprout-big", "i-sun", "o-house", "i-bulb", "o-journal", "c-laptop", "o-pot-flower",
];

export const rewardIcons = ["o-latte", "c-gift", "o-star-book", "o-hoodie", "o-headphones", "o-pot-flower", "i-plane", "o-house", "i-heart", "c-mug"];

export const tones: Array<Exclude<Tone, "cream" | "coral">> = ["mint", "pink", "lav", "sky", "sun", "peach"];

export const toneHex: Record<string, string> = {
  mint: "#36c89c",
  pink: "#ff8ba0",
  lav: "#9f88ef",
  sky: "#5aaff0",
  sun: "#ffc23d",
  peach: "#ff9a62",
};
