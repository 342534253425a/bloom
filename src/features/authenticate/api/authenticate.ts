import type { User as AuthUser } from "@supabase/supabase-js";
import type { PublicUser } from "@/entities/user";
import { supabase } from "@/shared/api/supabase";
import { pushEverything, startSync, stopSync } from "@/shared/api/sync";
import { disconnectCouple } from "@/entities/couple/link";
import { DomainError } from "@/shared/lib/errors";
import { createId } from "@/shared/lib/id";
import { db, type Tone } from "@/shared/db";
import { i18n } from "@/shared/i18n";

function toUser(user: AuthUser): PublicUser {
  const name = typeof user.user_metadata?.name === "string" ? user.user_metadata.name : "";
  return { id: user.id, email: user.email ?? "", displayName: name || (user.email ?? "").split("@")[0] || "Bloom" };
}

/** Tables owned through `userId`, and singletons keyed by the user id itself. */
const owned = [
  "habits", "habitLogs", "days", "goals", "checkIns", "wellnessDays", "focusSessions", "journalEntries",
  "countdowns", "tasks", "projects", "priorities", "wishes", "redemptions", "reviews", "reminders", "notes",
] as const;
const singletons = ["preferences", "sharing", "partners"] as const;

/** Moves rows of an old on-device account (from before sync existed) into the signed-in account. */
export async function adoptLocalAccount(fromId: string, toId: string): Promise<number> {
  if (fromId === toId) return 0;
  let moved = 0;
  await db.transaction("rw", [...owned, ...singletons, "users", "sessions"].map((name) => db.table(name)), async () => {
    for (const name of owned) {
      const rows = (await db.table(name).where("userId").equals(fromId).toArray()) as Array<Record<string, unknown>>;
      if (!rows.length) continue;
      await db.table(name).bulkPut(rows.map((row) => ({ ...row, userId: toId })));
      moved += rows.length;
    }
    for (const name of singletons) {
      const row = (await db.table(name).get(fromId)) as Record<string, unknown> | undefined;
      if (!row) continue;
      const existing = await db.table(name).get(toId);
      if (!existing) await db.table(name).put({ ...row, id: toId });
      await db.table(name).delete(fromId);
    }
    const sessions = await db.sessions.where("userId").equals(fromId).primaryKeys();
    await db.sessions.bulkDelete(sessions);
    await db.users.delete(fromId);
  });
  await pushEverything(toId);
  return moved;
}

/** Old on-device accounts that still hold data. */
export async function listLocalAccounts() {
  const users = await db.users.toArray();
  return Promise.all(
    users.map(async (user) => ({
      id: user.id,
      email: user.email,
      name: user.displayName,
      rows: (await db.habits.where("userId").equals(user.id).count()) + (await db.tasks.where("userId").equals(user.id).count()) + (await db.days.where("userId").equals(user.id).count()),
    })),
  );
}

/** A gentle starting set for a brand-new account: a few habits with minimum versions and two rewards. */
const starter: Array<{ key: string; icon: string; tone: Tone; target?: number }> = [
  { key: "water", icon: "i-drop", tone: "sky", target: 8 },
  { key: "move", icon: "i-shoe", tone: "pink" },
  { key: "read", icon: "i-book", tone: "lav" },
  { key: "sleep", icon: "i-moon", tone: "sun" },
];

async function plantStarter(userId: string) {
  const createdAt = new Date().toISOString();
  await db.transaction("rw", [db.habits, db.wishes], async () => {
    for (const [index, habit] of starter.entries()) {
      await db.habits.add({
        id: createId(),
        userId,
        name: i18n.t(`habits.tpl.${habit.key}`),
        minimum: i18n.t(`habits.tplMin.${habit.key}`),
        symbol: "leaf",
        icon: habit.icon,
        tone: habit.tone,
        targetCount: habit.target ?? 1,
        frequency: "daily",
        days: null,
        sort: index + 1,
        deletedAt: null,
        createdAt,
        vacation: false,
      });
    }
    await db.wishes.bulkAdd([
      { id: createId(), userId, title: i18n.t("garden.sampleRewards.movie"), cost: 0, streak: 7, icon: "o-latte" },
      { id: createId(), userId, title: i18n.t("garden.sampleRewards.treat"), cost: 0, streak: 30, icon: "c-gift" },
      { id: createId(), userId, title: i18n.t("garden.sampleRewards.latte"), cost: 150, streak: null, icon: "o-latte" },
      { id: createId(), userId, title: i18n.t("garden.sampleRewards.book"), cost: 300, streak: null, icon: "o-star-book" },
    ]);
  });
}

