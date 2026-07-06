/**
 * Converts JavaScript's Date.getDay() output (Sunday=0 … Saturday=6)
 * to ISO 8601 weekday numbering (Monday=0 … Sunday=6).
 */
export function toIsoDow(jsDay: number): number {
  return (jsDay + 6) % 7;
}
