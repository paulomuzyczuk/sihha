import { NextRequest, NextResponse } from 'next/server';
import { getAdminDbClient } from '../../../../services/db';
import { toCareTeam, toSearchsetBundle } from '../../../../services/fhir';
import type { CareRole } from '../../../../services/careTeam';
import {
  authorizeFhirRequest,
  fhirBaseUrl,
  fhirError,
  fhirJson,
  patientParam,
} from '../../../../services/fhirHttp';

// GET [base]/CareTeam?patient=<id> — the circle as one CareTeam resource.
// Participants carry care roles and member labels only; user ids and e-mail
// addresses never appear.
export async function GET(req: NextRequest): Promise<NextResponse> {
  const patientId = patientParam(req);
  if (!patientId) {
    return fhirError(
      400,
      'invalid',
      'The patient search parameter is required',
    );
  }

  const auth = await authorizeFhirRequest(req, patientId);
  if (!auth.ok) return auth.response;

  const { data, error } = await getAdminDbClient()
    .from('care_team_members')
    .select('role, member_label')
    .eq('recipient_id', patientId);
  if (error) {
    return fhirError(500, 'exception', 'Internal server error');
  }

  const careTeam = toCareTeam(
    patientId,
    (data ?? []) as Array<{ role: CareRole; member_label: string | null }>,
  );

  return fhirJson(
    toSearchsetBundle([careTeam], 1, fhirBaseUrl(req), [
      { relation: 'self', url: req.nextUrl.toString() },
    ]),
  );
}
