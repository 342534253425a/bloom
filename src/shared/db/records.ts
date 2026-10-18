/** Moods Bloom asks about. Older rows may still hold "amazing" | "good" | "low". */
export type Mood = "happy" | "calm" | "okay" | "tired" | "anxious" | "sad";
export type LegacyMood = Mood | "amazing" | "good" | "low";
export type Energy = "low" | "steady" | "good" | "high";
export type HabitSymbol = "water" | "move" | "read" | "journal" | "present" | "leaf";
export type HabitFrequency = "daily" | "weekly" | "custom";
export type HabitCategory = "health" | "mindset" | "productivity" | "lifestyle";
export type FocusStatus = "running" | "paused" | "completed";
export type Tone = "mint" | "pink" | "lav" | "sky" | "sun" | "peach";

export type User = {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string;
  passwordSalt: string;
  createdAt: string;
};

export type Session = {
  id: string;
  userId: string;
  expiresAt: string;
};

export type Habit = {
  id: string;
  userId: string;
  name: string;
  symbol: HabitSymbol;
  sort: number;
  deletedAt: string | null;
  createdAt: string;
  category?: HabitCategory | null;
  frequency?: HabitFrequency | null;
  /** Weekdays the habit is planned on, 0 = Monday … 6 = Sunday. Empty or missing = every day. */
  days?: number[] | null;
  targetCount?: number | null;
  unit?: string | null;
  reminder?: string | null;
  color?: string | null;
  /** Art name for the habit icon. */
  icon?: string | null;
  tone?: Tone | null;
  /** The "bad day" version that still keeps the chain. */
  minimum?: string | null;
  vacation?: boolean | null;
  goalId?: string | null;
};

export type HabitLogKind = "full" | "min" | "makeup";
export type HabitLog = {
  id: string;
  userId: string;
  habitId: string;
  dateKey: string;
  count: number;
  kind?: HabitLogKind;
  at?: string;
};

/** Legacy tables kept so older data can be migrated. */
export type CheckIn = {
  id: string;
  userId: string;
  dateKey: string;
  mood: LegacyMood;
  note: string | null;
};

export type WellnessDay = {
  id: string;
  userId: string;
  dateKey: string;
  energy: Energy;
  sleepMinutes?: number | null;
  waterGlasses?: number | null;
  moveMinutes?: number | null;
  cycleDay?: number | null;
  symptoms?: string[] | null;
};

/** One row per person per day: mood, body and the small good things. */
export type Day = {
  id: string;
  userId: string;
  dateKey: string;
  mood?: Mood | null;
  moodAt?: string | null;
  energy?: number | null;
  stress?: string[] | null;
  note?: string | null;
  sleepHours?: number | null;
  water?: number | null;
  moveMinutes?: number | null;
  meals?: number | null;
  food?: string | null;
  weightKg?: number | null;
  /** 0 = none, 1 light, 2 medium, 3 heavy. */
  period?: number | null;
  good?: string[] | null;
  win?: string | null;
  updatedAt: string;
};

export type GoalHorizon = "year" | "quarter" | "month" | "week";
export type GoalStep = { id: string; title: string; done: boolean };
export type Goal = {
  id: string;
  userId: string;
  title: string;
  why?: string | null;
  horizon: GoalHorizon;
  icon: string;
  tone: Tone;
  parentId: string | null;
  steps: GoalStep[];
  /** Manual progress 0–100 when there are no steps or sub-goals. */
  manual: number | null;
  due: string | null;
  doneAt: string | null;
  createdAt: string;
  sort: number;
};

export type JournalKind = "journal" | "gratitude" | "reflection" | "failure" | "procrastination";
export type JournalEntry = {
  id: string;
  userId: string;
  kind: JournalKind;
  body: string;
  title?: string | null;
  tags?: string[] | null;
  /** Second and third answers for structured logs (why / how to adjust, first tiny step). */
  extra?: string | null;
  extra2?: string | null;
  dateKey: string;
  createdAt: string;
};

export type CountdownKind = "exam" | "trip" | "birthday" | "event" | "goal" | "milestone";
export type Countdown = {
  id: string;
  userId: string;
  title: string;
  kind: CountdownKind;
  targetDate: string;
  createdAt: string;
};

export type TaskArea = "work" | "personal" | "wellness" | "study";
export type Quadrant = "now" | "plan" | "delegate" | "later";
export type Task = {
  id: string;
  userId: string;
  title: string;
  area: TaskArea;
  done: boolean;
  dateKey: string;
  clock: string | null;
  minutes: number | null;
  detail?: string | null;
  sort: number;
  top?: boolean | null;
  quadrant?: Quadrant | null;
  projectId?: string | null;
  doneAt?: string | null;
};

