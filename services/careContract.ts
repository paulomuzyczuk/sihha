// Loads a recipient's care agreement from the protected care_contract_* tables.
// Those grant SELECT to service_role only and carry no client-facing policies,
// so this module (behind authorizeCareRequest) is the only path from the
// agreement to a browser.
//
// Every party may read the whole version history, not just the text in force:
// "what did we agree to in May" is a legitimate question for anyone bound by
// the document. So a read always returns the version list alongside the
// requested version.

import type {
  CareContract,
  CareContractSection,
  CareContractVersion,
  CareContractVersionSummary,
} from '../lib/careContract/types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CareContractDb = { from: (table: string) => any };

interface VersionRow {
  id: string;
  version_number: number;
  agreed_on: string;
  monthly_allowance: string | null;
}

interface SectionRow {
  id: string;
  group_title: string | null;
  title: string;
}

interface ClauseRow {
  section_id: string;
  clause_text: string;
}

function failed(table: string, error: { message?: string }): Error {
  return new Error(
    `loadCareContract: ${table} query failed — ${error.message ?? 'unknown error'}`,
  );
}

/** Every version for the recipient, newest first. */
async function fetchVersions(
  db: CareContractDb,
  recipientId: string,
): Promise<VersionRow[]> {
  const { data, error } = await db
    .from('care_contract_versions')
    .select('id, version_number, agreed_on, monthly_allowance')
    .eq('recipient_id', recipientId)
    .order('version_number', { ascending: false });
  if (error) throw failed('care_contract_versions', error);
  return (data ?? []) as VersionRow[];
}

async function fetchSections(
  db: CareContractDb,
  versionId: string,
): Promise<CareContractSection[]> {
  const { data: sectionRows, error } = await db
    .from('care_contract_sections')
    .select('id, group_title, title')
    .eq('version_id', versionId)
    .order('sort_order', { ascending: true });
  if (error) throw failed('care_contract_sections', error);
  const sections = (sectionRows ?? []) as SectionRow[];
  if (sections.length === 0) return [];

  const { data: clauseRows, error: clauseErr } = await db
    .from('care_contract_clauses')
    .select('section_id, clause_text')
    .in(
      'section_id',
      sections.map((s) => s.id),
    )
    .order('sort_order', { ascending: true });
  if (clauseErr) throw failed('care_contract_clauses', clauseErr);

  const bySection = new Map<string, string[]>();
  for (const row of (clauseRows ?? []) as ClauseRow[]) {
    const list = bySection.get(row.section_id) ?? [];
    list.push(row.clause_text);
    bySection.set(row.section_id, list);
  }
  return sections.map((section) => ({
    groupTitle: section.group_title,
    title: section.title,
    clauses: (bySection.get(section.id) ?? []).map((text) => ({ text })),
  }));
}

async function fetchWitnesses(
  db: CareContractDb,
  versionId: string,
): Promise<string[]> {
  const { data, error } = await db
    .from('care_contract_witnesses')
    .select('name')
    .eq('version_id', versionId)
    .order('sort_order', { ascending: true });
  if (error) throw failed('care_contract_witnesses', error);
  return ((data ?? []) as Array<{ name: string }>).map((r) => r.name);
}

function toSummary(
  row: VersionRow,
  currentId: string,
): CareContractVersionSummary {
  return {
    id: row.id,
    versionNumber: row.version_number,
    agreedOn: row.agreed_on,
    isCurrent: row.id === currentId,
  };
}

/**
 * The recipient's agreement: one version in full plus the whole version list.
 * `versionId` selects a past version; omitted, the version in force is returned
 * (the highest version_number — no is_current flag to drift out of step).
 * Returns an empty contract, never throws, when none is recorded.
 */
export async function loadCareContract(
  db: CareContractDb,
  recipientId: string,
  versionId?: string,
): Promise<CareContract> {
  const rows = await fetchVersions(db, recipientId);
  if (rows.length === 0) return { version: null, versions: [] };

  const currentId = rows[0].id;
  const summaries = rows.map((row) => toSummary(row, currentId));
  // An unknown id falls back to the current version rather than erroring: a
  // stale link to a deleted version should still show the agreement in force.
  const wanted = (versionId && rows.find((r) => r.id === versionId)) || rows[0];

  const [sections, witnesses] = await Promise.all([
    fetchSections(db, wanted.id),
    fetchWitnesses(db, wanted.id),
  ]);

  const version: CareContractVersion = {
    id: wanted.id,
    versionNumber: wanted.version_number,
    agreedOn: wanted.agreed_on,
    isCurrent: wanted.id === currentId,
    monthlyAllowance: wanted.monthly_allowance,
    sections,
    witnesses,
  };
  return { version, versions: summaries };
}
