import { CARE_ROLES } from '../../lib/constants';

/**
 * Post-login landing page (M3: membership-based). Platform admins land on
 * /admin; clinicians on the aggregate dashboard; caregivers and recipients
 * on /dashboard. Returns null when the account belongs to no care circle —
 * the caller treats that as "not yet authorized".
 */
export function homeRouteForMemberships(
  isPlatformAdmin: boolean,
  careRoles: readonly string[],
): string | null {
  if (isPlatformAdmin) return '/admin';
  if (careRoles.length === 0) return null;
  if (careRoles.includes(CARE_ROLES.CLINICIAN)) return '/clinician';
  return '/dashboard';
}
