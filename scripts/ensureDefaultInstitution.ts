import { SupabaseClient } from '@supabase/supabase-js';

// Seed scripts run without an auth context, so — unlike the app, which
// derives the institution from the authenticated institution_admin — they
// cannot know which institution a new recipient belongs to. They attach
// every seeded recipient to one reusable local "Default Institution" (slug
// 'default'), created on first use, so the care_recipients.institution_id
// NOT NULL invariant (20260910093020) holds for script-created recipients.
// Local/seed use only; the app never calls this.
export async function ensureDefaultInstitution(
  db: SupabaseClient,
): Promise<string> {
  const { data: existing, error: findError } = await db
    .from('institutions')
    .select('id')
    .eq('slug', 'default')
    .maybeSingle();
  if (findError) throw findError;
  if (existing) return existing.id;

  const { data: created, error: insertError } = await db
    .from('institutions')
    .insert({ name: 'Default Institution', slug: 'default' })
    .select('id')
    .single();
  if (insertError) throw insertError;
  return created.id;
}
