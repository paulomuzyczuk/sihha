import { SupabaseClient } from '@supabase/supabase-js';
import { weekdayMon0FromDateStr } from './dynamicLog';

// Single source of truth for "who is responsible for logging on date X" for a
// recipient. Resolution: a date-specific override (care_shift_overrides) wins;
// otherwise the weekly default (care_shift_defaults) for that weekday (Mon=0).
// An override row decides the day by EXISTING, not by the value it carries — a
// row with a NULL user means "nobody on shift" (a day off, or one traded away)
// and must not fall through to the weekday default. See the 20260828000000
// migration: before it, a swap could only record the day taken on.
// Both the missing-log alert and the fill-reminder push resolve through here, so
// the two crons can never disagree about whose turn it is. Returns null when no
// shift is assigned for the day (nobody to nudge). The admin is never assigned a
// shift, so they are never returned here — only ever CC'd by the email layer.

export interface ResponsibleParty {
  userId: string;
  role: string; // the responsible person's care_team_members.role
  email: string | null;
}

/** The override for the date, else the weekday default; null if unassigned. */
async function resolveResponsibleUserId(
  adminDb: SupabaseClient,
  recipientId: string,
  date: string,
  weekday: number,
): Promise<string | null> {
  const { data: override } = await adminDb
    .from('care_shift_overrides')
    .select('responsible_user_id')
    .eq('recipient_id', recipientId)
    .eq('shift_date', date)
    .maybeSingle();
  // Presence, not truthiness: a row carrying NULL is an explicit "nobody today"
  // and answers the question. Only the absence of a row defers to the weekday.
  if (override) return override.responsible_user_id ?? null;

  const { data: weekly } = await adminDb
    .from('care_shift_defaults')
    .select('responsible_user_id')
    .eq('recipient_id', recipientId)
    .eq('weekday', weekday)
    .maybeSingle();
  return weekly?.responsible_user_id ?? null;
}

/**
 * Who owns date `date` (recipient-local YYYY-MM-DD, `weekday` Mon=0) for this
 * recipient — resolved to a specific person with their role and email.
 */
export async function resolveResponsibleParty(
  adminDb: SupabaseClient,
  recipientId: string,
  date: string,
  weekday: number,
): Promise<ResponsibleParty | null> {
  const userId = await resolveResponsibleUserId(
    adminDb,
    recipientId,
    date,
    weekday,
  );
  if (!userId) return null;

  const { data: member } = await adminDb
    .from('care_team_members')
    .select('role')
    .eq('recipient_id', recipientId)
    .eq('user_id', userId)
    .maybeSingle();
  const { data: authUser } = await adminDb.auth.admin.getUserById(userId);

  return {
    userId,
    role: (member?.role as string) ?? 'caregiver',
    email: authUser?.user?.email ?? null,
  };
}

/**
 * The care role of whoever owns `date` (recipient-local YYYY-MM-DD, `weekday`
 * Mon=0) for this recipient, or null when the day is unassigned. A lean variant
 * of resolveResponsibleParty (skips the auth/email lookup) for callers that only
 * need to branch on the role — e.g. gating the recipient's solo-day self
 * check-in in /api/metrics so their form stays empty on a caregiver's shift day.
 */
export async function resolveResponsibleRole(
  adminDb: SupabaseClient,
  recipientId: string,
  date: string,
  weekday: number,
): Promise<string | null> {
  const userId = await resolveResponsibleUserId(
    adminDb,
    recipientId,
    date,
    weekday,
  );
  if (!userId) return null;

  const { data: member } = await adminDb
    .from('care_team_members')
    .select('role')
    .eq('recipient_id', recipientId)
    .eq('user_id', userId)
    .maybeSingle();
  return (member?.role as string) ?? null;
}

/**
 * The responsible care-team ROLE for each date in `dates` (recipient-local
 * YYYY-MM-DD), resolved in three queries instead of one round-trip per day —
 * the batched form the calendar Turno source needs to project a whole month.
 * Same precedence as the single-date resolvers: a date override wins over the
 * weekday default; a day with nobody assigned maps to null. Throws on a query
 * error for the caller to translate into a generic 500.
 */
export async function resolveResponsibleRolesForRange(
  adminDb: SupabaseClient,
  recipientId: string,
  dates: string[],
): Promise<Map<string, string | null>> {
  if (dates.length === 0) return new Map();
  const [defaults, overrides, members] = await Promise.all([
    adminDb
      .from('care_shift_defaults')
      .select('weekday, responsible_user_id')
      .eq('recipient_id', recipientId),
    adminDb
      .from('care_shift_overrides')
      .select('shift_date, responsible_user_id')
      .eq('recipient_id', recipientId)
      .gte('shift_date', dates[0])
      .lte('shift_date', dates[dates.length - 1]),
    adminDb
      .from('care_team_members')
      .select('user_id, role')
      .eq('recipient_id', recipientId),
  ]);
  if (defaults.error) throw defaults.error;
  if (overrides.error) throw overrides.error;
  if (members.error) throw members.error;

  const roleByUser = new Map<string, string>(
    (members.data ?? []).map((m) => [m.user_id, m.role as string]),
  );
  const userByWeekday = new Map<number, string>(
    (defaults.data ?? []).map((d) => [d.weekday, d.responsible_user_id]),
  );
  // Keyed on every overridden date, including those whose value is NULL, so the
  // lookup below can tell "cleared" from "not overridden" — `??` on the value
  // alone would silently hand a cleared day back to its weekday default.
  const userByDate = new Map<string, string | null>(
    (overrides.data ?? []).map((o) => [o.shift_date, o.responsible_user_id]),
  );

  return new Map(
    dates.map((date) => {
      const userId = userByDate.has(date)
        ? userByDate.get(date)
        : (userByWeekday.get(weekdayMon0FromDateStr(date)) ?? null);
      return [date, userId ? (roleByUser.get(userId) ?? null) : null];
    }),
  );
}

/**
 * Whether the responsible person authored the day's log. A person-level check
 * (author_id), so on a therapist day a recipient self-check-in does not excuse
 * the therapist, and vice-versa — whoever owns the day must be the one who logs.
 */
export async function responsiblePartyLogged(
  adminDb: SupabaseClient,
  recipientId: string,
  date: string,
  responsibleUserId: string,
): Promise<boolean> {
  const { data } = await adminDb
    .from('care_log_entries')
    .select('id')
    .eq('recipient_id', recipientId)
    .eq('log_date', date)
    .eq('author_id', responsibleUserId)
    .limit(1);
  return (data?.length ?? 0) > 0;
}
