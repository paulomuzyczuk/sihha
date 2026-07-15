import { DATE_LOCALES, Locale } from './i18n/dictionaries';

// Decimal conventions: the flagship deployment is Brazilian Portuguese, where
// decimals are written with a comma. Text inputs therefore accept BOTH ','
// and '.' as the separator (values are stored as plain numbers), and display
// formatting follows the active UI locale.

/**
 * Parses user-typed decimal text, accepting ',' or '.' as the separator.
 * Returns NaN for anything else (thousands separators are deliberately not
 * supported — amounts and metric values are small).
 */
export function parseDecimal(raw: string): number {
  const normalized = raw.trim().replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return NaN;
  return parseFloat(normalized);
}

/** Formats a number with the active locale's decimal separator. */
export function formatDecimal(value: number, locale: Locale): string {
  return value.toLocaleString(DATE_LOCALES[locale], {
    maximumFractionDigits: 2,
  });
}
