import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import ar from "./ar.json";
import fr from "./fr.json";
import en from "./en.json";

export type Lang = "ar" | "fr" | "en";

const dictionaries: Record<Lang, Record<string, any>> = { ar, fr, en };

interface I18n {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string) => string;
  /** Raw dictionary access for non-string leaves (arrays, objects). */
  tr: (key: string) => any;
  dir: "rtl" | "ltr";
}

const I18nContext = createContext<I18n>(null as unknown as I18n);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>("ar");
  const dir = lang === "ar" ? "rtl" : "ltr";

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
  }, [lang, dir]);

  const t = (key: string): string => {
    const value = tr(key);
    return typeof value === "string" ? value : key;
  };

  const tr = (key: string): any =>
    key.split(".").reduce<any>((acc, part) => acc?.[part], dictionaries[lang]);

  return <I18nContext.Provider value={{ lang, setLang, t, tr, dir }}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  return useContext(I18nContext);
}
