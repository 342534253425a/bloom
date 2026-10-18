import type { Mood } from "@/shared/db";
import type { ArtName } from "./index";

export const moodArt: Record<Mood, ArtName> = {
  happy: "mood-amazing",
  calm: "mood-good",
  okay: "mood-okay",
  tired: "mood-tired",
  anxious: "mood-low",
  sad: "mood-sad",
};

/** Mood as weather, for the weekly forecast. */
export function weatherOf(score: number | null): { art: ArtName; key: "sunny" | "partly" | "cloudy" | "rainy" | "none" } {
  if (score === null) return { art: "i-cloud", key: "none" };
  if (score >= 4.5) return { art: "o-sun", key: "sunny" };
  if (score >= 3.5) return { art: "o-cloud-face", key: "partly" };
  if (score >= 2.5) return { art: "i-cloud", key: "cloudy" };
  return { art: "i-drop", key: "rainy" };
}
