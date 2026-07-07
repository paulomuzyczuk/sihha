import { NextRequest, NextResponse } from 'next/server';
import { getAdminDbClient } from '../../../../services/db';
import { toObservations, toSearchsetBundle } from '../../../../services/fhir';
import {
  authorizeFhirRequest,
  fetchClinicalRows,
  fhirBaseUrl,
  fhirError,
  fhirJson,
  pagingLinks,
  parseSearchWindow,
  patientParam,
} from '../../../../services/fhirHttp';

// GET [base]/Observation?patient=<id>[&date=geYYYY-MM-DD][&date=le...]
//     [&_count=N][&_offset=N]
// One Observation per defined metric value; medication checklists live under
// /MedicationStatement. Data volume is bounded by design (a handful of logs
// per day), so the searchset is materialised and offset-paged in memory.
export async function GET(req: NextRequest): Promise<NextResponse> {
  const patient = patientParam(req);
  if (!patient) {
    return fhirError(
      400,
      'invalid',
      'The patient search parameter is required',
    );
  }

  const auth = await authorizeFhirRequest(req, patient);
  if (!auth.ok) return auth.response;

  const window = parseSearchWindow(req);
  if (window.invalid) {
    return fhirError(400, 'invalid', window.invalid);
  }

  const rows = await fetchClinicalRows(getAdminDbClient(), patient, window);
  if (!rows) {
    return fhirError(500, 'exception', 'Internal server error');
  }

  const observations = rows.entries.flatMap((entry) =>
    toObservations(rows.definitions, entry, patient),
  );
  const page = observations.slice(window.offset, window.offset + window.count);

  return fhirJson(
    toSearchsetBundle(
      page,
      observations.length,
      fhirBaseUrl(req),
      pagingLinks(req, window, observations.length),
    ),
  );
}
