import type { User as AuthUser } from "@supabase/supabase-js";
import { currentLang } from "@/shared/i18n";
import type { PublicUser } from "@/entities/user";
import { supabase } from "@/shared/api/supabase";
import { pushEverything, startSync, stopSync } from "@/shared/api/sync";
import { disconnectCouple } from "@/entities/couple/link";
import { DomainError } from "@/shared/lib/errors";
import { createId } from "@/shared/lib/id";
import { db, type Tone } from "@/shared/db";
import { i18n } from "@/shared/i18n";
import { AUTH_CALLBACK, isApp, onAuthCallback, openOutside } from "@/shared/lib/native";
import { forgetThisDevice } from "@/shared/lib/push";

function toUser(user: AuthUser): PublicUser {
  const meta = user.user_metadata ?? {};
  const name = [meta.name, meta.full_name, meta.given_name].find((value): value is string => typeof value === "string" && value.trim() !== "") ?? "";
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
  if (text.includes("expired") || text.includes("invalid") && text.includes("token") || text.includes("otp")) return new DomainError("code-invalid");
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
    options: { data: { name: input.name.trim(), lang: currentLang() }, emailRedirectTo: window.location.origin },
  });
  if (error) throw authError(error.message);
  // Supabase hides existing emails behind a user with no identities.
  if (data.user && data.user.identities && data.user.identities.length === 0) throw new DomainError("email-taken");
  if (!data.session || !data.user) return null;
  const user = toUser(data.user);
  await enterAccount(user);
  return user;
}

export type CodeKind = "signup" | "email" | "recovery";

/** Checks the 6-digit code from the email and signs the person in. */
export async function verifyCode(email: string, code: string, kind: CodeKind): Promise<PublicUser> {
  const address = email.trim().toLowerCase();
  const token = code.replace(/\D/g, "");
  // A code from any of our emails should work on any code screen: try the expected kind first, then the others.
  const order: Array<"signup" | "email" | "recovery" | "magiclink"> = kind === "recovery" ? ["recovery", "email"] : kind === "signup" ? ["email", "signup", "magiclink"] : ["email", "magiclink", "signup"];
  let lastError = "";
  for (const type of order) {
    const { data, error } = await supabase.auth.verifyOtp({ email: address, token, type });
    if (!error && data.user) {
      const user = toUser(data.user);
      await enterAccount(user);
      return user;
    }
    lastError = error?.message ?? lastError;
  }
  throw authError(lastError || "invalid token");
}

/** Sends the confirmation email again. */
export async function resendConfirmation(email: string): Promise<void> {
  const { error } = await supabase.auth.resend({ type: "signup", email: email.trim().toLowerCase(), options: { emailRedirectTo: window.location.origin } });
  if (error) throw authError(error.message);
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

/**
 * Opens Google sign-in; Supabase brings the person back to Bloom already signed in.
 * Google refuses sign-in inside app windows, so the apps open the real browser and get
 * the result back through a bloom:// link (see shared/lib/native).
 * Returns true when sign-in continues outside the app.
 */
export async function signInWithGoogle(): Promise<boolean> {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: isApp ? AUTH_CALLBACK : window.location.origin, queryParams: { prompt: "select_account" }, skipBrowserRedirect: isApp },
  });
  if (error) throw authError(error.message);
  if (isApp && data.url) {
    await openOutside(data.url);
    return true;
  }
  return false;
}

/** Last error from finishing Google sign-in in the apps, shown on the sign-in screen. */
export let appSignInError = "";

onAuthCallback(async (url) => {
  const code = url.searchParams.get("code");
  const failure = url.searchParams.get("error_description") ?? url.searchParams.get("error");
  if (!code) {
    appSignInError = failure ?? "no code";
    window.dispatchEvent(new Event("bloom:auth-callback"));
    return;
  }
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    appSignInError = error.message;
    window.dispatchEvent(new Event("bloom:auth-callback"));
    return;
  }
  // Start fresh so the signed-in account loads exactly like on a normal launch.
  window.location.replace("/");
});

/** Emails a one-tap sign-in link (creates the account if it doesn't exist yet). */
export async function sendMagicLink(email: string, name?: string): Promise<void> {
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim().toLowerCase(),
    options: { emailRedirectTo: window.location.origin, shouldCreateUser: true, data: name?.trim() ? { name: name.trim(), lang: currentLang() } : { lang: currentLang() } },
  });
  if (error) throw authError(error.message);
}

/** Remembers the app language on the account, so emails come in the same language. */
export async function syncLanguage(lang: string): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const user = data.session?.user;
  if (!user || user.user_metadata?.lang === lang) return;
  await supabase.auth.updateUser({ data: { lang } });
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
  // This device stops getting the account's notifications (needs the session, so before signing out).
  await Promise.race([forgetThisDevice().catch(() => undefined), new Promise((resolve) => window.setTimeout(resolve, 4000))]);
  stopSync();
  disconnectCouple();
  // Only this device: signing out on the phone must not sign the computer out too.
  await supabase.auth.signOut({ scope: "local" });
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
