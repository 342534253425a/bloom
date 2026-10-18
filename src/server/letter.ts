export function registrationLetter(locale: string, code: string): { subject: string; text: string } {
  if (!/^\d{6}$/.test(code)) throw new Error("code");
  if (locale === "ru") {
    return {
      subject: "Код для Bloom",
      text: `${code}\n\nЭто код для регистрации в Bloom. Он действует 10 минут.\nЕсли ты не запрашивал код, просто закрой письмо.\n`,
    };
  }
  return {
    subject: "Your Bloom code",
    text: `${code}\n\nThis is your Bloom registration code. It expires in 10 minutes.\nIf you didn't ask for this, you can ignore this email.\n`,
  };
}
