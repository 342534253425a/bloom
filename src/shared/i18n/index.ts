import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { strings } from "./strings";
import { langs, pick, type Lang } from "./tree";

export type { Lang } from "./tree";
export { langs } from "./tree";

const KEY = "bloom.locale";

function detect(): Lang {
  try {
    const stored = localStorage.getItem(KEY);
    if (stored && (langs as readonly string[]).includes(stored)) return stored as Lang;
  } catch {
    /* storage may be blocked */
  }
  // English is the default; another language only after the person picks it.
  return "en";
}

const initial = detect();

export const i18nReady = i18n.use(initReactI18next).init({
  resources: Object.fromEntries(langs.map((lang, index) => [lang, { translation: pick(strings, index) }])),
  lng: initial,
  fallbackLng: "en",
  interpolation: { escapeValue: false },
  returnNull: false,
});

const htmlLang: Record<Lang, string> = { en: "en", ru: "ru", zh: "zh-CN" };
document.documentElement.lang = htmlLang[initial];

export function currentLang(): Lang {
  const lang = i18n.language as Lang;
  return (langs as readonly string[]).includes(lang) ? lang : "en";
}

/** BCP-47 locale for Intl formatting. */
export function localeOf(lang = currentLang()): string {
  return htmlLang[lang];
}

export function setLocale(locale: Lang) {
  try {
    localStorage.setItem(KEY, locale);
  } catch {
    /* ignore */
  }
  document.documentElement.lang = htmlLang[locale];
  void i18n.changeLanguage(locale);
}

export { i18n };
