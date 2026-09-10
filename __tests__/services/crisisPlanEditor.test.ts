import {
  crisisPlanPayloadSchema,
  diffContacts,
  diffProtocols,
  saveCrisisPlan,
} from '../../services/crisisPlanEditor';

// Editing a crisis plan is the one write path into a document people act on
// mid-episode. The dangerous outcomes are not exceptions: a step silently
// dropped, a contact deleted while a step still calls them, an ordering
// scrambled. These tests pin those, and the ORDER the writes happen in.

const VALID = {
  contacts: [
    { name: 'Primary Contact', phone: '+55 11 95555-0001', whatsappOnly: true },
    { name: 'Second Contact', phone: '+55 11 95555-0002', whatsappOnly: false },
  ],
  protocols: [
    {
      slug: 'decision-chain',
      title: 'Quem decide',
      sectionTitle: null,
      responsible: null,
      note: null,
      facilityName: null,
      facilityCity: null,
      facilityTransport: null,
      steps: [
        { text: null, contactIndex: 0, roleLabel: null, isFallback: false },
        { text: null, contactIndex: 1, roleLabel: null, isFallback: true },
      ],
    },
  ],
};

describe('crisisPlanPayloadSchema', () => {
  it('accepts a well-formed plan', () => {
    expect(crisisPlanPayloadSchema.safeParse(VALID).success).toBe(true);
  });

  it('accepts an empty plan — clearing it is a legitimate edit', () => {
    const parsed = crisisPlanPayloadSchema.safeParse({
      contacts: [],
      protocols: [],
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects a step carrying nothing at all', () => {
    // Mirrors crisis_protocol_steps_not_empty. Rejecting at the boundary beats
    // a 500 from a constraint violation.
    const bad = {
      ...VALID,
      protocols: [
        {
          ...VALID.protocols[0],
          steps: [
            {
              text: null,
              contactIndex: null,
              roleLabel: null,
              isFallback: false,
            },
          ],
        },
      ],
    };
    expect(crisisPlanPayloadSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects a step pointing past the end of the contact list', () => {
    // A dangling reference would render as a step with no one to call.
    const bad = {
      ...VALID,
      protocols: [
        {
          ...VALID.protocols[0],
          steps: [
            { text: null, contactIndex: 9, roleLabel: null, isFallback: false },
          ],
        },
      ],
    };
    expect(crisisPlanPayloadSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects two protocols sharing a slug', () => {
    const bad = {
      ...VALID,
      protocols: [VALID.protocols[0], { ...VALID.protocols[0] }],
    };
    expect(crisisPlanPayloadSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects two contacts sharing a name — the DB unique key', () => {
    const bad = {
      ...VALID,
      contacts: [VALID.contacts[0], { ...VALID.contacts[0] }],
    };
    expect(crisisPlanPayloadSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects a blank name and a blank phone', () => {
    expect(
      crisisPlanPayloadSchema.safeParse({
        ...VALID,
        contacts: [{ name: '  ', phone: '+55 11 95555-0001' }],
      }).success,
    ).toBe(false);
    expect(
      crisisPlanPayloadSchema.safeParse({
        ...VALID,
        contacts: [{ name: 'Someone', phone: '' }],
      }).success,
    ).toBe(false);
  });

  it('rejects a phone with too few digits to dial', () => {
    // The number is transcribed by hand off the screen; a truncated one is
    // useless exactly when it is needed.
    expect(
      crisisPlanPayloadSchema.safeParse({
        ...VALID,
        contacts: [{ name: 'Someone', phone: '123' }],
      }).success,
    ).toBe(false);
  });
});

describe('diffContacts', () => {
  const existing = [
    {
      id: 'c1',
      name: 'Keep',
      phone: '+55 11 95555-0001',
      whatsapp_only: false,
    },
    {
      id: 'c2',
      name: 'Drop',
      phone: '+55 11 95555-0002',
      whatsapp_only: false,
    },
  ];

  it('inserts a contact with no matching row', () => {
    const d = diffContacts(existing, [
      { name: 'New', phone: '+55 11 95555-0003', whatsappOnly: false },
    ]);
    expect(d.toInsert.map((c) => c.name)).toEqual(['New']);
  });

  it('updates a contact matched by id, so its steps keep pointing at it', () => {
    const d = diffContacts(existing, [
      {
        id: 'c1',
        name: 'Renamed',
        phone: '+55 11 95555-0009',
        whatsappOnly: true,
      },
    ]);
    expect(d.toUpdate).toEqual([
      {
        id: 'c1',
        name: 'Renamed',
        phone: '+55 11 95555-0009',
        whatsapp_only: true,
      },
    ]);
  });

  it('deletes rows the payload no longer mentions', () => {
    const d = diffContacts(existing, [
      {
        id: 'c1',
        name: 'Keep',
        phone: '+55 11 95555-0001',
        whatsappOnly: false,
      },
    ]);
    expect(d.toDelete).toEqual(['c2']);
  });
});

describe('diffProtocols', () => {
  const existing = [
    { id: 'p1', slug: 'keep' },
    { id: 'p2', slug: 'drop' },
  ];

  it('deletes protocols absent from the payload', () => {
    const d = diffProtocols(existing, [{ id: 'p1', slug: 'keep' }]);
    expect(d.toDelete).toEqual(['p2']);
  });

  it('treats a payload entry with no id as a new protocol', () => {
    const d = diffProtocols(existing, [{ slug: 'brand-new' }]);
    expect(d.toInsert.map((p) => p.slug)).toEqual(['brand-new']);
  });
});

// A recording fake: enough of the client to run the reconcile, and it keeps the
// call order so the write SEQUENCE can be asserted, not just the end state.
function recordingDb(existing: {
  contacts?: unknown[];
  protocols?: unknown[];
}) {
  const calls: string[] = [];
  const rows: Record<string, unknown[]> = {
    crisis_contacts: existing.contacts ?? [],
    crisis_protocols: existing.protocols ?? [],
  };
  let nextId = 100;
  const from = (table: string) => {
    const api: Record<string, unknown> = {};
    const chainable = ['eq', 'in', 'order', 'not', 'is', 'neq'];
    for (const m of chainable) api[m] = () => api;
    api.select = () => {
      const p: Record<string, unknown> = {
        then: (fn: (v: unknown) => unknown) =>
          Promise.resolve({ data: rows[table] ?? [], error: null }).then(fn),
        single: () =>
          Promise.resolve({ data: (rows[table] ?? [])[0], error: null }),
      };
      for (const m of chainable) p[m] = () => p;
      return p;
    };
    api.insert = (payload: unknown) => {
      calls.push(`insert:${table}`);
      const list = Array.isArray(payload) ? payload : [payload];
      const made = list.map((r) => ({
        ...(r as object),
        id: `gen-${nextId++}`,
      }));
      const res = {
        select: () => ({
          then: (fn: (v: unknown) => unknown) =>
            Promise.resolve({ data: made, error: null }).then(fn),
          single: () => Promise.resolve({ data: made[0], error: null }),
        }),
        then: (fn: (v: unknown) => unknown) =>
          Promise.resolve({ data: made, error: null }).then(fn),
      };
      return res;
    };
    api.update = () => {
      calls.push(`update:${table}`);
      const p: Record<string, unknown> = {
        then: (fn: (v: unknown) => unknown) =>
          Promise.resolve({ data: null, error: null }).then(fn),
      };
      for (const m of chainable) p[m] = () => p;
      return p;
    };
    api.delete = () => {
      calls.push(`delete:${table}`);
      const p: Record<string, unknown> = {
        then: (fn: (v: unknown) => unknown) =>
          Promise.resolve({ data: null, error: null }).then(fn),
      };
      for (const m of chainable) p[m] = () => p;
      return p;
    };
    return api;
  };
  return { from, calls };
}

describe('saveCrisisPlan — write sequence', () => {
  it('rewrites steps BEFORE deleting contacts', async () => {
    // The tables use on-delete-restrict. Deleting a contact while a step still
    // references it fails; worse, doing it the other way round with a cascade
    // would silently blank a call step. Order is the safety property here.
    const db = recordingDb({
      contacts: [
        {
          id: 'c-old',
          name: 'Gone',
          phone: '+55 11 95555-0000',
          whatsapp_only: false,
        },
      ],
      protocols: [{ id: 'p-old', slug: 'decision-chain', sort_order: 0 }],
    });
    await saveCrisisPlan(db, 'recipient-1', {
      contacts: [
        { name: 'Fresh', phone: '+55 11 95555-0007', whatsappOnly: false },
      ],
      protocols: [
        {
          slug: 'new-chain',
          title: 'Novo',
          sectionTitle: null,
          responsible: null,
          note: null,
          facilityName: null,
          facilityCity: null,
          facilityTransport: null,
          steps: [
            { text: null, contactIndex: 0, roleLabel: null, isFallback: false },
          ],
        },
      ],
    });
    const stepInsert = db.calls.indexOf('insert:crisis_protocol_steps');
    const contactDelete = db.calls.lastIndexOf('delete:crisis_contacts');
    expect(stepInsert).toBeGreaterThanOrEqual(0);
    expect(contactDelete).toBeGreaterThan(stepInsert);
  });

  it('clears a protocol’s steps before writing the new ones', async () => {
    // Steps are replaced wholesale rather than patched — that is what makes
    // reordering and deletion trivially correct.
    const db = recordingDb({
      protocols: [{ id: 'p1', slug: 'decision-chain', sort_order: 0 }],
    });
    await saveCrisisPlan(db, 'recipient-1', {
      contacts: [],
      protocols: [
        {
          id: 'p1',
          slug: 'decision-chain',
          title: 'Quem decide',
          sectionTitle: null,
          responsible: null,
          note: null,
          facilityName: null,
          facilityCity: null,
          facilityTransport: null,
          steps: [
            {
              text: 'Do the thing',
              contactIndex: null,
              roleLabel: null,
              isFallback: false,
            },
          ],
        },
      ],
    });
    expect(db.calls.indexOf('delete:crisis_protocol_steps')).toBeLessThan(
      db.calls.indexOf('insert:crisis_protocol_steps'),
    );
  });

  it('accepts an empty plan and deletes what was there', async () => {
    const db = recordingDb({
      contacts: [
        {
          id: 'c1',
          name: 'Gone',
          phone: '+55 11 95555-0000',
          whatsapp_only: false,
        },
      ],
      protocols: [{ id: 'p1', slug: 'gone', sort_order: 0 }],
    });
    await saveCrisisPlan(db, 'recipient-1', { contacts: [], protocols: [] });
    expect(db.calls).toContain('delete:crisis_protocols');
    expect(db.calls).toContain('delete:crisis_contacts');
  });
});
