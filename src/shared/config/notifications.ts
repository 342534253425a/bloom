/**
 * Every kind of notification Bloom can send. The same ids are used by the in-app scheduler,
 * the notification centre, the settings screen and the push server (supabase/functions/push).
 */
export type NotifyGroup = "day" | "habits" | "tasks" | "body" | "growth" | "learn" | "partner";

export type NotifyKind = {
  id: string;
  group: NotifyGroup;
  icon: string;
  /** Default "HH:MM" for scheduled reminders; absent for event notifications. */
  time?: string;
  /** Route opened when the notification is tapped. */
  to: string;
  /** Off until the person switches it on. */
  optIn?: boolean;
};

export const notifyKinds: NotifyKind[] = [
  // Day rhythm
  { id: "morning", group: "day", icon: "🌤", time: "08:30", to: "/body" },
  { id: "plan", group: "day", icon: "🗒", time: "09:00", to: "/tasks" },
  { id: "evening", group: "day", icon: "🌙", time: "21:30", to: "/reflect" },
  { id: "bedtime", group: "day", icon: "😴", time: "23:00", to: "/body" },
  { id: "weekly", group: "day", icon: "📅", time: "19:00", to: "/reflect" },
  // Habits
  { id: "habit", group: "habits", icon: "🌱", to: "/habits" },
  { id: "missed", group: "habits", icon: "💚", time: "18:00", to: "/habits" },
  { id: "streak", group: "habits", icon: "🔥", time: "21:00", to: "/habits" },
  // Tasks & focus
  { id: "task", group: "tasks", icon: "⏰", to: "/tasks" },
  { id: "tasksLeft", group: "tasks", icon: "✅", time: "19:00", to: "/tasks" },
  { id: "focusEnd", group: "tasks", icon: "🎯", to: "/focus" },
  // Body
  { id: "water", group: "body", icon: "💧", time: "10:00", to: "/body" },
  { id: "move", group: "body", icon: "🚶", time: "15:00", to: "/body", optIn: true },
  // Goals & garden
  { id: "countdown", group: "growth", icon: "⏳", time: "10:00", to: "/goals" },
  { id: "goalDue", group: "growth", icon: "🎯", time: "10:00", to: "/goals" },
  { id: "level", group: "growth", icon: "🌸", to: "/garden" },
  // Learning
  { id: "ielts", group: "learn", icon: "📚", time: "20:00", to: "/learn" },
  { id: "chinese", group: "learn", icon: "中", time: "20:30", to: "/learn" },
  // Partner
  { id: "call", group: "partner", icon: "📞", to: "/together/chat" },
  { id: "message", group: "partner", icon: "💬", to: "/together/chat" },
  { id: "love", group: "partner", icon: "💗", to: "/together" },
  { id: "online", group: "partner", icon: "🟢", to: "/together", optIn: true },
  { id: "sharedFocus", group: "partner", icon: "👥", to: "/focus" },
  { id: "garden", group: "partner", icon: "🪴", to: "/together" },
  { id: "question", group: "partner", icon: "❓", to: "/together" },
  { id: "pairHabit", group: "partner", icon: "🤝", to: "/together" },
  { id: "duel", group: "partner", icon: "⚔️", to: "/learn" },
  { id: "phrase", group: "partner", icon: "🎤", to: "/learn" },
  { id: "watch", group: "partner", icon: "🍿", to: "/watch" },
  { id: "partnerDay", group: "partner", icon: "🌼", to: "/together", optIn: true },
];

export const notifyGroups: NotifyGroup[] = ["partner", "day", "habits", "tasks", "body", "growth", "learn"];

export const kindById = new Map(notifyKinds.map((kind) => [kind.id, kind]));
