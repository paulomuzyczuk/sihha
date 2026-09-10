import { loadCrisisPlan } from '../../services/crisisPlan';
import { fakeAdminDb } from '../helpers/adminDbMock';

// loadCrisisPlan assembles the escalation plan someone reads mid-episode. The
// failure that matters is not a crash — it is a plan that renders looking
// complete while a step, a phone number or an ordering has quietly gone
// missing. These tests pin the assembly, not the content: no real name or
// number appears here.

const CONTACT_PRIMARY = {
  id: 'contact-1',
  name: 'Primary Contact',
  phone: '+55 11 95555-0001',
  whatsapp_only: true,
};
const CONTACT_FALLBACK = {
  id: 'contact-2',
  name: 'Fallback Contact',
  phone: '+55 11 95555-0002',
  whatsapp_only: false,
};

const PROTOCOL_CHAIN = {
  id: 'proto-1',
  slug: 'decision-chain',
  title: 'Quem decide',
  section_title: null,
  responsible: null,
  note: 'Informational only.',
  facility_name: null,
  facility_city: null,
  facility_transport: null,
  sort_order: 0,
};
const PROTOCOL_AGGRESSION = {
  id: 'proto-2',
  slug: 'aggression-mild',
  title: 'Agressividade leve',
  section_title: 'Protocolo de agressividade',
  responsible: 'Companions on duty',
  note: null,
  facility_name: null,
  facility_city: null,
  facility_transport: null,
  sort_order: 1,
};

const STEP_CONTACT = {
  protocol_id: 'proto-1',
  sort_order: 0,
  step_text: null,
  contact_id: 'contact-1',
  role_label: null,
  is_fallback: false,
};
const STEP_FALLBACK = {
  protocol_id: 'proto-1',
  sort_order: 1,
  step_text: null,
  contact_id: 'contact-2',
  role_label: null,
  is_fallback: true,
};
const STEP_TEXT = {
  protocol_id: 'proto-2',
  sort_order: 0,
  step_text: 'Separate and de-escalate',
  contact_id: null,
  role_label: null,
  is_fallback: false,
};
const STEP_ROLE_UNASSIGNED = {
  protocol_id: 'proto-2',
  sort_order: 1,
  step_text: null,
  contact_id: null,
  role_label: 'Neighbour',
  is_fallback: false,
};

function db(
  overrides: Record<string, { data?: unknown; error?: unknown }> = {},
) {
  return fakeAdminDb({
    crisis_contacts: { data: [CONTACT_PRIMARY, CONTACT_FALLBACK] },
    crisis_protocols: { data: [PROTOCOL_CHAIN, PROTOCOL_AGGRESSION] },
    crisis_protocol_steps: {
      data: [STEP_CONTACT, STEP_FALLBACK, STEP_TEXT, STEP_ROLE_UNASSIGNED],
    },
    ...overrides,
  });
}

