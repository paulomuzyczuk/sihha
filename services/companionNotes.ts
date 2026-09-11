import { SupabaseClient } from '@supabase/supabase-js';

// Read-only access to the therapeutic-companion (caregiver) free-text notes
// left on care-log entries (2026-07-30). Caregiver notes are otherwise excluded
// from every read path (aggregates and FHIR both drop them), so this is a
// deliberate, membership-scoped surface — the caregiver counterpart to the
// clinician-only session-note lookup in app/api/logs/notes. Surfaced to the
// clinical team (psychologist + psychiatrist) and, exhaustively, to the admin.

export interface CompanionNote {
  id: string;
  logDate: string;
  notes: string;
  createdAt: string;
}

interface CompanionNoteRow {
  id: string;
  log_date: string;
  shift_notes: string | null;
  created_at: string;
}

/**
 * Inclusive ISO-day bounds for the query. `since` floors the clinician's recent
 * window; `until` caps it at today so future-dated entries (seed/dummy data, or
 * a mistaken backdate) never leak in — the bug that made the "last 15 days" view
 * show everything. Both null → the admin's exhaustive view.
 */
export interface CompanionNoteWindow {
  since: string | null;
  until: string | null;
}

/**
 * Caregiver notes for a recipient, newest first. Entries with a null or
 * whitespace-only note are dropped so the feed never shows blank rows for
 * check-ins submitted without a note. Throws on a query error for the route to
 * translate into a generic 500.
 */
export async function fetchCompanionNotes(
  adminDb: SupabaseClient,
  recipientId: string,
  window: CompanionNoteWindow,
): Promise<CompanionNote[]> {
  let query = adminDb
    .from('care_log_entries')
    .select('id, log_date, shift_notes, created_at')
    .eq('recipient_id', recipientId)
    .eq('author_role', 'caregiver')
    .not('shift_notes', 'is', null)
    .order('log_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (window.since) query = query.gte('log_date', window.since);
  if (window.until) query = query.lte('log_date', window.until);

  const { data, error } = await query;
  if (error) throw error;

  return ((data as CompanionNoteRow[] | null) ?? [])
    .filter((row) => (row.shift_notes ?? '').trim().length > 0)
    .map((row) => ({
      id: row.id,
      logDate: row.log_date,
      notes: row.shift_notes as string,
      createdAt: row.created_at,
    }));
}
