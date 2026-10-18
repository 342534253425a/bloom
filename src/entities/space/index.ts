import { db } from "@/shared/db";

/** Every table that holds rows owned by a user through `userId`. */
const owned = [
  "habits",
  "habitLogs",
  "days",
  "goals",
  "checkIns",
  "wellnessDays",
  "focusSessions",
  "journalEntries",
  "countdowns",
  "tasks",
  "projects",
  "priorities",
  "wishes",
  "redemptions",
  "reviews",
  "reminders",
  "notes",
] as const;

/** Rows keyed by the user id itself. */
const singletons = ["preferences", "sharing", "partners"] as const;

export type Backup = {
  app: "bloom";
  version: 3;
  exportedAt: string;
  profile: { displayName: string; email: string };
  data: Record<string, unknown[]>;
};

export async function exportSpace(userId: string): Promise<Backup> {
  const user = await db.users.get(userId);
  const data: Record<string, unknown[]> = {};
  for (const name of owned) data[name] = await db.table(name).where("userId").equals(userId).toArray();
  for (const name of singletons) {
    const row = await db.table(name).get(userId);
    data[name] = row ? [row] : [];
  }
  return {
    app: "bloom",
    version: 3,
    exportedAt: new Date().toISOString(),
    profile: { displayName: user?.displayName ?? "", email: user?.email ?? "" },
    data,
  };
}

export function downloadJson(name: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Restores a backup into the current account, replacing what is there. */
export async function importSpace(userId: string, raw: unknown): Promise<number> {
  const backup = raw as Partial<Backup>;
  if (!backup || backup.app !== "bloom" || typeof backup.data !== "object" || !backup.data) throw new Error("not-a-backup");
  let count = 0;
  await db.transaction("rw", [...owned, ...singletons].map((name) => db.table(name)), async () => {
    for (const name of owned) {
      const rows = (backup.data?.[name] ?? []) as Array<Record<string, unknown>>;
      if (!Array.isArray(rows)) continue;
      const existing = await db.table(name).where("userId").equals(userId).primaryKeys();
      await db.table(name).bulkDelete(existing);
      const mine = rows.filter((row) => row && typeof row.id === "string").map((row) => ({ ...row, userId }));
      await db.table(name).bulkPut(mine);
      count += mine.length;
    }
    for (const name of singletons) {
      const rows = (backup.data?.[name] ?? []) as Array<Record<string, unknown>>;
      const row = Array.isArray(rows) ? rows[0] : undefined;
      if (row) await db.table(name).put({ ...row, id: userId });
    }
  });
  return count;
}

/* ---------- Passcode (app lock on this device) ---------- */

const lockKey = (userId: string) => `bloom.lock.${userId}`;

async function digest(code: string, userId: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${userId}:${code}`));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function hasPasscode(userId: string): boolean {
  try {
    return Boolean(localStorage.getItem(lockKey(userId)));
  } catch {
    return false;
  }
}

export async function setPasscode(userId: string, code: string | null) {
  if (!code) {
    localStorage.removeItem(lockKey(userId));
    return;
  }
  localStorage.setItem(lockKey(userId), await digest(code, userId));
}

export async function checkPasscode(userId: string, code: string): Promise<boolean> {
  return localStorage.getItem(lockKey(userId)) === (await digest(code, userId));
}

