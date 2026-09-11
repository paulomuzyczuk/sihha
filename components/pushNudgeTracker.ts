// Gates the push opt-in nudge (M15 follow-up): it appears only after the member
// has actually interacted with the app — 5 clicks on this device — and at most
// once per calendar month, so it never nags on the first screen or repeats
// within a month. Storage is injected so the logic is testable without a DOM.

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const INTERACTION_COUNT_KEY = 'sihha.pushNudge.interactions';
const NUDGE_MONTH_KEY = 'sihha.pushNudge.lastMonth';

export const PUSH_NUDGE_INTERACTION_THRESHOLD = 5;

/** Increments the click counter for this device and returns the new total. */
export function recordInteraction(storage: KeyValueStorage): number {
  const next = getInteractionCount(storage) + 1;
  storage.setItem(INTERACTION_COUNT_KEY, String(next));
  return next;
}

export function getInteractionCount(storage: KeyValueStorage): number {
  const raw = Number(storage.getItem(INTERACTION_COUNT_KEY));
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;
}

/** Zeroes the counter — called once a nudge fires so next month starts fresh. */
export function resetInteractionCount(storage: KeyValueStorage): void {
  storage.setItem(INTERACTION_COUNT_KEY, '0');
}

/** Whether the nudge already fired in the given calendar month (YYYY-MM). */
export function nudgeShownInMonth(
  storage: KeyValueStorage,
  month: string,
): boolean {
  return storage.getItem(NUDGE_MONTH_KEY) === month;
}

/** Records that the nudge fired in the given calendar month (YYYY-MM). */
export function markPushNudgeShown(
  storage: KeyValueStorage,
  month: string,
): void {
  storage.setItem(NUDGE_MONTH_KEY, month);
}
