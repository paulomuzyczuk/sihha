// Shapes for the crisis plan — the who-does-what a care team agrees on for a
// psychotic episode. Types only, never content: the plan itself is
// recipient-specific DATA held in recipient-scoped tables, so nothing here
// names a person or a place.

export interface CrisisPlanContact {
  id: string;
  name: string;
  // Display format, rendered verbatim — the view links nothing (see
  // CrisisPlanView's header for why).
  phone: string;
  // Not a link switch any more: it drives the "reach via WhatsApp only" note,
  // which tells the reader to message rather than call.
  whatsappOnly: boolean;
}

export interface CrisisPlanStep {
  // Null for a step that is purely a contact reference (a call-order entry).
  text: string | null;
  contact: CrisisPlanContact | null;
  // A role with no person assigned yet; roleLabel set with a null contact is
  // the "to be defined" state, and must render as such rather than vanish.
  roleLabel: string | null;
  // Marks the backup in an ordered chain (the second decider).
  isFallback: boolean;
}

export interface CrisisPlanProtocol {
  // Row id, carried so the editor can match an edit to an existing protocol
  // instead of deleting and recreating it (which would scramble ordering).
  id: string;
  slug: string;
  title: string;
  // Protocols sharing a sectionTitle render under one heading; null stands
  // alone. Grouping is data so the view hardcodes no section names.
  sectionTitle: string | null;
  responsible: string | null;
  note: string | null;
  facilityName: string | null;
  facilityCity: string | null;
  // Null renders as the localised "to be defined" placeholder, not as blank.
  facilityTransport: string | null;
  steps: CrisisPlanStep[];
}

export interface CrisisPlan {
  protocols: CrisisPlanProtocol[];
  // Every contact defined for the recipient, including any not yet referenced
  // by a step. The read view ignores this; the editor needs it to manage the
  // contact list as its own thing.
  contacts: CrisisPlanContact[];
}
