import { NextRequest, NextResponse } from 'next/server';
import { getAdminDbClient } from '../../../../../../services/db';
import type { CareRole } from '../../../../../../services/careTeam';
import {
  FhirResource,
  toCareTeam,
  toMedicationStatements,
  toObservations,
  toPatient,
  toSearchsetBundle,
} from '../../../../../../services/fhir';
import {
  authorizeFhirRequest,
  fetchClinicalRows,
  fhirBaseUrl,
  fhirError,
  fhirJson,
  parseSearchWindow,
} from '../../../../../../services/fhirHttp';

// GET [base]/Patient/{id}/$everything — the whole circle in one Bundle:
// Patient, CareTeam, every Observation and MedicationStatement. This is the
// "take your history to another system" export; date filters narrow the
// window, paging is intentionally absent (volume is a handful of rows per
// day by design).
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await context.params;
  const auth = await authorizeFhirRequest(req, id);
  if (!auth.ok) return auth.response;

  const window = parseSearchWindow(req);
  if (window.invalid) {
    return fhirError(400, 'invalid', window.invalid);
  }

  const adminDb = getAdminDbClient();
  const rows = await fetchClinicalRows(adminDb, id, window);
  if (!rows) {
    return fhirError(500, 'exception', 'Internal server error');
  }

  const { data: memberRows, error: memberError } = await adminDb
    .from('care_team_members')
    .select('role, member_label')
    .eq('recipient_id', id);
  if (memberError) {
    return fhirError(500, 'exception', 'Internal server error');
  }

  const resources: FhirResource[] = [
    toPatient(auth.recipient),
    toCareTeam(
      id,
      (memberRows ?? []) as Array<{
        role: CareRole;
        member_label: string | null;
      }>,
    ),
    ...rows.entries.flatMap((entry) =>
      toObservations(rows.definitions, entry, id),
    ),
    ...rows.entries.flatMap((entry) =>
      toMedicationStatements(rows.definitions, entry, id),
    ),
  ];

  return fhirJson(
    toSearchsetBundle(resources, resources.length, fhirBaseUrl(req)),
  );
}
