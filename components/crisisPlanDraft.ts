// The editor's working copy of a crisis plan, and the pure operations on it.
//
// Split from the component so the manipulations that can silently corrupt a
// plan — reordering, deleting a contact out from under a step — are plain
// functions with tests, not behaviour buried in event handlers.
//
// Steps reference contacts by INDEX into the draft's contact list, matching the
// PUT payload. Index rather than id because a contact may not have an id yet
// (just added); keeping one representation avoids a second mapping step where
// a mistake would point a call step at the wrong person.

import type { CrisisPlan } from '../lib/crisisPlan/types';

export interface DraftContact {
  id?: string;
  name: string;
  phone: string;
  whatsappOnly: boolean;
}

export interface DraftStep {
  text: string | null;
  contactIndex: number | null;
  roleLabel: string | null;
  isFallback: boolean;
}

export interface DraftProtocol {
  id?: string;
  slug: string;
  title: string;
  sectionTitle: string | null;
  responsible: string | null;
  note: string | null;
  facilityName: string | null;
  facilityCity: string | null;
  facilityTransport: string | null;
  steps: DraftStep[];
}

export interface CrisisPlanDraft {
  contacts: DraftContact[];
  protocols: DraftProtocol[];
}

/** The saved plan as an editable draft, resolving contact refs to indices. */
export function toDraft(plan: CrisisPlan): CrisisPlanDraft {
  const contacts: DraftContact[] = plan.contacts.map((c) => ({
    id: c.id,
    name: c.name,
    phone: c.phone,
    whatsappOnly: c.whatsappOnly,
  }));
  const indexById = new Map(contacts.map((c, i) => [c.id, i]));
  return {
    contacts,
    protocols: plan.protocols.map((p) => ({
      id: p.id,
      slug: p.slug,
      title: p.title,
      sectionTitle: p.sectionTitle,
      responsible: p.responsible,
      note: p.note,
      facilityName: p.facilityName,
      facilityCity: p.facilityCity,
      facilityTransport: p.facilityTransport,
      steps: p.steps.map((s) => ({
        text: s.text,
        contactIndex: s.contact ? (indexById.get(s.contact.id) ?? null) : null,
        roleLabel: s.roleLabel,
        isFallback: s.isFallback,
      })),
    })),
  };
}

export function emptyContact(): DraftContact {
  return { name: '', phone: '', whatsappOnly: false };
}

export function emptyStep(): DraftStep {
  return { text: '', contactIndex: null, roleLabel: null, isFallback: false };
}

export function emptyProtocol(): DraftProtocol {
  return {
    slug: '',
    title: '',
    sectionTitle: null,
    responsible: null,
    note: null,
    facilityName: null,
    facilityCity: null,
    facilityTransport: null,
    steps: [],
  };
}

/** Move an item within a list; out-of-range moves are a no-op, never a drop. */
export function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (to < 0 || to >= items.length || from < 0 || from >= items.length) {
    return items;
  }
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/** Every step across the plan that points at the contact at `index`. */
export function stepsUsingContact(
  draft: CrisisPlanDraft,
  index: number,
): number {
  return draft.protocols.reduce(
    (total, protocol) =>
      total + protocol.steps.filter((s) => s.contactIndex === index).length,
    0,
  );
}

/**
 * Remove a contact and repoint every step that referenced a LATER contact, so
 * the surviving references still name the same people. Returns the draft
 * unchanged when a step still uses the contact — refusing beats silently
 * blanking a call step, which is the same reason the FK is on-delete-restrict.
 */
export function removeContact(
  draft: CrisisPlanDraft,
  index: number,
): { draft: CrisisPlanDraft; removed: boolean } {
  if (stepsUsingContact(draft, index) > 0) return { draft, removed: false };
  return {
    removed: true,
    draft: {
      contacts: draft.contacts.filter((_, i) => i !== index),
      protocols: draft.protocols.map((protocol) => ({
        ...protocol,
        steps: protocol.steps.map((step) => ({
          ...step,
          contactIndex:
            step.contactIndex !== null && step.contactIndex > index
              ? step.contactIndex - 1
              : step.contactIndex,
        })),
      })),
    },
  };
}

/** The PUT payload: blank optional strings become null, as the schema wants. */
export function toPayload(draft: CrisisPlanDraft) {
  const trimmed = (v: string | null) => {
    const t = (v ?? '').trim();
    return t.length > 0 ? t : null;
  };
  return {
    contacts: draft.contacts.map((c) => ({
      ...(c.id ? { id: c.id } : {}),
      name: c.name.trim(),
      phone: c.phone.trim(),
      whatsappOnly: c.whatsappOnly,
    })),
    protocols: draft.protocols.map((p) => ({
      ...(p.id ? { id: p.id } : {}),
      slug: p.slug.trim(),
      title: p.title.trim(),
      sectionTitle: trimmed(p.sectionTitle),
      responsible: trimmed(p.responsible),
      note: trimmed(p.note),
      facilityName: trimmed(p.facilityName),
      facilityCity: trimmed(p.facilityCity),
      facilityTransport: trimmed(p.facilityTransport),
      steps: p.steps.map((s) => ({
        text: trimmed(s.text),
        contactIndex: s.contactIndex,
        roleLabel: trimmed(s.roleLabel),
        isFallback: s.isFallback,
      })),
    })),
  };
}
