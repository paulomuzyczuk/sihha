import { NextRequest, NextResponse } from 'next/server';
import { getAdminDbClient } from '../../../../services/db';
import {
  getAuthenticatedUser,
  getClientIp,
} from '../../../../services/apiAuth';
import {
  checkIpRateLimit,
  checkUserRateLimit,
} from '../../../../services/rateLimiter';
import type { CareRecipientRow } from '../../../../services/careTeam';
import { toPatient, toSearchsetBundle } from '../../../../services/fhir';
import {
  fhirBaseUrl,
  fhirError,
  fhirJson,
} from '../../../../services/fhirHttp';

// GET [base]/Patient — searchset of the care recipients whose circles the
// caller OWNS. This is the one FHIR route without a single target recipient,
// so it runs the preamble inline instead of authorizeFhirRequest.
export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!(await checkIpRateLimit(getClientIp(req))).allowed) {
    return fhirError(429, 'throttled', 'Too many requests');
  }

  const authed = await getAuthenticatedUser(req);
  if (!authed) {
    return fhirError(401, 'login', 'Authentication required');
  }
  if (!(await checkUserRateLimit(authed.user.id)).allowed) {
    return fhirError(429, 'throttled', 'Too many requests');
  }

  const adminDb = getAdminDbClient();
  const { data, error } = await adminDb
    .from('care_team_members')
    .select(
      'recipient_id, care_recipients!inner(id, display_name, kind, timezone, log_cadence, geo_lat, geo_lng, geo_radius_m, active)',
    )
    .eq('user_id', authed.user.id)
    .eq('role', 'owner')
    .eq('care_recipients.active', true);

  if (error) {
    return fhirError(500, 'exception', 'Internal server error');
  }

  const patients = (
    (data ?? []) as unknown as Array<{
      care_recipients: CareRecipientRow;
    }>
  ).map((row) => toPatient(row.care_recipients));

  return fhirJson(
    toSearchsetBundle(patients, patients.length, fhirBaseUrl(req), [
      { relation: 'self', url: req.nextUrl.toString() },
    ]),
  );
}
