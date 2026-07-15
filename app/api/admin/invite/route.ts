import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ERROR_MESSAGES, ROLES } from '../../../../lib/constants';
import { getAdminDbClient } from '../../../../services/db';
import { authorizeRequest } from '../../../../services/apiAuth';
import { logger } from '../../../../services/logger';

// Admin-initiated onboarding (M3): the invitee is provisioned as a member of
// a care circle (care_team_members), not with a JWT tier — membership is the
// authorization model. The invitee only sets a password via the emailed
// Supabase invite link.
const InviteSchema = z.object({
  email: z.string().email().max(254),
  full_name: z.string().min(1).max(200),
  role: z.enum(['caregiver', 'clinician', 'recipient']),
  member_label: z.string().min(1).max(100).optional(),
  clinical_profile: z
    .enum(['therapist', 'psychologist', 'psychiatrist'])
    .optional(),
  recipient_id: z.string().uuid().optional(),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await authorizeRequest(req, [ROLES.ADMIN]);
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 },
    );
  }

  const parsed = InviteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: ERROR_MESSAGES.VALIDATION_FAILED },
      { status: 400 },
    );
  }
  const { email, full_name, role, member_label, clinical_profile } =
    parsed.data;

  const adminDb = getAdminDbClient();

  // Circle resolution: explicit recipient_id, or the single active recipient
  // (the flagship case — multi-circle instances must pass it explicitly).
  let recipientId = parsed.data.recipient_id;
  if (!recipientId) {
    const { data: recipients, error: recipientsError } = await adminDb
      .from('care_recipients')
      .select('id')
      .eq('active', true);
    if (recipientsError || !recipients || recipients.length !== 1) {
      return NextResponse.json(
        { error: 'recipient_id required (multiple care circles)' },
        { status: 400 },
      );
    }
    recipientId = recipients[0].id;
  }

  const { data: invited, error: inviteError } =
    await adminDb.auth.admin.inviteUserByEmail(email, {
      data: { full_name },
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/reset-password`,
    });

  if (inviteError || !invited?.user) {
    if (inviteError?.code === 'email_exists' || inviteError?.status === 422) {
      return NextResponse.json(
        { error: 'E-mail já cadastrado' },
        { status: 409 },
      );
    }
    logger.error(
      'invite: inviteUserByEmail failed',
      { route: '/api/admin/invite', action: 'invite', role },
      inviteError,
    );
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
  const invitedUserId = invited.user.id;

  const { error: membershipError } = await adminDb
    .from('care_team_members')
    .insert({
      recipient_id: recipientId,
      user_id: invitedUserId,
      role,
      member_label: member_label ?? null,
      clinical_profile: clinical_profile ?? null,
      receives_alerts: false,
    });

  if (membershipError) {
    // Best-effort rollback so a half-provisioned account (invited but not a
    // member of any circle) never lingers; the admin can simply retry.
    logger.error(
      'invite: membership insert failed',
      { route: '/api/admin/invite', action: 'membership', role },
      membershipError,
    );
    const { error: deleteError } =
      await adminDb.auth.admin.deleteUser(invitedUserId);
    if (deleteError) {
      logger.error(
        'invite: rollback deleteUser failed — user left half-provisioned',
        { route: '/api/admin/invite', action: 'rollback', role },
        deleteError,
      );
    }
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }

  logger.info('invite: user invited', {
    route: '/api/admin/invite',
    action: 'invited',
    role,
  });

  return NextResponse.json({ invited: true }, { status: 201 });
}
