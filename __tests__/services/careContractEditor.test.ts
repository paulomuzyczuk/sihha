import {
  careContractPayloadSchema,
  nextVersionNumber,
  saveCareContractVersion,
} from '../../services/careContractEditor';

// A save must ADD to the history, never overwrite it: the parties signed a
// specific text on a specific date, and rewriting it in place erases what they
// actually agreed to. These tests pin that, and the numbering it depends on.

const VALID = {
  agreedOn: '2026-05-31',
  monthlyAllowance: 'R$000',
  sections: [
    {
      groupTitle: 'Group',
      title: 'A section',
      clauses: ['First clause', 'Second clause'],
    },
  ],
  witnesses: ['Witness One'],
};

describe('careContractPayloadSchema', () => {
  it('accepts a well-formed agreement', () => {
    expect(careContractPayloadSchema.safeParse(VALID).success).toBe(true);
  });

  it('accepts an agreement with no allowance and no witnesses', () => {
    const parsed = careContractPayloadSchema.safeParse({
      agreedOn: '2026-05-31',
      monthlyAllowance: null,
      sections: [],
      witnesses: [],
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects a date that is not YYYY-MM-DD', () => {
    // agreedOn is the legal date of the agreement; a free-text date would make
    // the version history unsortable and ambiguous.
    expect(
      careContractPayloadSchema.safeParse({ ...VALID, agreedOn: '31/05/2026' })
        .success,
    ).toBe(false);
  });

  it('rejects a blank clause', () => {
    expect(
      careContractPayloadSchema.safeParse({
        ...VALID,
        sections: [{ groupTitle: null, title: 'X', clauses: ['   '] }],
      }).success,
    ).toBe(false);
  });

  it('rejects a section with no title', () => {
    expect(
      careContractPayloadSchema.safeParse({
        ...VALID,
        sections: [{ groupTitle: null, title: '', clauses: [] }],
      }).success,
    ).toBe(false);
  });

  it('rejects a blank witness name', () => {
    expect(
      careContractPayloadSchema.safeParse({ ...VALID, witnesses: ['  '] })
        .success,
    ).toBe(false);
  });
});

describe('nextVersionNumber', () => {
  it('starts at 1 for a recipient with no agreement yet', () => {
    expect(nextVersionNumber([])).toBe(1);
  });

  it('is one past the highest existing version', () => {
    expect(
      nextVersionNumber([{ version_number: 1 }, { version_number: 2 }]),
    ).toBe(3);
  });

  it('ignores ordering — it takes the max, not the last row', () => {
    // The read is not guaranteed to come back sorted; taking the last row would
    // silently reuse a number and collide with the unique key.
    expect(
      nextVersionNumber([{ version_number: 5 }, { version_number: 2 }]),
    ).toBe(6);
  });
});

// Recording fake: keeps the call order and the rows written, so the test can
// assert that the save INSERTS and never updates or deletes.
function recordingDb(existingVersions: Array<{ version_number: number }> = []) {
  const calls: string[] = [];
  const inserted: Record<string, unknown[]> = {};
  let nextId = 1;
  const from = (table: string) => {
    const chainable = ['eq', 'in', 'order', 'not', 'is', 'neq'];
    const api: Record<string, unknown> = {};
    for (const m of chainable) api[m] = () => api;
    api.select = () => {
      const p: Record<string, unknown> = {
        then: (fn: (v: unknown) => unknown) =>
          Promise.resolve({
            data: table === 'care_contract_versions' ? existingVersions : [],
            error: null,
          }).then(fn),
        single: () => Promise.resolve({ data: null, error: null }),
      };
      for (const m of chainable) p[m] = () => p;
      return p;
    };
    api.insert = (payload: unknown) => {
      calls.push(`insert:${table}`);
      const list = Array.isArray(payload) ? payload : [payload];
      inserted[table] = [...(inserted[table] ?? []), ...list];
      const made = list.map((r) => ({
        ...(r as object),
        id: `id-${nextId++}`,
      }));
      return {
        select: () => ({
          single: () => Promise.resolve({ data: made[0], error: null }),
          then: (fn: (v: unknown) => unknown) =>
            Promise.resolve({ data: made, error: null }).then(fn),
        }),
        then: (fn: (v: unknown) => unknown) =>
          Promise.resolve({ data: made, error: null }).then(fn),
      };
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
  return { from, calls, inserted };
}

describe('saveCareContractVersion', () => {
  it('NEVER updates or deletes — the history is append-only', () => {
    const db = recordingDb([{ version_number: 1 }]);
    return saveCareContractVersion(db, 'recipient-1', VALID).then(() => {
      expect(db.calls.some((c) => c.startsWith('update:'))).toBe(false);
      expect(db.calls.some((c) => c.startsWith('delete:'))).toBe(false);
    });
  });

  it('writes the next version number, leaving the earlier one alone', async () => {
    const db = recordingDb([{ version_number: 1 }, { version_number: 2 }]);
    await saveCareContractVersion(db, 'recipient-1', VALID);
    const version = db.inserted['care_contract_versions'][0] as {
      version_number: number;
      recipient_id: string;
    };
    expect(version.version_number).toBe(3);
    expect(version.recipient_id).toBe('recipient-1');
  });

  it('numbers a first agreement as version 1', async () => {
    const db = recordingDb([]);
    await saveCareContractVersion(db, 'recipient-1', VALID);
    expect(
      (db.inserted['care_contract_versions'][0] as { version_number: number })
        .version_number,
    ).toBe(1);
  });

  it('writes clauses in payload order, so the agreement reads as written', async () => {
    const db = recordingDb([]);
    await saveCareContractVersion(db, 'recipient-1', VALID);
    const clauses = db.inserted['care_contract_clauses'] as Array<{
      sort_order: number;
      clause_text: string;
    }>;
    expect(clauses.map((c) => c.sort_order)).toEqual([0, 1]);
    expect(clauses.map((c) => c.clause_text)).toEqual([
      'First clause',
      'Second clause',
    ]);
  });

  it('writes witnesses in order', async () => {
    const db = recordingDb([]);
    await saveCareContractVersion(db, 'recipient-1', VALID);
    const witnesses = db.inserted['care_contract_witnesses'] as Array<{
      sort_order: number;
    }>;
    expect(witnesses.map((w) => w.sort_order)).toEqual([0]);
  });

  it('writes no witness rows when there are none', async () => {
    const db = recordingDb([]);
    await saveCareContractVersion(db, 'recipient-1', {
      ...VALID,
      witnesses: [],
    });
    expect(db.calls).not.toContain('insert:care_contract_witnesses');
  });
});
