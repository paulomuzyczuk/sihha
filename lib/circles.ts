// Client-side circle selection (M4): a user with several care-circle
// memberships picks one, the choice is persisted, and every membership-scoped
// API call carries it as the ?recipient= param that authorizeCareRequest
// validates. Single-circle users never see a switcher — the resolved circle
// is simply their only membership.

export interface CareCircle {
  recipientId: string;
  role: string;
  clinicalProfile?: string | null;
  displayName: string;
  kind: string;
}

const STORAGE_KEY = 'sihha.selected_recipient';

export function loadSelectedRecipientId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function persistSelectedRecipientId(recipientId: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, recipientId);
  } catch {
    // Storage unavailable (private mode) — selection just won't survive reloads
  }
}

/** The persisted circle when still valid, otherwise the first membership. */
export function resolveSelectedCircle(
  circles: CareCircle[],
  storedId: string | null,
): CareCircle | null {
  if (circles.length === 0) return null;
  return (
    circles.find((circle) => circle.recipientId === storedId) ?? circles[0]
  );
}

/** Appends the ?recipient= param membership-scoped API routes expect. */
export function withRecipient(route: string, recipientId: string): string {
  const separator = route.includes('?') ? '&' : '?';
  return `${route}${separator}recipient=${encodeURIComponent(recipientId)}`;
}

/**
 * Appends the ?view_as= param the platform admin's role-view switcher uses,
 * plus ?view_profile= when the clinician preview carries a specialist
 * (psychologist/psychiatrist). No-op without a preview role, so callers can
 * compose it unconditionally.
 */
export function withViewAs(
  route: string,
  viewAs?: string | null,
  viewProfile?: string | null,
): string {
  if (!viewAs) return route;
  const separator = route.includes('?') ? '&' : '?';
  const base = `${route}${separator}view_as=${encodeURIComponent(viewAs)}`;
  if (!viewProfile) return base;
  return `${base}&view_profile=${encodeURIComponent(viewProfile)}`;
}
