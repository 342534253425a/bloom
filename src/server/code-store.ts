import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

const TEN_MINUTES = 10 * 60 * 1000;
const COOLDOWN = 30 * 1000;
const MAX_ATTEMPTS = 5;

type Entry = {
  hash: Buffer;
  salt: string;
  expiresAt: number;
  attempts: number;
  sentAt: number;
};

export type CodeStore = {
  issue: (email: string) => { code: string } | { error: "limited" };
  verify: (email: string, code: string) => "ok" | "invalid" | "expired";
  drop: (email: string) => void;
};

function digest(salt: string, code: string) {
  return createHash("sha256").update(`${salt}:${code}`).digest();
}

export function createCodeStore(clock: () => number = Date.now): CodeStore {
  const codes = new Map<string, Entry>();

  return {
    issue(email) {
      const now = clock();
      const current = codes.get(email);
      if (current && now - current.sentAt < COOLDOWN) return { error: "limited" };
      const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
      const salt = randomBytes(16).toString("hex");
      codes.set(email, {
        hash: digest(salt, code),
        salt,
        expiresAt: now + TEN_MINUTES,
        attempts: 0,
        sentAt: now,
      });
      return { code };
    },
    verify(email, code) {
      const now = clock();
      const entry = codes.get(email);
      if (!entry) return "invalid";
      if (now > entry.expiresAt) {
        codes.delete(email);
        return "expired";
      }
      const hash = digest(entry.salt, code);
      const matches = entry.hash.length === hash.length && timingSafeEqual(entry.hash, hash);
      if (!matches) {
        entry.attempts += 1;
        if (entry.attempts >= MAX_ATTEMPTS) codes.delete(email);
        return "invalid";
      }
      codes.delete(email);
      return "ok";
    },
    drop(email) {
      codes.delete(email);
    },
  };
}
