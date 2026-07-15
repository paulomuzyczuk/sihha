/**
 * Converts JavaScript's Date.getDay() output (Sunday=0 … Saturday=6)
 * to ISO 8601 weekday numbering (Monday=0 … Sunday=6).
 */
export function toIsoDow(jsDay: number): number {
  return (jsDay + 6) % 7;
}

/**
 * The app-wide standard for dates shown to people is dd/mm/yyyy — this
 * renders an ISO calendar date (YYYY-MM-DD) that way for server-produced
 * text (alert e-mails, CSV exports). Storage, APIs and FHIR stay ISO.
 */
export function displayDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  return `${day}/${month}/${year}`;
}

/**
 * Progressive dd/mm/yyyy input mask: keeps only digits (max 8) and inserts
 * the slashes while the person types, so the field enforces the display
 * format by construction.
 */
export function maskDisplayDate(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

/**
 * A complete dd/mm/yyyy string as its ISO calendar date, or null when the
 * text is not a real calendar day (31/02, 00/…, wrong length). The
 * round-trip through Date.UTC rejects overflow dates JavaScript would
 * otherwise silently roll over.
 */
export function parseDisplayDate(text: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
  if (!match) return null;
  const [, day, month, year] = match;
  const iso = `${year}-${month}-${day}`;
  const parsed = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10) === iso ? iso : null;
}
