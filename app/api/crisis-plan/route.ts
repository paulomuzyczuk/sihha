import { NextRequest, NextResponse } from 'next/server';
import { getAdminDbClient } from '../../../services/db';
import { authorizeCareRequest } from '../../../services/careTeam';
import { loadCrisisPlan } from '../../../services/crisisPlan';
import {
  crisisPlanPayloadSchema,
  saveCrisisPlan,
} from '../../../services/crisisPlanEditor';
import { parseJsonBody } from '../../../services/apiRequestBody';
import { logger } from '../../../services/logger';

// The crisis plan's only path to a browser. The crisis_* tables grant SELECT
// to service_role alone and carry no client-facing policies, so every access
// decision for this data is made by the authorizeCareRequest call below.
//
// Roles: the caregivers (therapeutic companions) are the plan's own first
// responders, clinicians act on the escalation steps, and owners administer
// the circle. The RECIPIENT is deliberately excluded — the plan describes what
// the team does when they are in crisis, up to police involvement and
// involuntary admission. Read-only; the plan is edited out of band.
export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await authorizeCareRequest(req, [
    'caregiver',
    'clinician',
    'owner',
  ]);
  if (!auth.ok) return auth.response;
  const { recipient } = auth;

  try {
    const plan = await loadCrisisPlan(getAdminDbClient(), recipient.id);
    return NextResponse.json({ plan });
  } catch (err) {
    // The thrown message names the failing table; that stays in the log, never
    // in the response.
    logger.error(
      'crisis-plan: plan load failed',
      { route: '/api/crisis-plan', action: 'select' },
      err,
    );
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}

// Whole-plan replace, owner only. Narrower than the read on purpose: the
// caregivers and clinicians who ACT on the plan do not get to rewrite it —
// changing who gets called in an emergency is an administrative decision, and
// the plan itself says it is revised with the care team, not unilaterally.
//
// A platform admin reaches this the same way they reach every other circle
// surface: ?recipient=<id>&view_as=owner, which authorizeCareRequest turns into
// a real owner membership. No admin-only route, so a self-hoster with no
// institution layer at all still has a working editor.
export async function PUT(req: NextRequest): Promise<NextResponse> {
  const auth = await authorizeCareRequest(req, ['owner']);
  if (!auth.ok) return auth.response;
  const { recipient } = auth;

  const body = await parseJsonBody(req, crisisPlanPayloadSchema);
  if (!body.ok) return body.response;

  try {
    const adminDb = getAdminDbClient();
    await saveCrisisPlan(adminDb, recipient.id, body.data);
    // Return the saved plan so the editor renders exactly what was stored,
    // never its own optimistic copy of it.
    const plan = await loadCrisisPlan(adminDb, recipient.id);
    return NextResponse.json({ plan });
  } catch (err) {
    logger.error(
      'crisis-plan: plan save failed',
      { route: '/api/crisis-plan', action: 'save' },
      err,
    );
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
