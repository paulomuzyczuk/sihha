import { NextRequest, NextResponse } from 'next/server';
import { getAdminDbClient } from '../../../services/db';
import { authorizeCareRequest } from '../../../services/careTeam';
import { loadCareContract } from '../../../services/careContract';
import {
  careContractPayloadSchema,
  saveCareContractVersion,
} from '../../../services/careContractEditor';
import { parseJsonBody } from '../../../services/apiRequestBody';
import { logger } from '../../../services/logger';

// The care agreement's only path to a browser. The care_contract_* tables grant
// SELECT to service_role alone, so every access decision is made here.
//
// EVERY PARTY READS IT, including the recipient — this is the one clinical
// surface where that is the point rather than an exception. They signed it; the
// document exists so they can revisit what they committed to and what the team
// owes them. The version history is readable by all of them too: "what did we
// agree to in May" is a fair question for anyone bound by the text.
//
// ?version=<id> selects a past version; omitted, the version in force.
export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await authorizeCareRequest(req, [
    'recipient',
    'caregiver',
    'clinician',
    'owner',
  ]);
  if (!auth.ok) return auth.response;
  const { recipient } = auth;

  const versionId = req.nextUrl.searchParams.get('version') ?? undefined;

  try {
    const contract = await loadCareContract(
      getAdminDbClient(),
      recipient.id,
      versionId,
    );
    return NextResponse.json({ contract });
  } catch (err) {
    logger.error(
      'care-contract: load failed',
      { route: '/api/care-contract', action: 'select' },
      err,
    );
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}

// Owner only, and APPEND ONLY: a save publishes a NEW version rather than
// editing the text in force. Nobody — not even the owner — can rewrite what the
// parties already signed, which is what makes the history worth showing them.
//
// A platform admin arrives via ?recipient=<id>&view_as=owner, so there is no
// admin-only route and a self-hoster gets the same editor.
export async function PUT(req: NextRequest): Promise<NextResponse> {
  const auth = await authorizeCareRequest(req, ['owner']);
  if (!auth.ok) return auth.response;
  const { recipient } = auth;

  const body = await parseJsonBody(req, careContractPayloadSchema);
  if (!body.ok) return body.response;

  try {
    const adminDb = getAdminDbClient();
    const versionId = await saveCareContractVersion(
      adminDb,
      recipient.id,
      body.data,
    );
    // Return what was stored, so the editor never renders its optimistic copy.
    const contract = await loadCareContract(adminDb, recipient.id, versionId);
    return NextResponse.json({ contract });
  } catch (err) {
    logger.error(
      'care-contract: save failed',
      { route: '/api/care-contract', action: 'save' },
      err,
    );
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
