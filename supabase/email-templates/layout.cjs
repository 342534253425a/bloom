// Builds the Bloom auth email templates for Supabase (Authentication → Emails).
// Each email carries a 6-digit code ({{ .Token }}) and is written in the person's app language
// (user metadata `lang`, set by the app): Russian, Chinese, or English by default.
// Run: node supabase/email-templates/layout.cjs  → writes *.html, subjects.json and all.json next to this file.
const fs = require("fs");
const path = require("path");

const site = "https://bloom-app-bice.vercel.app";

function block({ title, body, hint, footer }) {
  return `<tr><td style="padding:30px 32px 6px;">
<h1 style="margin:0 0 10px;font-size:24px;line-height:1.3;color:#263049;font-weight:800;">${title}</h1>
<p style="margin:0;font-size:16px;line-height:1.55;color:#4f5871;">${body}</p>
</td></tr>
<tr><td align="center" style="padding:22px 32px 6px;">
<div style="display:inline-block;padding:18px 26px;border-radius:20px;background:#ecfaf4;border:2px solid #b3e9d3;font-family:'SFMono-Regular',Consolas,'Courier New',monospace;font-size:38px;line-height:1;font-weight:800;letter-spacing:10px;color:#128a68;">{{ .Token }}</div>
</td></tr>
<tr><td style="padding:16px 32px 30px;">
<p style="margin:0 0 6px;font-size:14px;line-height:1.5;color:#8f97ab;">${hint}</p>
<p style="margin:0;font-size:13px;line-height:1.5;color:#b9bfcd;">${footer}</p>
</td></tr>`;
}

function page(copy) {
  const variant = (lang) => block(copy[lang]);
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
</head>
<body style="margin:0;padding:0;background:#f6f4fb;font-family:'Segoe UI',Helvetica,Arial,sans-serif;color:#263049;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f4fb;padding:28px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:24px;overflow:hidden;border:1px solid #ece9f5;">
<tr><td style="background-color:#e9f7f4;background-image:linear-gradient(135deg,#e3f4fb 0%,#ecfaf4 55%,#fff1f4 100%);padding:22px 32px;">
<span style="font-size:26px;font-weight:800;color:#263049;letter-spacing:-0.5px;">&#127793; bloom</span>
</td></tr>
{{ if eq .Data.lang "ru" }}${variant("ru")}{{ else if eq .Data.lang "zh" }}${variant("zh")}{{ else }}${variant("en")}{{ end }}
</table>
<p style="margin:16px 0 0;font-size:12px;color:#8f97ab;">Bloom · <a href="${site}" style="color:#1fae84;text-decoration:none;">bloom-app-bice.vercel.app</a></p>
</td></tr>
</table>
</body>
</html>
`;
}

const ignore = {
  en: "If you didn't request this, just ignore the email.",
  ru: "Если это был не ты, просто проигнорируй письмо.",
  zh: "如果不是你本人操作，请忽略此邮件。",
};

const templates = {
  confirmation: {
    subject: "{{ if eq .Data.lang \"ru\" }}{{ .Token }} — код подтверждения Bloom{{ else if eq .Data.lang \"zh\" }}{{ .Token }} — Bloom 邮箱验证码{{ else }}{{ .Token }} — confirm your Bloom email{{ end }}",
    html: page({
      en: { title: "Confirm your email", body: "Welcome to Bloom! Enter this code in the app to finish signing up.", hint: "The code works for 1 hour.", footer: ignore.en },
      ru: { title: "Подтверди почту", body: "Добро пожаловать в Bloom! Введи этот код в приложении, чтобы закончить регистрацию.", hint: "Код действует 1 час.", footer: ignore.ru },
      zh: { title: "确认你的邮箱", body: "欢迎来到 Bloom！在应用中输入此验证码完成注册。", hint: "验证码 1 小时内有效。", footer: ignore.zh },
    }),
  },
  magic_link: {
    subject: "{{ if eq .Data.lang \"ru\" }}{{ .Token }} — код для входа в Bloom{{ else if eq .Data.lang \"zh\" }}{{ .Token }} — Bloom 登录验证码{{ else }}{{ .Token }} — your Bloom sign-in code{{ end }}",
    html: page({
      en: { title: "Your sign-in code", body: "Enter this code in Bloom to sign in. No password needed.", hint: "The code works once and expires in 1 hour.", footer: ignore.en },
      ru: { title: "Код для входа", body: "Введи этот код в Bloom, чтобы войти. Пароль не нужен.", hint: "Код одноразовый и действует 1 час.", footer: ignore.ru },
      zh: { title: "你的登录验证码", body: "在 Bloom 中输入此验证码即可登录，无需密码。", hint: "验证码仅可使用一次，1 小时内有效。", footer: ignore.zh },
    }),
  },
  recovery: {
    subject: "{{ if eq .Data.lang \"ru\" }}{{ .Token }} — сброс пароля Bloom{{ else if eq .Data.lang \"zh\" }}{{ .Token }} — Bloom 重置密码验证码{{ else }}{{ .Token }} — reset your Bloom password{{ end }}",
    html: page({
      en: { title: "Reset your password", body: "Enter this code in Bloom, then choose a new password.", hint: "The code works for 1 hour.", footer: "If it wasn't you, ignore this email — your password stays the same." },
      ru: { title: "Сброс пароля", body: "Введи этот код в Bloom и задай новый пароль.", hint: "Код действует 1 час.", footer: "Если это был не ты, просто проигнорируй письмо — пароль останется прежним." },
      zh: { title: "重置密码", body: "在 Bloom 中输入此验证码，然后设置新密码。", hint: "验证码 1 小时内有效。", footer: "如果不是你本人操作，请忽略此邮件，密码不会改变。" },
    }),
  },
  email_change: {
    subject: "{{ if eq .Data.lang \"ru\" }}{{ .Token }} — подтверждение новой почты Bloom{{ else if eq .Data.lang \"zh\" }}{{ .Token }} — Bloom 新邮箱验证码{{ else }}{{ .Token }} — confirm your new Bloom email{{ end }}",
    html: page({
      en: { title: "Confirm your new email", body: "Enter this code in Bloom to switch your email to {{ .NewEmail }}.", hint: "The code works for 1 hour.", footer: ignore.en },
      ru: { title: "Подтверди новую почту", body: "Введи этот код в Bloom, чтобы сменить почту на {{ .NewEmail }}.", hint: "Код действует 1 час.", footer: ignore.ru },
      zh: { title: "确认新邮箱", body: "在 Bloom 中输入此验证码，将邮箱更改为 {{ .NewEmail }}。", hint: "验证码 1 小时内有效。", footer: ignore.zh },
    }),
  },
};

for (const [name, t] of Object.entries(templates)) fs.writeFileSync(path.join(__dirname, `${name}.html`), t.html);
fs.writeFileSync(path.join(__dirname, "subjects.json"), JSON.stringify(Object.fromEntries(Object.entries(templates).map(([k, t]) => [k, t.subject])), null, 2));
fs.writeFileSync(path.join(__dirname, "all.json"), JSON.stringify(Object.fromEntries(Object.entries(templates).map(([k, t]) => [k, { s: t.subject, h: t.html }]))));
console.log("written", Object.keys(templates).join(", "));
