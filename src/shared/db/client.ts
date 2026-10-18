import Dexie, { type EntityTable } from "dexie";
import type {
  BoardNote,
  CheckIn,
  Countdown,
  Day,
  FocusSession,
  Goal,
  Habit,
  HabitLog,
  JournalEntry,
  LegacyMood,
  Mood,
  Partner,
  Preferences,
  Priority,
  Project,
  Redemption,
  Reminder,
  Review,
  Session,
  Sharing,
  Task,
  User,
  VocabCard,
  WellnessDay,
  Wish,
} from "./records";

const legacyMood: Record<LegacyMood, Mood> = {
  happy: "happy",
  calm: "calm",
  okay: "okay",
  tired: "tired",
  anxious: "anxious",
  sad: "sad",
  amazing: "happy",
  good: "calm",
  low: "sad",
};

const legacyEnergy = { low: 1, steady: 2, good: 4, high: 5 } as const;

export class BloomDB extends Dexie {
  users!: EntityTable<User, "id">;
  sessions!: EntityTable<Session, "id">;
  habits!: EntityTable<Habit, "id">;
  habitLogs!: EntityTable<HabitLog, "id">;
  checkIns!: EntityTable<CheckIn, "id">;
  wellnessDays!: EntityTable<WellnessDay, "id">;
  days!: EntityTable<Day, "id">;
  goals!: EntityTable<Goal, "id">;
  focusSessions!: EntityTable<FocusSession, "id">;
  journalEntries!: EntityTable<JournalEntry, "id">;
  countdowns!: EntityTable<Countdown, "id">;
  tasks!: EntityTable<Task, "id">;
  projects!: EntityTable<Project, "id">;
  priorities!: EntityTable<Priority, "id">;
  wishes!: EntityTable<Wish, "id">;
  redemptions!: EntityTable<Redemption, "id">;
  reviews!: EntityTable<Review, "id">;
  reminders!: EntityTable<Reminder, "id">;
  preferences!: EntityTable<Preferences, "id">;
  sharing!: EntityTable<Sharing, "id">;
  partners!: EntityTable<Partner, "id">;
  notes!: EntityTable<BoardNote, "id">;
  vocab!: EntityTable<VocabCard, "id">;

  constructor() {
    super("bloom");
    const core = {
      users: "id, &email",
      sessions: "id, userId",
      habits: "id, userId, sort",
      habitLogs: "id, userId, [userId+dateKey], [habitId+dateKey]",
      checkIns: "id, userId, &[userId+dateKey]",
      wellnessDays: "id, userId, &[userId+dateKey]",
      focusSessions: "id, userId, status",
    };
    const life = {
      journalEntries: "id, userId, dateKey, kind",
      countdowns: "id, userId, targetDate",
      tasks: "id, userId, dateKey, sort",
      projects: "id, userId",
      priorities: "id, userId, quadrant",
      wishes: "id, userId",
      redemptions: "id, userId, rewardId",
      reviews: "id, userId, [userId+kind+periodKey]",
      reminders: "id, userId, key",
      preferences: "id",
      sharing: "id",
      partners: "id",
      notes: "id, userId, createdAt",
    };
    this.version(1).stores(core);
    this.version(2).stores({ ...core, ...life });
    this.version(3)
      .stores({
        ...core,
        ...life,
        days: "id, userId, &[userId+dateKey]",
        goals: "id, userId, parentId",
      })
      .upgrade(async (tx) => {
        // Fold the old check-in and wellness rows into the single day record.
        const merged = new Map<string, Day>();
        const keyOf = (userId: string, dateKey: string) => `${userId}|${dateKey}`;
        const ensure = (userId: string, dateKey: string): Day => {
          const key = keyOf(userId, dateKey);
          let row = merged.get(key);
          if (!row) {
            row = { id: crypto.randomUUID(), userId, dateKey, updatedAt: new Date().toISOString() };
            merged.set(key, row);
          }
          return row;
        };
        const checkIns = (await tx.table("checkIns").toArray()) as CheckIn[];
        for (const item of checkIns) {
          const row = ensure(item.userId, item.dateKey);
          row.mood = legacyMood[item.mood] ?? "okay";
          row.note = item.note;
        }
        const wellness = (await tx.table("wellnessDays").toArray()) as WellnessDay[];
        for (const item of wellness) {
          const row = ensure(item.userId, item.dateKey);
          row.energy = legacyEnergy[item.energy] ?? 3;
          row.sleepHours = item.sleepMinutes ? Math.round((item.sleepMinutes / 60) * 2) / 2 : null;
          row.water = item.waterGlasses ?? null;
          row.moveMinutes = item.moveMinutes ?? null;
        }
        if (merged.size) await tx.table("days").bulkAdd([...merged.values()]);
      });
    this.version(4).stores({
      ...core,
      ...life,
      days: "id, userId, &[userId+dateKey]",
      goals: "id, userId, parentId",
      vocab: "id, userId, due",
    });
  }
}

export const db = new BloomDB();
