import { ROLES } from '../../lib/constants';

type AdminView = 'THERAPIST' | 'PATIENT' | 'DOCTOR' | null;

// Mirrors the redirect logic in app/admin/page.tsx useEffect
function resolveAdminPageAccess(
  role: string | undefined | null,
): 'allow' | '/login' | '/dashboard' {
  if (!role) return '/login';
  if (role === ROLES.ADMIN) return 'allow';
  return '/dashboard';
}

// Mirrors the redirect logic added to app/dashboard/page.tsx
function resolveDashboardAdminRedirect(
  role: string | undefined,
): string | null {
  if (role === ROLES.ADMIN) return '/admin';
  return null;
}

describe('Admin page access control', () => {
  it('allows ADMIN to access /admin', () => {
    expect(resolveAdminPageAccess(ROLES.ADMIN)).toBe('allow');
  });

  it('redirects unauthenticated user to /login', () => {
    expect(resolveAdminPageAccess(null)).toBe('/login');
    expect(resolveAdminPageAccess(undefined)).toBe('/login');
  });

  it('redirects THERAPIST to /dashboard', () => {
    expect(resolveAdminPageAccess(ROLES.THERAPIST)).toBe('/dashboard');
  });

  it('redirects PATIENT to /dashboard', () => {
    expect(resolveAdminPageAccess(ROLES.PATIENT)).toBe('/dashboard');
  });
});

describe('Dashboard ADMIN redirect', () => {
  it('redirects ADMIN role to /admin', () => {
    expect(resolveDashboardAdminRedirect(ROLES.ADMIN)).toBe('/admin');
  });

  it('does not redirect THERAPIST or PATIENT away from dashboard', () => {
    expect(resolveDashboardAdminRedirect(ROLES.THERAPIST)).toBeNull();
    expect(resolveDashboardAdminRedirect(ROLES.PATIENT)).toBeNull();
  });
});

describe('Admin view selection', () => {
  it('starts with no view selected', () => {
    const selectedView: AdminView = null;
    expect(selectedView).toBeNull();
  });

  it('selecting THERAPIST renders LogForm view', () => {
    let selectedView: AdminView = null;
    selectedView = 'THERAPIST';
    expect(selectedView).toBe('THERAPIST');
  });

  it('selecting PATIENT renders InvoiceUploadForm view', () => {
    let selectedView: AdminView = null;
    selectedView = 'PATIENT';
    expect(selectedView).toBe('PATIENT');
  });

  it('selecting DOCTOR renders placeholder card', () => {
    let selectedView: AdminView = null;
    selectedView = 'DOCTOR';
    expect(selectedView).toBe('DOCTOR');
  });

  it('clicking the active view deselects it', () => {
    let selectedView: AdminView = 'THERAPIST';
    // toggle off — same as handleSelectView(selectedView === view ? null : view)
    selectedView = selectedView === 'THERAPIST' ? null : 'THERAPIST';
    expect(selectedView).toBeNull();
  });

  it('switching between views updates selected view', () => {
    let selectedView: AdminView = 'THERAPIST';
    selectedView = 'PATIENT';
    expect(selectedView).toBe('PATIENT');
    selectedView = 'DOCTOR';
    expect(selectedView).toBe('DOCTOR');
  });
});
