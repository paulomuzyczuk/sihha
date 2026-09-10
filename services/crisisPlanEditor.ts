// The one write path into the crisis plan. Reads go through
// services/crisisPlan.ts; this module is what an owner's edit lands in.
//
// Whole-plan replace, not per-field patch. The plan is small, it is read as a
// single document, and ordering is part of its meaning — reconciling the whole
// thing makes "step 3 moved above step 2" and "this contact is gone" correct by
// construction instead of by a patch protocol nobody will get right under
// pressure.
//
// Steps are replaced wholesale per protocol; contacts and protocols are matched
// by id so a rename does not orphan the steps pointing at them.

import { z } from 'zod';

// Enough of the service-role client to run the reconcile; lets tests inject a
// recording fake and assert the WRITE ORDER, which is a safety property here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CrisisEditorDb = { from: (table: string) => any };

// A number is transcribed by hand off the screen, so it must at least be long
// enough to dial. Deliberately not a strict E.164 test: the plan has to accept
// short emergency numbers and non-Brazilian formats a self-hoster may use.
const DIALABLE_DIGITS = 3;

const contactSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(120),
  phone: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .refine((v) => v.replace(/\D/g, '').length >= DIALABLE_DIGITS, {
      message: 'phone has too few digits to dial',
    }),
  whatsappOnly: z.boolean().optional().default(false),
});

const stepSchema = z
  .object({
    text: z.string().trim().min(1).max(1000).nullable().default(null),
    contactIndex: z.number().int().min(0).nullable().default(null),
    roleLabel: z.string().trim().min(1).max(160).nullable().default(null),
    isFallback: z.boolean().optional().default(false),
  })
  // Mirrors crisis_protocol_steps_not_empty: an empty step renders as a blank
  // line in a list someone is reading mid-episode.
  .refine((s) => s.text || s.contactIndex !== null || s.roleLabel, {
    message: 'a step must carry text, a contact or a role label',
  });

const protocolSchema = z.object({
  id: z.string().uuid().optional(),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(60)
    .regex(/^[a-z0-9-]+$/, 'slug must be lowercase letters, digits and dashes'),
  title: z.string().trim().min(1).max(160),
  sectionTitle: z.string().trim().min(1).max(160).nullable().default(null),
  responsible: z.string().trim().min(1).max(300).nullable().default(null),
  note: z.string().trim().min(1).max(2000).nullable().default(null),
  facilityName: z.string().trim().min(1).max(160).nullable().default(null),
  facilityCity: z.string().trim().min(1).max(160).nullable().default(null),
  facilityTransport: z.string().trim().min(1).max(300).nullable().default(null),
  steps: z.array(stepSchema).max(50),
});

export const crisisPlanPayloadSchema = z
  .object({
    contacts: z.array(contactSchema).max(50),
    protocols: z.array(protocolSchema).max(50),
  })
  .superRefine((plan, ctx) => {
    const slugs = plan.protocols.map((p) => p.slug);
    if (new Set(slugs).size !== slugs.length) {
      ctx.addIssue({
        code: 'custom',
        message: 'protocol slugs must be unique',
      });
    }
    const names = plan.contacts.map((c) => c.name);
    if (new Set(names).size !== names.length) {
      ctx.addIssue({ code: 'custom', message: 'contact names must be unique' });
    }
    // A step referencing a contact that is not in the list would render with
    // nobody to call.
    for (const protocol of plan.protocols) {
      for (const step of protocol.steps) {
        if (step.contactIndex === null) continue;
        if (step.contactIndex >= plan.contacts.length) {
          ctx.addIssue({
            code: 'custom',
            message: `protocol "${protocol.slug}" references contact #${step.contactIndex}, which does not exist`,
          });
        }
      }
    }
  });

export type CrisisPlanPayload = z.infer<typeof crisisPlanPayloadSchema>;

interface ExistingContact {
  id: string;
  name: string;
  phone: string;
  whatsapp_only: boolean;
}
interface ExistingProtocol {
  id: string;
  slug: string;
}

type ContactInput = {
  id?: string;
  name: string;
  phone: string;
  whatsappOnly?: boolean;
};

export function diffContacts(
  existing: ExistingContact[],
  payload: ContactInput[],
) {
  const keptIds = new Set(
    payload.map((c) => c.id).filter((id): id is string => Boolean(id)),
  );
  return {
    toInsert: payload.filter((c) => !c.id),
    toUpdate: payload
      .filter((c) => c.id)
      .map((c) => ({
        id: c.id!,
        name: c.name,
        phone: c.phone,
        whatsapp_only: c.whatsappOnly ?? false,
      })),
    toDelete: existing.filter((c) => !keptIds.has(c.id)).map((c) => c.id),
  };
}

export function diffProtocols(
  existing: ExistingProtocol[],
  payload: Array<{ id?: string; slug: string }>,
) {
  const keptIds = new Set(
    payload.map((p) => p.id).filter((id): id is string => Boolean(id)),
  );
  return {
    toInsert: payload.filter((p) => !p.id),
    toUpdate: payload.filter((p) => p.id),
    toDelete: existing.filter((p) => !keptIds.has(p.id)).map((p) => p.id),
  };
}

function failed(what: string, error: { message?: string }): Error {
  return new Error(
    `saveCrisisPlan: ${what} failed — ${error.message ?? 'unknown error'}`,
  );
}

function protocolRow(
  recipientId: string,
  protocol: CrisisPlanPayload['protocols'][number],
  sortOrder: number,
) {
  return {
    recipient_id: recipientId,
    slug: protocol.slug,
    title: protocol.title,
    section_title: protocol.sectionTitle,
    responsible: protocol.responsible,
    note: protocol.note,
    facility_name: protocol.facilityName,
    facility_city: protocol.facilityCity,
    facility_transport: protocol.facilityTransport,
    sort_order: sortOrder,
  };
}

