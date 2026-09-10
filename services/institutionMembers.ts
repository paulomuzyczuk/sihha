import { SupabaseClient } from '@supabase/supabase-js';

// Institution-membership reads/writes used by the institution-admin routes.
// Kept out of institutionAuth.ts so that module stays focused on the request
// preamble; this one is the data access for "who is in this institution".
// Every function takes an explicit service-role client (DI) so callers, not
// this module, own the connection.

/** user_ids of every member of one institution. */
export async function institutionMemberUserIds(
  adminDb: SupabaseClient,
  institutionId: string,
): Promise<string[]> {
  const { data, error } = await adminDb
    .from('institution_members')
    .select('user_id')
    .eq('institution_id', institutionId);
  if (error) throw error;
  return (data ?? []).map((row) => row.user_id as string);
}

/** Whether a user belongs to one institution (any institution_role). */
export async function isInstitutionMember(
  adminDb: SupabaseClient,
  institutionId: string,
  userId: string,
): Promise<boolean> {
  const { data } = await adminDb
    .from('institution_members')
    .select('user_id')
    .eq('institution_id', institutionId)
    .eq('user_id', userId)
    .maybeSingle();
  return Boolean(data);
}

/**
 * Identity (id + e-mail) of every member of one institution — the
 * institution-scoped account list. Resolved per-id via the auth admin API
 * and NEVER via a platform-wide listUsers(), so the result can only ever
 * contain this institution's own people (the fix for the cross-tenant
 * enumeration leak in GET /api/admin/users).
 */
export async function institutionMemberAccounts(
  adminDb: SupabaseClient,
  institutionId: string,
): Promise<{ id: string; email: string }[]> {
  const ids = await institutionMemberUserIds(adminDb, institutionId);
  const accounts: { id: string; email: string }[] = [];
  for (const id of ids) {
    const { data } = await adminDb.auth.admin.getUserById(id);
    if (data?.user?.email) accounts.push({ id, email: data.user.email });
  }
  return accounts;
}

/**
 * Whether a care recipient belongs to one institution — the per-recipient
 * scoping check for admin routes that take a recipient_id in their body
 * (alert rules, consumable items): authorizeInstitutionAdminRequest proves
 * the caller runs an institution, this proves the TARGET recipient is
 * actually inside it, so one institution's admin can never act on another
 * institution's circle by guessing/enumerating its recipient id.
 */
export async function isRecipientInInstitution(
  adminDb: SupabaseClient,
  recipientId: string,
  institutionId: string,
): Promise<boolean> {
  const { data } = await adminDb
    .from('care_recipients')
    .select('id')
    .eq('id', recipientId)
    .eq('institution_id', institutionId)
    .maybeSingle();
  return Boolean(data);
}

/** Add a user to an institution as staff; idempotent (no-op if already a member). */
export async function addInstitutionStaffMember(
  adminDb: SupabaseClient,
  institutionId: string,
  userId: string,
): Promise<{ error: unknown }> {
  const { error } = await adminDb.from('institution_members').upsert(
    {
      institution_id: institutionId,
      user_id: userId,
      institution_role: 'institution_staff',
    },
    { onConflict: 'institution_id,user_id', ignoreDuplicates: true },
  );
  return { error };
}
