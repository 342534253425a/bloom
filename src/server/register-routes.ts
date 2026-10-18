import type { IncomingMessage, ServerResponse } from "node:http";
import type { Connect } from "vite";
import { createCodeStore } from "./code-store";
import { registrationLetter } from "./letter";
import type { Mailer } from "./mailer";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WINDOW = 10 * 60 * 1000;
const MAX_PER_WINDOW = 8;

type HitLog = Map<string, number[]>;

export function attachRegisterRoutes(middlewares: Connect.Server, mailer: Mailer | null) {
  const store = createCodeStore();
  const hits: HitLog = new Map();

  middlewares.use(async (req, res, next) => {
    const path = req.url?.split("?")[0];
    if (path !== "/api/register/code" && path !== "/api/register/verify") {
      next();
      return;
    }
    if (req.method !== "POST") {
      sendJson(res, 405, { error: "unavailable" });
      return;
    }

    let body: unknown;
    try {
      body = JSON.parse((await readBody(req)) || "{}") as unknown;
    } catch {
      sendJson(res, 400, { error: "invalid" });
      return;
    }

    const email = readEmail(body);
    if (!email) {
      sendJson(res, 400, { error: "invalid" });
      return;
    }

    if (path === "/api/register/verify") {
      const code = readCode(body);
      if (!code) {
        sendJson(res, 400, { error: "invalid" });
        return;
      }
      const result = store.verify(email, code);
      sendJson(res, result === "ok" ? 200 : 400, result === "ok" ? { ok: true } : { error: result });
      return;
    }

    if (!mailer) {
      sendJson(res, 503, { error: "unconfigured" });
      return;
    }

    const ip = req.socket.remoteAddress ?? "local";
    if (tooMany(hits, ip)) {
      sendJson(res, 429, { error: "limited" });
      return;
    }

    const issued = store.issue(email);
    if ("error" in issued) {
      sendJson(res, 429, { error: "limited" });
      return;
    }

    const locale = readLocale(body);
    const letter = registrationLetter(locale, issued.code);
    try {
      await mailer({ to: email, subject: letter.subject, text: letter.text });
      sendJson(res, 200, { ok: true });
    } catch {
      console.error("Bloom could not send the registration code");
      store.drop(email);
      forgetLast(hits, ip);
      sendJson(res, 503, { error: "unavailable" });
    }
  });
}

function readEmail(body: unknown) {
  if (!body || typeof body !== "object" || !("email" in body)) return null;
  const value = body.email;
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (email.length > 254 || email.includes("\n") || email.includes("\r") || !EMAIL.test(email)) return null;
  return email;
}

function readCode(body: unknown) {
  if (!body || typeof body !== "object" || !("code" in body)) return null;
  const value = body.code;
  if (typeof value !== "string" || !/^\d{6}$/.test(value)) return null;
  return value;
}

function readLocale(body: unknown) {
  if (!body || typeof body !== "object" || !("locale" in body)) return "en";
  return body.locale === "ru" ? "ru" : "en";
}

function tooMany(hits: HitLog, ip: string) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((stamp) => now - stamp < WINDOW);
  if (recent.length >= MAX_PER_WINDOW) {
    hits.set(ip, recent);
    return true;
  }
  recent.push(now);
  hits.set(ip, recent);
  return false;
}

function forgetLast(hits: HitLog, ip: string) {
  const recent = hits.get(ip);
  recent?.pop();
}

function readBody(req: IncomingMessage) {
  return new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > 2048) {
        reject(new Error("too-big"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
}
