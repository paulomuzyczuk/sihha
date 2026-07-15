import { CARE_ROLES, ROLES } from '../../lib/constants';
import { homeRouteForMemberships } from '../../app/login/logic';

describe('Frontend Login State and Logic Validation', () => {
  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  it('should validate correct email formats', () => {
    expect(validateEmail('therapist@example.com')).toBe(true);
    expect(validateEmail('patient@example.com')).toBe(true);
    expect(validateEmail('admin@example.com')).toBe(true);
  });

  it('should reject invalid email formats', () => {
    expect(validateEmail('therapistexample.com')).toBe(false);
    expect(validateEmail('therapist@')).toBe(false);
    expect(validateEmail('')).toBe(false);
  });

  it('should match role types correctly with permissions', () => {
    const validRoles: readonly string[] = [
      ROLES.ADMIN,
      ROLES.THERAPIST,
      ROLES.PATIENT,
      ROLES.CLINICIAN,
    ];
    expect(validRoles.includes('THERAPIST')).toBe(true);
    expect(validRoles.includes('PATIENT')).toBe(true);
    expect(validRoles.includes('ADMIN')).toBe(true);
    expect(validRoles.includes('CLINICIAN')).toBe(true);
    expect(validRoles.includes('UNKNOWN')).toBe(false);
  });
});

describe('homeRouteForMemberships (post-login landing, M3)', () => {
  it('routes platform admins with a membership to /dashboard (role-view switcher home)', () => {
    expect(homeRouteForMemberships(true, [CARE_ROLES.CAREGIVER])).toBe(
      '/dashboard',
    );
    expect(homeRouteForMemberships(true, [CARE_ROLES.OWNER])).toBe(
      '/dashboard',
    );
  });

  it('routes platform admins without memberships to /admin', () => {
    expect(homeRouteForMemberships(true, [])).toBe('/admin');
  });

  it('routes clinicians to /clinician', () => {
    expect(homeRouteForMemberships(false, [CARE_ROLES.CLINICIAN])).toBe(
      '/clinician',
    );
  });

  it('routes caregivers, recipients, and owners to /dashboard', () => {
    expect(homeRouteForMemberships(false, [CARE_ROLES.CAREGIVER])).toBe(
      '/dashboard',
    );
    expect(homeRouteForMemberships(false, [CARE_ROLES.RECIPIENT])).toBe(
      '/dashboard',
    );
    expect(homeRouteForMemberships(false, [CARE_ROLES.OWNER])).toBe(
      '/dashboard',
    );
  });

  it('returns null for accounts with no membership (not yet authorized)', () => {
    expect(homeRouteForMemberships(false, [])).toBeNull();
  });
});
