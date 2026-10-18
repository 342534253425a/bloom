import { createId } from "@/shared/lib/id";
import { db, type Session } from "@/shared/db";

const SESSION_KEY = "bloom.session";
const THIRTY_DAYS_MS = 1000 * 60 * 60 * 24 * 30;

export async function openSession(userId: string): Promise<void> {
  const id = createId();
  const expiresAt = new Date(Date.now() + THIRTY_DAYS_MS).toISOString();
  await db.sessions.add({ id, userId, expiresAt });
  localStorage.setItem(SESSION_KEY, id);
}

export async function readStoredSession(): Promise<Session | null> {
  const sessionId = localStorage.getItem(SESSION_KEY);
  if (!sessionId) return null;
  const session = await db.sessions.get(sessionId);
  if (!session || new Date(session.expiresAt).getTime() <= Date.now()) {
    localStorage.removeItem(SESSION_KEY);
    if (session) await db.sessions.delete(session.id);
    return null;
  }
  return session;
}

export async function closeSession(): Promise<void> {
  const sessionId = localStorage.getItem(SESSION_KEY);
  localStorage.removeItem(SESSION_KEY);
  if (sessionId) await db.sessions.delete(sessionId);
}