export type ProjectStep = { title: string; done: boolean };
export type Project = {
  id: string;
  userId: string;
  title: string;
  detail: string;
  steps: ProjectStep[];
  tone?: Tone | null;
  due?: string | null;
  createdAt: string;
};

export type Priority = {
  id: string;
  userId: string;
  title: string;
  quadrant: Quadrant;
  done: boolean;
  whenLabel: string;
};

export type Wish = {
  id: string;
  userId: string;
  title: string;
  cost: number;
  icon?: string | null;
  /** When set, this reward unlocks with a streak of that many days instead of points. */
  streak?: number | null;
};

export type Redemption = {
  id: string;
  userId: string;
  rewardId: string;
  cost?: number;
  createdAt: string;
};

export type ReviewKind = "day" | "week" | "month";
export type Review = {
  id: string;
  userId: string;
  kind: ReviewKind;
  periodKey: string;
  wentWell: string;
  wasHard: string;
  nextStep: string;
  keep?: string[] | null;
  drop?: string[] | null;
};

export type ReminderKey = "morning" | "evening" | "missed" | "quiet";
export type Reminder = {
  id: string;
  userId: string;
  key: ReminderKey;
  enabled: boolean;
  time: string;
};

export type Consequence = "none" | "minimum" | "donate";
export type ThemeName = "bloom" | "minimal";
export type Accent = "mint" | "pink" | "lav" | "sky";

export type Preferences = {
  id: string;
  weekStart: "monday" | "sunday";
  units: "metric" | "imperial";
  calmTheme: boolean;
  offline: boolean;
  theme?: ThemeName;
  accent?: Accent;
  onboarded?: boolean;
  petName?: string;
  waterGoal?: number;
  sleepGoal?: number;
  consequence?: Consequence;
  donateAmount?: number;
  notify?: boolean;
  morning?: string;
  evening?: string;
  missed?: string;
  quietFrom?: string;
  quietTo?: string;
  snooze?: number;
  morningOn?: boolean;
  eveningOn?: boolean;
  missedOn?: boolean;
  quietOn?: boolean;
  /** Global vacation: streaks freeze from this date until switched off. */
  vacationFrom?: string | null;
  vacations?: Array<{ from: string; to: string }>;
  cycleLength?: number;
  heightCm?: number | null;
  focusMinutes?: number;
  breakMinutes?: number;
  /** Guided tours of each space: on for newcomers, off for people who know Bloom. */
  tours?: "on" | "off";
  toursSeen?: string[];
  /** Notification types switched off (ids from the notification catalog). */
  notifyOff?: string[];
  /** Custom times for scheduled notifications, "HH:MM" by id. */
  notifyTimes?: Record<string, string>;
  /** Hours between water reminders. */
  waterEvery?: number;
};

export type ShareMode = "private" | "partial" | "partner";
export type ShareModule = "goals" | "habits" | "tasks" | "focus" | "streaks" | "mood" | "body" | "journal";
export type ShareLevel = "private" | "shared" | "partner";
export type Sharing = {
  id: string;
  mode?: ShareMode;
  modules?: Partial<Record<ShareModule, boolean>>;
  paused?: boolean;
  /** Legacy per-area levels. */
  goals?: ShareLevel;
  habits?: ShareLevel;
  checkIns?: ShareLevel;
  journal?: ShareLevel;
  mood?: ShareLevel;
  wellness?: ShareLevel;
};

export type Partner = {
  id: string;
  name: string;
  since: string;
  paused: boolean;
};

export type BoardNote = {
  id: string;
  userId: string;
  author: "you" | "partner";
  body: string;
  replyTo?: string | null;
  createdAt: string;
};

export type FocusSession = {
  id: string;
  userId: string;
  plannedSec: number;
  startedAt: string;
  endsAt: string | null;
  pausedRemainingMs: number | null;
  status: FocusStatus;
  kind?: "focus" | "break";
  label?: string | null;
  taskId?: string | null;
};

/** Spaced-repetition state of one IELTS word for one user. id = `${userId}:${wordId}`. */
export type VocabCard = {
  id: string;
  userId: string;
  wordId: string;
  /** Leitner box 0..6; 6 = mastered. */
  box: number;
  /** When the word is due again (ISO). */
  due: string;
  right: number;
  wrong: number;
  /** Best pronunciation check: true = said correctly at least once. */
  spoken?: boolean;
  updatedAt: string;
};
