// The one write path into the care agreement. A save always INSERTS a new
// version; it never edits an existing one.
//
// That is the whole point of versioning a signed document: the parties agreed
// to a specific text on a specific date, and rewriting it in place would erase
// what they actually signed. It also makes this module far simpler than the
// crisis-plan editor — no diffing, no id matching, no partial-update window.
//
// The new version number is max(existing) + 1, computed from the rows rather
// than held in a counter that could drift.

import { z } from 'zod';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CareContractEditorDb = { from: (table: string) => any };

const clauseSchema = z.string().trim().min(1).max(1000);

const sectionSchema = z.object({
  groupTitle: z.string().trim().min(1).max(160).nullable().default(null),
  title: z.string().trim().min(1).max(160),
  clauses: z.array(clauseSchema).max(100),
});

export const careContractPayloadSchema = z.object({
  // ISO date the parties agreed the text — not when it was typed in.
  agreedOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'agreedOn must be YYYY-MM-DD'),
  monthlyAllowance: z.string().trim().min(1).max(60).nullable().default(null),
  sections: z.array(sectionSchema).max(50),
  witnesses: z.array(z.string().trim().min(1).max(120)).max(20),
});

export type CareContractPayload = z.infer<typeof careContractPayloadSchema>;

function failed(what: string, error: { message?: string }): Error {
  return new Error(
    `saveCareContractVersion: ${what} failed — ${error.message ?? 'unknown error'}`,
  );
}

/** One past the highest version this recipient has, or 1 for the first. */
export function nextVersionNumber(existing: Array<{ version_number: number }>) {
  return (
    existing.reduce((max, row) => Math.max(max, row.version_number), 0) + 1
  );
}

async function insertSections(
  db: CareContractEditorDb,
  versionId: string,
  payload: CareContractPayload,
): Promise<void> {
  for (const [i, section] of payload.sections.entries()) {
    const { data, error } = await db
      .from('care_contract_sections')
      .insert({
        version_id: versionId,
        group_title: section.groupTitle,
        title: section.title,
        sort_order: i,
      })
      .select('id')
      .single();
    if (error) throw failed('section insert', error);
    if (section.clauses.length === 0) continue;

    const { error: clauseErr } = await db.from('care_contract_clauses').insert(
      section.clauses.map((text, order) => ({
        section_id: (data as { id: string }).id,
        sort_order: order,
        clause_text: text,
      })),
    );
    if (clauseErr) throw failed('clause insert', clauseErr);
  }
}

/**
 * Write the agreement as a NEW version and return its id. Existing versions are
 * left untouched — an amendment adds to the history rather than replacing it.
 */
export async function saveCareContractVersion(
  db: CareContractEditorDb,
  recipientId: string,
  payload: CareContractPayload,
): Promise<string> {
  const { data: existing, error: readErr } = await db
    .from('care_contract_versions')
    .select('version_number')
    .eq('recipient_id', recipientId);
  if (readErr) throw failed('version read', readErr);

  const { data: version, error: verErr } = await db
    .from('care_contract_versions')
    .insert({
      recipient_id: recipientId,
      version_number: nextVersionNumber(
        (existing ?? []) as Array<{ version_number: number }>,
      ),
      agreed_on: payload.agreedOn,
      monthly_allowance: payload.monthlyAllowance,
    })
    .select('id')
    .single();
  if (verErr) throw failed('version insert', verErr);
  const versionId = (version as { id: string }).id;

  await insertSections(db, versionId, payload);

  if (payload.witnesses.length > 0) {
    const { error: witErr } = await db.from('care_contract_witnesses').insert(
      payload.witnesses.map((name, order) => ({
        version_id: versionId,
        name,
        sort_order: order,
      })),
    );
    if (witErr) throw failed('witness insert', witErr);
  }
  return versionId;
}
