import { CARE_ROLES } from '../../lib/constants';

/**
 * Post-login landing page (M3: membership-based). Platform admins who belong
 * to a care circle land on /dashboard, where the role-view switcher lets them
 * preview any role; admins without memberships land on the /admin panel.
 * Clinicians go to the aggregate dashboard; caregivers and recipients to
 * /dashboard. Returns null when a non-admin account belongs to no care
 * circle — the caller treats that as "not yet authorized".
 */
export function homeRouteForMemberships(
  isPlatformAdmin: boolean,
  careRoles: readonly string[],
): string | null {
  if (isPlatformAdmin) return careRoles.length > 0 ? '/dashboard' : '/admin';
  if (careRoles.length === 0) return null;
  if (careRoles.includes(CARE_ROLES.CLINICIAN)) return '/clinician';
  return '/dashboard';
}
