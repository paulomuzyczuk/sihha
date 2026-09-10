// Loads a recipient's crisis plan from the protected crisis_* tables. Those
// tables grant SELECT to service_role only and carry no client-facing RLS
// policies, so this module (behind authorizeCareRequest) is the ONLY path from
// the plan to a browser.
//
// Assembly, not filtering: the caller has already been authorized for this
// recipient. What matters here is that the plan comes out complete and in
// order — a silently dropped step is a safety defect, not a display bug.

import type {
  CrisisPlan,
  CrisisPlanContact,
  CrisisPlanProtocol,
  CrisisPlanStep,
} from '../lib/crisisPlan/types';

// Structural minimum of the service-role client, so tests can inject a fake.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CrisisPlanDb = { from: (table: string) => any };

interface ContactRow {
  id: string;
  name: string;
  phone: string;
  whatsapp_only: boolean;
}

interface ProtocolRow {
  id: string;
  slug: string;
  title: string;
  section_title: string | null;
  responsible: string | null;
  note: string | null;
  facility_name: string | null;
  facility_city: string | null;
  facility_transport: string | null;
}

interface StepRow {
  protocol_id: string;
  sort_order: number;
  step_text: string | null;
  contact_id: string | null;
  role_label: string | null;
  is_fallback: boolean;
}

function failed(table: string, error: { message?: string }): Error {
  return new Error(
    `loadCrisisPlan: ${table} query failed — ${error.message ?? 'unknown error'}`,
  );
}

async function fetchContacts(
  db: CrisisPlanDb,
  recipientId: string,
): Promise<Map<string, CrisisPlanContact>> {
  const { data, error } = await db
    .from('crisis_contacts')
    .select('id, name, phone, whatsapp_only')
    .eq('recipient_id', recipientId);
  if (error) throw failed('crisis_contacts', error);
  const rows = (data ?? []) as ContactRow[];
  return new Map(
    rows.map((row) => [
      row.id,
      {
        id: row.id,
        name: row.name,
        phone: row.phone,
        whatsappOnly: row.whatsapp_only,
      },
    ]),
  );
}

async function fetchProtocols(
  db: CrisisPlanDb,
  recipientId: string,
): Promise<ProtocolRow[]> {
  const { data, error } = await db
    .from('crisis_protocols')
    .select(
      'id, slug, title, section_title, responsible, note, facility_name, facility_city, facility_transport',
    )
    .eq('recipient_id', recipientId)
    .order('sort_order', { ascending: true });
  if (error) throw failed('crisis_protocols', error);
  return (data ?? []) as ProtocolRow[];
}

async function fetchSteps(
  db: CrisisPlanDb,
  protocolIds: string[],
): Promise<StepRow[]> {
  const { data, error } = await db
    .from('crisis_protocol_steps')
    .select(
      'protocol_id, sort_order, step_text, contact_id, role_label, is_fallback',
    )
    .in('protocol_id', protocolIds)
    .order('sort_order', { ascending: true });
  if (error) throw failed('crisis_protocol_steps', error);
  return (data ?? []) as StepRow[];
}

function toStep(
  row: StepRow,
  contacts: Map<string, CrisisPlanContact>,
): CrisisPlanStep | null {
  // A step naming a contact that no longer exists would render as a bullet
  // with no name and no number. The schema's on-delete-restrict makes this
  // unreachable through normal edits; drop it rather than render a dead entry.
  if (row.contact_id && !contacts.has(row.contact_id)) return null;
  return {
    text: row.step_text,
    contact: row.contact_id ? (contacts.get(row.contact_id) ?? null) : null,
    roleLabel: row.role_label,
    isFallback: row.is_fallback,
  };
}

function toProtocol(
  row: ProtocolRow,
  steps: CrisisPlanStep[],
): CrisisPlanProtocol {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    sectionTitle: row.section_title,
    responsible: row.responsible,
    note: row.note,
    facilityName: row.facility_name,
    facilityCity: row.facility_city,
    facilityTransport: row.facility_transport,
    steps,
  };
}

/**
 * The recipient's whole crisis plan, protocols in sort order and each
 * protocol's steps in step order. Returns an empty plan (never throws) when
 * the recipient has no plan configured.
 */
export async function loadCrisisPlan(
  db: CrisisPlanDb,
  recipientId: string,
): Promise<CrisisPlan> {
  const [contacts, protocolRows] = await Promise.all([
    fetchContacts(db, recipientId),
    fetchProtocols(db, recipientId),
  ]);
  const contactList = [...contacts.values()];
  if (protocolRows.length === 0)
    return { protocols: [], contacts: contactList };

  const stepRows = await fetchSteps(
    db,
    protocolRows.map((row) => row.id),
  );
  const byProtocol = new Map<string, CrisisPlanStep[]>();
  for (const row of stepRows) {
    const step = toStep(row, contacts);
    if (!step) continue;
    const list = byProtocol.get(row.protocol_id) ?? [];
    list.push(step);
    byProtocol.set(row.protocol_id, list);
  }

  return {
    protocols: protocolRows.map((row) =>
      toProtocol(row, byProtocol.get(row.id) ?? []),
    ),
    contacts: contactList,
  };
}
