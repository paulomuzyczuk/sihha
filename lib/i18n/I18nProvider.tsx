'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  DEFAULT_LOCALE,
  Locale,
  LOCALES,
  translate,
  TranslationKey,
  TranslationVars,
} from './dictionaries';

// UI-language context. DEFAULT_LOCALE (dictionaries.ts) applies until the
// user picks a language; the choice persists per browser in localStorage —
// it is a device preference, not account data, so it needs no schema or API
// surface.

const STORAGE_KEY = 'sihha.locale';

export interface I18n {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey, vars?: TranslationVars) => string;
}

const I18nContext = createContext<I18n>({
  locale: DEFAULT_LOCALE,
  setLocale: () => {},
  t: (key, vars) => translate(DEFAULT_LOCALE, key, vars),
});

function isLocale(value: string | null): value is Locale {
  return (LOCALES as readonly string[]).includes(value ?? '');
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  // First render always uses the default so client hydration matches the
  // server-rendered HTML; the stored preference applies right after mount.
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (isLocale(stored)) setLocaleState(stored);
    } catch {
      // Storage unavailable (private mode) — keep the default
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale === 'pt' ? 'pt-BR' : 'en';
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Best-effort persistence only
    }
  }, []);

  const t = useCallback(
    (key: TranslationKey, vars?: TranslationVars) =>
      translate(locale, key, vars),
    [locale],
  );

  const value = useMemo(
    () => ({ locale, setLocale, t }),
    [locale, setLocale, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  return useContext(I18nContext);
}