/** True only when the server answered and holds nothing for this person yet. */
async function serverIsEmpty(): Promise<boolean> {
  // A slow network must never hold the app on a blank screen: if unsure, don't seed.
  const check = supabase
    .from("records")
    .select("id", { count: "exact", head: true })
    .then(({ count, error }) => !error && count === 0);
  return Promise.race([check, new Promise<boolean>((resolve) => window.setTimeout(() => resolve(false), 5000))]);
}

/** Called once a session exists: start syncing, adopt a same-email local account, seed a brand-new space. */
export async function enterAccount(user: PublicUser): Promise<void> {
  await startSync(user.id);
  const legacy = await db.users.where("email").equals(user.email.toLowerCase()).first();
  if (legacy && legacy.id !== user.id) {
    await adoptLocalAccount(legacy.id, user.id);
    return;
  }
  const hasLocal = (await db.habits.where("userId").equals(user.id).count()) > 0;
  if (!hasLocal && (await serverIsEmpty())) await plantStarter(user.id);
}

function authError(message: string): DomainError {
  const text = message.toLowerCase();
  if (text.includes("already registered") || text.includes("already been registered")) return new DomainError("email-taken");
  if (text.includes("not confirmed")) return new DomainError("email-unconfirmed");
  if (text.includes("invalid login") || text.includes("invalid credentials")) return new DomainError("invalid-credentials");
  if (text.includes("rate limit") || text.includes("too many")) return new DomainError("code-limited");
  if (text.includes("fetch") || text.includes("network")) return new DomainError("offline");
  return new DomainError("mail-unavailable");
}

/** Returns the user when a session started right away, or null when the email must be confirmed first. */
export async function registerAccount(input: { name: string; email: string; password: string }): Promise<PublicUser | null> {
  const { data, error } = await supabase.auth.signUp({
    email: input.email.trim().toLowerCase(),
    password: input.password,
    options: { data: { name: input.name.trim() }, emailRedirectTo: window.location.origin },
  });
  if (error) throw authError(error.message);
  // Supabase hides existing emails behind a user with no identities.
  if (data.user && data.user.identities && data.user.identities.length === 0) throw new DomainError("email-taken");
  if (!data.session || !data.user) return null;
  const user = toUser(data.user);
  await enterAccount(user);
  return user;
}

export async function loginAccount(input: { email: string; password: string }): Promise<PublicUser> {
  const { data, error } = await supabase.auth.signInWithPassword({ email: input.email.trim().toLowerCase(), password: input.password });
  if (error || !data.user) throw authError(error?.message ?? "");
  const user = toUser(data.user);
  await enterAccount(user);
  return user;
}

export async function sendPasswordReset(email: string): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo: window.location.origin });
  if (error) throw authError(error.message);
}

export async function changePassword(password: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw authError(error.message);
}

export async function renameAccount(name: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ data: { name: name.trim() } });
  if (error) throw authError(error.message);
}

export async function logoutAccount(): Promise<void> {
  stopSync();
  disconnectCouple();
  await supabase.auth.signOut();
}

/** The session Supabase keeps in localStorage, read without any network call. */
function storedSession(): { user: Parameters<typeof toUser>[0] } | null {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i) ?? "";
      if (key !== "bloom.auth" && !/^sb-.*-auth-token$/.test(key)) continue;
      const parsed = JSON.parse(localStorage.getItem(key) ?? "null");
      if (parsed?.user?.id) return { user: parsed.user };
    }
  } catch {
    /* unreadable storage */
  }
  return null;
}

export async function restoreAccount(): Promise<PublicUser | null> {
  // getSession may refresh an expired token over the network; never wait forever for it.
  const session = await Promise.race([
    supabase.auth.getSession().then(({ data }) => data.session),
    new Promise<ReturnType<typeof storedSession>>((resolve) => window.setTimeout(() => resolve(storedSession()), 6000)),
  ]);
  const user = session?.user;
  if (!user) return null;
  const view = toUser(user);
  await enterAccount(view);
  return view;
}

/** Deletes the account on the server (cascading every synced row) and the local copy. */
export async function deleteAccount(userId: string): Promise<void> {
  const { error } = await supabase.rpc("delete_my_account");
  if (error) throw authError(error.message);
  stopSync();
  await supabase.auth.signOut();
  await db.transaction("rw", [...owned, ...singletons].map((name) => db.table(name)), async () => {
    for (const name of owned) {
      const keys = await db.table(name).where("userId").equals(userId).primaryKeys();
      await db.table(name).bulkDelete(keys);
    }
    for (const name of singletons) await db.table(name).delete(userId);
  });
}

export { toUser };
