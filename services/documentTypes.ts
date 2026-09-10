import { SupabaseClient } from '@supabase/supabase-js';

// Document-type registry (institution-scoped admin console). The set of
// doc keys public actually has upload surfaces for — anything else is not a
// real document type on this deployment.
export const DOCUMENT_TYPE_KEYS = [
  'invoice',
  'prescription',
  'evaluation',
] as const;
export type DocumentTypeKey = (typeof DOCUMENT_TYPE_KEYS)[number];

export interface DocumentTypeConfig {
  docKey: DocumentTypeKey;
  active: boolean;
  copy: Record<string, unknown>;
}

const DEFAULT_CONFIG = (docKey: DocumentTypeKey): DocumentTypeConfig => ({
  docKey,
  active: true,
  copy: {},
});

/**
 * Every known doc type for one institution, filled in with the default
 * (active, no copy override) for any key that has no row yet — an
 * institution created after the registry migration has no seed, so it must
 * keep working without one.
 */
export async function listDocumentTypes(
  adminDb: SupabaseClient,
  institutionId: string,
): Promise<DocumentTypeConfig[]> {
  const { data, error } = await adminDb
    .from('document_types')
    .select('doc_key, active, copy')
    .eq('institution_id', institutionId);
  if (error) throw error;

  const byKey = new Map(
    (data ?? []).map((row) => [
      row.doc_key as DocumentTypeKey,
      { docKey: row.doc_key, active: row.active, copy: row.copy ?? {} },
    ]),
  );
  return DOCUMENT_TYPE_KEYS.map((key) => byKey.get(key) ?? DEFAULT_CONFIG(key));
}

/** Upsert one institution's override for a doc type (active flag and/or copy). */
export async function updateDocumentType(
  adminDb: SupabaseClient,
  institutionId: string,
  docKey: DocumentTypeKey,
  input: { active?: boolean; copy?: Record<string, unknown> },
): Promise<{ error: unknown }> {
  const { error } = await adminDb.from('document_types').upsert(
    {
      institution_id: institutionId,
      doc_key: docKey,
      ...(input.active !== undefined ? { active: input.active } : {}),
      ...(input.copy !== undefined ? { copy: input.copy } : {}),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'institution_id,doc_key' },
  );
  return { error };
}
