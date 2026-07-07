import { NextRequest, NextResponse } from 'next/server';
import { FHIR_VERSION } from '../../../../services/fhir';
import { fhirError, fhirJson } from '../../../../services/fhirHttp';
import { getClientIp } from '../../../../services/apiAuth';
import { checkIpRateLimit } from '../../../../services/rateLimiter';

// GET [base]/metadata — the CapabilityStatement every FHIR client fetches
// first to discover what this server supports. Deliberately unauthenticated
// (it describes the interface, never instance data) but IP-rate-limited like
// every other endpoint. Read-only by design: sihha's write path stays the
// dynamic Zod-validated /api/logs flow, so no create/update interactions are
// declared.

// Bumped when the supported surface changes, not per deploy.
const CAPABILITY_DATE = '2026-07-07';

const SEARCH_TYPE = [{ code: 'search-type' }];

const CAPABILITY_STATEMENT = {
  resourceType: 'CapabilityStatement',
  status: 'active',
  date: CAPABILITY_DATE,
  kind: 'instance',
  software: { name: 'sihha' },
  implementation: {
    description:
      'Read-only FHIR R4 facade over a sihha care-circle instance. ' +
      'Raw-entry exports are owner-gated; free-text notes and geolocation ' +
      'are never exposed.',
  },
  fhirVersion: FHIR_VERSION,
  format: ['application/fhir+json'],
  rest: [
    {
      mode: 'server',
      security: {
        description: 'Bearer JWT (Supabase Auth); circle-owner role required.',
      },
      resource: [
        {
          type: 'Patient',
          interaction: [{ code: 'read' }, { code: 'search-type' }],
          operation: [
            {
              name: 'everything',
              definition:
                'http://hl7.org/fhir/OperationDefinition/Patient-everything',
            },
          ],
        },
        {
          type: 'Observation',
          interaction: SEARCH_TYPE,
          searchParam: [
            { name: 'patient', type: 'reference' },
            { name: 'date', type: 'date' },
          ],
        },
        {
          type: 'MedicationStatement',
          interaction: SEARCH_TYPE,
          searchParam: [
            { name: 'patient', type: 'reference' },
            { name: 'date', type: 'date' },
          ],
        },
        {
          type: 'CareTeam',
          interaction: SEARCH_TYPE,
          searchParam: [{ name: 'patient', type: 'reference' }],
        },
      ],
    },
  ],
} as const;

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!(await checkIpRateLimit(getClientIp(req))).allowed) {
    return fhirError(429, 'throttled', 'Too many requests');
  }
  return fhirJson(CAPABILITY_STATEMENT);
}
