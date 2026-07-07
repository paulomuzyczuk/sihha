import { NextRequest, NextResponse } from 'next/server';
import { getAdminDbClient } from '../../../../services/db';
import {
  toMedicationStatements,
  toSearchsetBundle,
} from '../../../../services/fhir';
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

// GET [base]/MedicationStatement?patient=<id>[&date=...][&_count][&_offset]
// One statement per medication-checklist item: taken → completed,
// not taken → not-taken.
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

  const statements = rows.entries.flatMap((entry) =>
    toMedicationStatements(rows.definitions, entry, patient),
  );
  const page = statements.slice(window.offset, window.offset + window.count);

  return fhirJson(
    toSearchsetBundle(
      page,
      statements.length,
      fhirBaseUrl(req),
      pagingLinks(req, window, statements.length),
    ),
  );
}
