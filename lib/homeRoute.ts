// Cached post-login landing route, keyed per user. A returning visitor who is
// already authenticated gets redirected instantly instead of waiting for the
// care_team_members query to resolve their home route. Destination pages
// re-validate membership on load, so a stale entry costs at most one extra
// client-side redirect.

const STORAGE_KEY = 'sihha.home_route';

export function loadCachedHomeRoute(userId: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { userId?: string; route?: string };
    return parsed.userId === userId && parsed.route ? parsed.route : null;
  } catch {
    return null;
  }
}

export function persistHomeRoute(userId: string, route: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ userId, route }));
  } catch {
    // Storage unavailable (private mode) — the redirect just won't be instant
  }
}
