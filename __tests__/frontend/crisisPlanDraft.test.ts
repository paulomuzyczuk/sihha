import {
  moveItem,
  removeContact,
  stepsUsingContact,
  toDraft,
  toPayload,
  type CrisisPlanDraft,
} from '../../components/crisisPlanDraft';
import type { CrisisPlan } from '../../lib/crisisPlan/types';

// The editor's manipulations, tested as pure functions. These are the
// operations that can corrupt a plan without raising anything: a reorder that
// drops a step, a contact deletion that repoints a call step at the wrong
// person. Placeholder data throughout.

const PLAN: CrisisPlan = {
  contacts: [
    { id: 'c1', name: 'First', phone: '+55 11 95555-0001', whatsappOnly: true },
    {
      id: 'c2',
      name: 'Second',
      phone: '+55 11 95555-0002',
      whatsappOnly: false,
    },
    {
      id: 'c3',
      name: 'Third',
      phone: '+55 11 95555-0003',
      whatsappOnly: false,
    },
  ],
  protocols: [
    {
      id: 'p1',
      slug: 'chain',
      title: 'Chain',
      sectionTitle: null,
      responsible: null,
      note: null,
      facilityName: null,
      facilityCity: null,
      facilityTransport: null,
      steps: [
        {
          text: null,
          contact: {
            id: 'c1',
            name: 'First',
            phone: '+55 11 95555-0001',
            whatsappOnly: true,
          },
          roleLabel: null,
          isFallback: false,
        },
        {
          text: null,
          contact: {
            id: 'c3',
            name: 'Third',
            phone: '+55 11 95555-0003',
            whatsappOnly: false,
          },
          roleLabel: null,
          isFallback: true,
        },
      ],
    },
  ],
};

describe('toDraft', () => {
  it('resolves each step’s contact to its index in the contact list', () => {
    const draft = toDraft(PLAN);
    expect(draft.protocols[0].steps.map((s) => s.contactIndex)).toEqual([0, 2]);
  });

  it('keeps row ids so a save matches rather than recreates', () => {
    const draft = toDraft(PLAN);
    expect(draft.contacts.map((c) => c.id)).toEqual(['c1', 'c2', 'c3']);
    expect(draft.protocols[0].id).toBe('p1');
  });
});

describe('moveItem', () => {
  it('moves an item down without losing any', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c']);
  });

  it('moves an item up without losing any', () => {
    expect(moveItem(['a', 'b', 'c'], 2, 1)).toEqual(['a', 'c', 'b']);
  });

  it('is a no-op past either end, never a drop', () => {
    // The reorder buttons sit at the ends of a list; an off-by-one there must
    // not silently delete a step from an escalation sequence.
    expect(moveItem(['a', 'b'], 0, -1)).toEqual(['a', 'b']);
    expect(moveItem(['a', 'b'], 1, 2)).toEqual(['a', 'b']);
  });
});

describe('removeContact', () => {
  it('refuses while a step still calls that contact', () => {
    const draft = toDraft(PLAN);
    const result = removeContact(draft, 0);
    expect(result.removed).toBe(false);
    expect(result.draft.contacts).toHaveLength(3);
  });

  it('removes an unreferenced contact', () => {
    const draft = toDraft(PLAN);
    const result = removeContact(draft, 1);
    expect(result.removed).toBe(true);
    expect(result.draft.contacts.map((c) => c.name)).toEqual([
      'First',
      'Third',
    ]);
  });

  it('repoints later references so steps keep naming the same people', () => {
    // The bug this exists to prevent: delete contact #1 and the step that
    // pointed at #2 now points at whoever shifted into that slot.
    const draft = toDraft(PLAN);
    const result = removeContact(draft, 1);
    const step = result.draft.protocols[0].steps[1];
    expect(step.contactIndex).toBe(1);
    expect(result.draft.contacts[step.contactIndex!].name).toBe('Third');
  });
});

describe('stepsUsingContact', () => {
  it('counts references across every protocol', () => {
    expect(stepsUsingContact(toDraft(PLAN), 0)).toBe(1);
    expect(stepsUsingContact(toDraft(PLAN), 1)).toBe(0);
  });
});

describe('toPayload', () => {
  const draft: CrisisPlanDraft = {
    contacts: [
      { name: '  Spaced  ', phone: ' +55 11 95555-0001 ', whatsappOnly: false },
    ],
    protocols: [
      {
        slug: ' chain ',
        title: ' Chain ',
        sectionTitle: '   ',
        responsible: null,
        note: '',
        facilityName: null,
        facilityCity: null,
        facilityTransport: null,
        steps: [
          {
            text: '  Do it  ',
            contactIndex: 0,
            roleLabel: '',
            isFallback: false,
          },
        ],
      },
    ],
  };

  it('trims names, phones and titles', () => {
    const payload = toPayload(draft);
    expect(payload.contacts[0].name).toBe('Spaced');
    expect(payload.contacts[0].phone).toBe('+55 11 95555-0001');
    expect(payload.protocols[0].title).toBe('Chain');
  });

  it('turns blank optional fields into null, not empty strings', () => {
    // The schema rejects empty strings on optional fields; sending "" would
    // fail the save with a validation error the user cannot see the cause of.
    const payload = toPayload(draft);
    expect(payload.protocols[0].sectionTitle).toBeNull();
    expect(payload.protocols[0].note).toBeNull();
    expect(payload.protocols[0].steps[0].roleLabel).toBeNull();
  });

  it('omits the id key entirely for a newly added row', () => {
    const payload = toPayload(draft);
    expect('id' in payload.contacts[0]).toBe(false);
    expect('id' in payload.protocols[0]).toBe(false);
  });
});