/** Contact rows keyed by their index in the payload, inserting the new ones. */
async function reconcileContacts(
  db: CrisisEditorDb,
  recipientId: string,
  payload: CrisisPlanPayload,
): Promise<Map<number, string>> {
  const { data: existing, error } = await db
    .from('crisis_contacts')
    .select('id, name, phone, whatsapp_only')
    .eq('recipient_id', recipientId);
  if (error) throw failed('contact read', error);

  const diff = diffContacts(
    (existing ?? []) as ExistingContact[],
    payload.contacts,
  );
  for (const row of diff.toUpdate) {
    const { error: updErr } = await db
      .from('crisis_contacts')
      .update({
        name: row.name,
        phone: row.phone,
        whatsapp_only: row.whatsapp_only,
      })
      .eq('id', row.id);
    if (updErr) throw failed('contact update', updErr);
  }

  const byIndex = new Map<number, string>();
  payload.contacts.forEach((contact, i) => {
    if (contact.id) byIndex.set(i, contact.id);
  });

  if (diff.toInsert.length > 0) {
    const { data: inserted, error: insErr } = await db
      .from('crisis_contacts')
      .insert(
        diff.toInsert.map((c) => ({
          recipient_id: recipientId,
          name: c.name,
          phone: c.phone,
          whatsapp_only: c.whatsappOnly ?? false,
        })),
      )
      .select('id, name');
    if (insErr) throw failed('contact insert', insErr);
    const idByName = new Map(
      ((inserted ?? []) as Array<{ id: string; name: string }>).map((r) => [
        r.name,
        r.id,
      ]),
    );
    payload.contacts.forEach((contact, i) => {
      if (!contact.id && idByName.has(contact.name)) {
        byIndex.set(i, idByName.get(contact.name)!);
      }
    });
  }
  return byIndex;
}

/** Row ids for every protocol in the payload, inserting the new ones. */
async function reconcileProtocols(
  db: CrisisEditorDb,
  recipientId: string,
  payload: CrisisPlanPayload,
): Promise<string[]> {
  const { data: existing, error } = await db
    .from('crisis_protocols')
    .select('id, slug')
    .eq('recipient_id', recipientId);
  if (error) throw failed('protocol read', error);

  const diff = diffProtocols(
    (existing ?? []) as ExistingProtocol[],
    payload.protocols,
  );
  if (diff.toDelete.length > 0) {
    // Steps cascade with their protocol, so no separate cleanup is needed.
    const { error: delErr } = await db
      .from('crisis_protocols')
      .delete()
      .in('id', diff.toDelete);
    if (delErr) throw failed('protocol delete', delErr);
  }

  const ids: string[] = [];
  for (const [i, protocol] of payload.protocols.entries()) {
    const row = protocolRow(recipientId, protocol, i);
    if (protocol.id) {
      const { error: updErr } = await db
        .from('crisis_protocols')
        .update(row)
        .eq('id', protocol.id);
      if (updErr) throw failed('protocol update', updErr);
      ids.push(protocol.id);
      continue;
    }
    const { data: inserted, error: insErr } = await db
      .from('crisis_protocols')
      .insert(row)
      .select('id')
      .single();
    if (insErr) throw failed('protocol insert', insErr);
    ids.push((inserted as { id: string }).id);
  }
  return ids;
}

async function rewriteSteps(
  db: CrisisEditorDb,
  protocolIds: string[],
  payload: CrisisPlanPayload,
  contactIds: Map<number, string>,
): Promise<void> {
  for (const [i, protocol] of payload.protocols.entries()) {
    const protocolId = protocolIds[i];
    const { error: delErr } = await db
      .from('crisis_protocol_steps')
      .delete()
      .eq('protocol_id', protocolId);
    if (delErr) throw failed('step clear', delErr);
    if (protocol.steps.length === 0) continue;

    const { error: insErr } = await db.from('crisis_protocol_steps').insert(
      protocol.steps.map((step, order) => ({
        protocol_id: protocolId,
        sort_order: order,
        step_text: step.text,
        contact_id:
          step.contactIndex === null
            ? null
            : (contactIds.get(step.contactIndex) ?? null),
        role_label: step.roleLabel,
        is_fallback: step.isFallback ?? false,
      })),
    );
    if (insErr) throw failed('step insert', insErr);
  }
}

/**
 * Replace the recipient's whole crisis plan. Contacts and protocols are matched
 * by id (so renames keep their references); every protocol's steps are rewritten
 * in payload order.
 */
export async function saveCrisisPlan(
  db: CrisisEditorDb,
  recipientId: string,
  payload: CrisisPlanPayload,
): Promise<void> {
  const contactIds = await reconcileContacts(db, recipientId, payload);
  const protocolIds = await reconcileProtocols(db, recipientId, payload);
  // Steps must be rewritten BEFORE stale contacts are deleted: the FK is
  // on-delete-restrict, so a contact still referenced cannot be removed — and
  // that is the desired failure, not a silent blanking of a call step.
  await rewriteSteps(db, protocolIds, payload, contactIds);

  const { data: remaining, error } = await db
    .from('crisis_contacts')
    .select('id')
    .eq('recipient_id', recipientId);
  if (error) throw failed('contact re-read', error);
  const keep = new Set(contactIds.values());
  const stale = ((remaining ?? []) as Array<{ id: string }>)
    .map((r) => r.id)
    .filter((id) => !keep.has(id));
  if (stale.length > 0) {
    const { error: delErr } = await db
      .from('crisis_contacts')
      .delete()
      .in('id', stale);
    if (delErr) throw failed('contact delete', delErr);
  }
}
