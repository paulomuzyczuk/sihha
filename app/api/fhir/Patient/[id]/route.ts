import { NextRequest, NextResponse } from 'next/server';
import { toPatient } from '../../../../../services/fhir';
import {
  authorizeFhirRequest,
  fhirJson,
} from '../../../../../services/fhirHttp';

// GET [base]/Patient/{id} — single read. Membership authorization doubles as
// existence gating: a caller only ever resolves circles they own, so an
// unknown id and a foreign id both end in the same 403 outcome.
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await context.params;
  const auth = await authorizeFhirRequest(req, id);
  if (!auth.ok) return auth.response;

  return fhirJson(toPatient(auth.recipient));
}
