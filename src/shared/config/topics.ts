/** Topics for memes and finds shared in chats (the Memes shelf groups them). */
export const topics = [
  { id: "humor", icon: "😂" },
  { id: "useful", icon: "💡" },
  { id: "science", icon: "🔬" },
  { id: "cooking", icon: "🍳" },
  { id: "music", icon: "🎵" },
  { id: "cute", icon: "🐱" },
  { id: "travel", icon: "✈️" },
  { id: "other", icon: "✨" },
] as const;

export type TopicId = (typeof topics)[number]["id"];

export function topicIcon(id: string | null | undefined): string {
  return topics.find((topic) => topic.id === id)?.icon ?? "✨";
}
