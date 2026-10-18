import nodemailer from "nodemailer";

export type MailMessage = {
  to: string;
  subject: string;
  text: string;
};

export type Mailer = (message: MailMessage) => Promise<void>;

const KEYS = [
  "BLOOM_MAIL_FROM",
  "BLOOM_RESEND_API_KEY",
  "BLOOM_SMTP_URL",
  "BLOOM_SMTP_HOST",
  "BLOOM_SMTP_PORT",
  "BLOOM_SMTP_SECURE",
  "BLOOM_SMTP_USER",
  "BLOOM_SMTP_PASS",
] as const;

export function mailEnv(fileEnv: Record<string, string>): Record<string, string> {
  const env: Record<string, string> = {};
  for (const key of KEYS) env[key] = process.env[key] || fileEnv[key] || "";
  return env;
}

export function createMailer(env: Record<string, string>): Mailer | null {
  const from = env.BLOOM_MAIL_FROM?.trim();
  const resendKey = env.BLOOM_RESEND_API_KEY?.trim();
  if (resendKey && from) return resendMailer(resendKey, from);

  const url = env.BLOOM_SMTP_URL?.trim();
  const host = env.BLOOM_SMTP_HOST?.trim();
  if (!from || (!url && !host)) return null;

  const transport = url
    ? nodemailer.createTransport(url)
    : nodemailer.createTransport({
        host,
        port: Number(env.BLOOM_SMTP_PORT || 587),
        secure: env.BLOOM_SMTP_SECURE === "true" || env.BLOOM_SMTP_PORT === "465",
        auth: env.BLOOM_SMTP_USER
          ? { user: env.BLOOM_SMTP_USER, pass: env.BLOOM_SMTP_PASS ?? "" }
          : undefined,
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 15_000,
      });

  return async (message) => {
    await withTimeout(
      transport.sendMail({
        from,
        to: message.to,
        subject: message.subject,
        text: message.text,
      }),
    );
  };
}

function resendMailer(key: string, from: string): Mailer {
  return async (message) => {
    const response = await withTimeout(
      fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [message.to],
          subject: message.subject,
          text: message.text,
        }),
      }),
    );
    if (!response.ok) throw new Error("mail");
  };
}

function withTimeout<T>(work: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("mail-timeout")), 15_000);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
