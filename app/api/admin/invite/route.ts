import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ERROR_MESSAGES } from '../../../../lib/constants';
import { getAdminDbClient } from '../../../../services/db';
import { authorizeInstitutionAdminRequest } from '../../../../services/institutionAuth';
import {
  addInstitutionStaffMember,
  institutionMemberAccounts,
} from '../../../../services/institutionMembers';
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
  const auth = await authorizeInstitutionAdminRequest(req);
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

  // Circle resolution — always scoped to the caller's institution, so an
  // admin can never invite into another institution's circle. Explicit
  // recipient_id (must belong to this institution), or the institution's
  // single active recipient; multi-circle institutions must pass it
  // explicitly.
  let recipientId = parsed.data.recipient_id;
  if (!recipientId) {
    const { data: recipients, error: recipientsError } = await adminDb
      .from('care_recipients')
      .select('id')
      .eq('active', true)
      .eq('institution_id', auth.institutionId);
    if (recipientsError || !recipients || recipients.length !== 1) {
      return NextResponse.json(
        { error: 'recipient_id required (multiple care circles)' },
        { status: 400 },
      );
    }
    recipientId = recipients[0].id;
  } else {
    const { data: recipient, error: recipientError } = await adminDb
      .from('care_recipients')
      .select('id')
      .eq('id', recipientId)
      .eq('institution_id', auth.institutionId)
      .maybeSingle();
    if (recipientError || !recipient) {
      return NextResponse.json(
        { error: 'recipient_id not found' },
        { status: 400 },
      );
    }
  }

  const { data: invited, error: inviteError } =
    await adminDb.auth.admin.inviteUserByEmail(email, {
      data: { full_name },
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/reset-password`,
    });

  if (inviteError || !invited?.user) {
    if (inviteError?.code === 'email_exists' || inviteError?.status === 422) {
      // Institution-scoped disclosure (audit A10): "already registered" is
      // revealed only when the address belongs to a member of the caller's
      // own institution — information the admin can already see via
      // GET /api/admin/users. Any other existing account gets a response
      // byte-identical to a successful invite, so this route cannot serve
      // as a platform-wide account-existence oracle.
      const accounts = await institutionMemberAccounts(
        adminDb,
        auth.institutionId,
      );
      const ownMember = accounts.some(
        (account) => account.email.toLowerCase() === email.toLowerCase(),
      );
      if (ownMember) {
        return NextResponse.json(
          { error: 'E-mail já cadastrado' },
          { status: 409 },
        );
      }
      logger.warn('invite: suppressed email_exists outside the institution', {
        route: '/api/admin/invite',
        action: 'invite-suppressed',
      });
      return NextResponse.json({ invited: true }, { status: 201 });
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

  // Enroll the invitee in the institution itself (not just the circle), so
  // the institution's account list and future institution-scoped checks see
  // them. Same rollback posture as the circle membership — deleting the
  // user cascades both memberships.
  const { error: institutionMemberError } = await addInstitutionStaffMember(
    adminDb,
    auth.institutionId,
    invitedUserId,
  );
  if (institutionMemberError) {
    logger.error(
      'invite: institution membership insert failed',
      { route: '/api/admin/invite', action: 'institution-membership', role },
      institutionMemberError,
    );
    await adminDb.auth.admin.deleteUser(invitedUserId);
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