describe('loadCrisisPlan — assembly', () => {
  it('exposes every contact, including any no step references', async () => {
    const plan = await loadCrisisPlan(db(), 'recipient-1');
    expect(plan.contacts.map((c) => c.name)).toEqual([
      'Primary Contact',
      'Fallback Contact',
    ]);
  });

  it('returns protocols in sort order', async () => {
    const plan = await loadCrisisPlan(db(), 'recipient-1');
    expect(plan.protocols.map((p) => p.slug)).toEqual([
      'decision-chain',
      'aggression-mild',
    ]);
  });

  it('attaches each step to its own protocol, in step order', async () => {
    const plan = await loadCrisisPlan(db(), 'recipient-1');
    const [chain, aggression] = plan.protocols;
    expect(chain.steps).toHaveLength(2);
    expect(aggression.steps).toHaveLength(2);
    expect(chain.steps[0].contact?.name).toBe('Primary Contact');
    expect(chain.steps[1].contact?.name).toBe('Fallback Contact');
  });

  it('resolves a step’s contact into the full contact, phone included', async () => {
    const plan = await loadCrisisPlan(db(), 'recipient-1');
    const step = plan.protocols[0].steps[0];
    expect(step.contact).toEqual({
      id: 'contact-1',
      name: 'Primary Contact',
      phone: '+55 11 95555-0001',
      whatsappOnly: true,
    });
  });

  it('carries the fallback flag through, so the chain keeps its order meaning', async () => {
    const plan = await loadCrisisPlan(db(), 'recipient-1');
    expect(plan.protocols[0].steps.map((s) => s.isFallback)).toEqual([
      false,
      true,
    ]);
  });

  it('keeps an unassigned role slot as a label with a null contact', async () => {
    // This is the "to be defined" state. Dropping it would hide a known gap in
    // the plan instead of showing it.
    const plan = await loadCrisisPlan(db(), 'recipient-1');
    const slot = plan.protocols[1].steps[1];
    expect(slot.roleLabel).toBe('Neighbour');
    expect(slot.contact).toBeNull();
  });

  it('maps the protocol’s optional fields, including the grouping title', async () => {
    const plan = await loadCrisisPlan(db(), 'recipient-1');
    expect(plan.protocols[0].note).toBe('Informational only.');
    expect(plan.protocols[0].sectionTitle).toBeNull();
    expect(plan.protocols[1].sectionTitle).toBe('Protocolo de agressividade');
    expect(plan.protocols[1].responsible).toBe('Companions on duty');
  });

  it('scopes every query to the requested recipient', async () => {
    const client = db();
    await loadCrisisPlan(client, 'recipient-1');
    expect(client.table('crisis_contacts').eq).toHaveBeenCalledWith(
      'recipient_id',
      'recipient-1',
    );
    expect(client.table('crisis_protocols').eq).toHaveBeenCalledWith(
      'recipient_id',
      'recipient-1',
    );
  });

  it('fetches steps only for the recipient’s own protocols', async () => {
    // Steps are keyed by protocol, not recipient — the scoping has to come
    // from the protocol id list or a step could leak across circles.
    const client = db();
    await loadCrisisPlan(client, 'recipient-1');
    expect(client.table('crisis_protocol_steps').in).toHaveBeenCalledWith(
      'protocol_id',
      ['proto-1', 'proto-2'],
    );
  });
});

describe('loadCrisisPlan — degenerate cases', () => {
  it('returns an empty plan when the recipient has no protocols', async () => {
    const plan = await loadCrisisPlan(
      db({ crisis_protocols: { data: [] } }),
      'recipient-1',
    );
    expect(plan.protocols).toEqual([]);
    expect(plan.contacts).toHaveLength(2);
  });

  it('does not query steps at all when there are no protocols', async () => {
    const client = db({ crisis_protocols: { data: [] } });
    await loadCrisisPlan(client, 'recipient-1');
    expect(client.table('crisis_protocol_steps').in).not.toHaveBeenCalled();
  });

  it('keeps a protocol that has no steps rather than dropping it', async () => {
    const plan = await loadCrisisPlan(
      db({ crisis_protocol_steps: { data: [STEP_CONTACT, STEP_FALLBACK] } }),
      'recipient-1',
    );
    expect(plan.protocols).toHaveLength(2);
    expect(plan.protocols[1].steps).toEqual([]);
  });

  it('drops a step whose contact_id does not resolve, rather than rendering a dead link', async () => {
    // A step pointing at a missing contact would otherwise render as a name-
    // less, number-less bullet — worse than absent in an escalation list.
    const plan = await loadCrisisPlan(
      db({
        crisis_protocol_steps: {
          data: [{ ...STEP_CONTACT, contact_id: 'contact-missing' }],
        },
      }),
      'recipient-1',
    );
    expect(plan.protocols[0].steps).toEqual([]);
  });

  it('throws with context when the protocols query fails', async () => {
    await expect(
      loadCrisisPlan(
        db({ crisis_protocols: { error: { message: 'boom' } } }),
        'recipient-1',
      ),
    ).rejects.toThrow(/crisis_protocols/);
  });

  it('throws with context when the contacts query fails', async () => {
    await expect(
      loadCrisisPlan(
        db({ crisis_contacts: { error: { message: 'boom' } } }),
        'recipient-1',
      ),
    ).rejects.toThrow(/crisis_contacts/);
  });
});
