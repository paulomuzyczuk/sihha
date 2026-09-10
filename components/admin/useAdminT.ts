'use client';

import { useCallback } from 'react';
import { useI18n } from '../../lib/i18n/I18nProvider';
import type { Locale, TranslationVars } from '../../lib/i18n/dictionaries';

// Local i18n resolver for the admin console. The admin-console dictionaries are
// DELIBERATELY kept out of the global TranslationKey merge (lib/i18n/
// dictionaries.ts): those ~155 admin-only strings would otherwise ride in the
// shared bundle that EVERY route loads, so patients/caregivers would download
// admin copy they never see. Resolving them here — against a dictionary that
// only the code-split /admin chunk imports — keeps that weight on /admin alone
// (bundle-budget gate). Compile-time pt/en parity still holds: each dict types
// its En object as Record<keyof Pt, string>, so a missing/extra key fails
// typecheck even without the global parity test. Substitution matches the
// shared translate(): {token} is replaced only when a matching var is passed.
export function useAdminT<K extends string>(
  dictPt: Record<K, string>,
  dictEn: Record<K, string>,
): (key: K, vars?: TranslationVars) => string {
  const { locale } = useI18n();
  return useCallback(
    (key: K, vars?: TranslationVars): string => {
      const byLocale: Record<Locale, Record<K, string>> = {
        pt: dictPt,
        en: dictEn,
      };
      const template = byLocale[locale][key] ?? dictPt[key];
      if (!vars) return template;
      return template.replace(/\{(\w+)\}/g, (token, name: string) =>
        name in vars ? String(vars[name]) : token,
      );
    },
    [locale, dictPt, dictEn],
  );
}
