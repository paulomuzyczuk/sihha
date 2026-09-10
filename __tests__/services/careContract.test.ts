import { loadCareContract } from '../../services/careContract';
import { fakeAdminDb } from '../helpers/adminDbMock';

// The agreement is versioned because parties ask "what did we agree to in May".
// What must hold: the version in force is unambiguous, a past version renders
// its own text rather than the current one, and no clause is lost or reordered.
// Placeholder content throughout.

const V2 = {
  id: 'v2',
  version_number: 2,
  agreed_on: '2026-06-01',
  monthly_allowance: 'R$000',
};
const V1 = {
  id: 'v1',
  version_number: 1,
  agreed_on: '2026-05-31',
  monthly_allowance: null,
};

const SECTION_A = { id: 's1', group_title: 'Group', title: 'First section' };
const SECTION_B = { id: 's2', group_title: null, title: 'Second section' };

function db(
  overrides: Record<string, { data?: unknown; error?: unknown }> = {},
) {
  return fakeAdminDb({
    // Ordered newest-first, as the query asks for.
    care_contract_versions: { data: [V2, V1] },
    care_contract_sections: { data: [SECTION_A, SECTION_B] },
    care_contract_clauses: {
      data: [
        { section_id: 's1', clause_text: 'Clause one' },
        { section_id: 's1', clause_text: 'Clause two' },
        { section_id: 's2', clause_text: 'Clause three' },
      ],
    },
    care_contract_witnesses: {
      data: [{ name: 'Witness One' }, { name: 'Witness Two' }],
    },
    ...overrides,
  });
}

describe('loadCareContract — version selection', () => {
  it('returns the highest version number as the one in force', async () => {
    const contract = await loadCareContract(db(), 'recipient-1');
    expect(contract.version!.versionNumber).toBe(2);
    expect(contract.version!.isCurrent).toBe(true);
  });

  it('lists every version, newest first, for the picker', async () => {
    const contract = await loadCareContract(db(), 'recipient-1');
    expect(contract.versions.map((v) => v.versionNumber)).toEqual([2, 1]);
  });

  it('marks exactly one version as current', async () => {
    // Two "current" agreements is the one thing a version history must never
    // show — which is why current is derived from max(), not a stored flag.
    const contract = await loadCareContract(db(), 'recipient-1');
    expect(contract.versions.filter((v) => v.isCurrent)).toHaveLength(1);
    expect(contract.versions.find((v) => v.isCurrent)!.id).toBe('v2');
  });

  it('returns a requested past version, flagged as not current', async () => {
    const contract = await loadCareContract(db(), 'recipient-1', 'v1');
    expect(contract.version!.id).toBe('v1');
    expect(contract.version!.isCurrent).toBe(false);
    expect(contract.version!.versionNumber).toBe(1);
  });

  it('falls back to the version in force for an unknown id', async () => {
    // A stale link to a deleted version should still show the live agreement
    // rather than an error page.
    const contract = await loadCareContract(db(), 'recipient-1', 'nope');
    expect(contract.version!.id).toBe('v2');
  });

  it('scopes the version query to the recipient', async () => {
    const client = db();
    await loadCareContract(client, 'recipient-1');
    expect(client.table('care_contract_versions').eq).toHaveBeenCalledWith(
      'recipient_id',
      'recipient-1',
    );
  });
});

describe('loadCareContract — content', () => {
  it('keeps sections in order and attaches each clause to its own section', async () => {
    const contract = await loadCareContract(db(), 'recipient-1');
    const [first, second] = contract.version!.sections;
    expect(first.title).toBe('First section');
    expect(first.clauses.map((c) => c.text)).toEqual([
      'Clause one',
      'Clause two',
    ]);
    expect(second.clauses.map((c) => c.text)).toEqual(['Clause three']);
  });

  it('carries the grouping title so the card layout survives', async () => {
    const contract = await loadCareContract(db(), 'recipient-1');
    expect(contract.version!.sections[0].groupTitle).toBe('Group');
    expect(contract.version!.sections[1].groupTitle).toBeNull();
  });

  it('returns witnesses in order', async () => {
    const contract = await loadCareContract(db(), 'recipient-1');
    expect(contract.version!.witnesses).toEqual(['Witness One', 'Witness Two']);
  });

  it('carries a null allowance through rather than inventing one', async () => {
    const contract = await loadCareContract(db(), 'recipient-1', 'v1');
    expect(contract.version!.monthlyAllowance).toBeNull();
  });
});

describe('loadCareContract — degenerate cases', () => {
  it('returns an empty contract when the recipient has none', async () => {
    const contract = await loadCareContract(
      db({ care_contract_versions: { data: [] } }),
      'recipient-1',
    );
    expect(contract).toEqual({ version: null, versions: [] });
  });

  it('does not query sections when there is no version', async () => {
    const client = db({ care_contract_versions: { data: [] } });
    await loadCareContract(client, 'recipient-1');
    expect(client.table('care_contract_sections').eq).not.toHaveBeenCalled();
  });

  it('keeps a section with no clauses rather than dropping it', async () => {
    const contract = await loadCareContract(
      db({ care_contract_clauses: { data: [] } }),
      'recipient-1',
    );
    expect(contract.version!.sections).toHaveLength(2);
    expect(contract.version!.sections[0].clauses).toEqual([]);
  });

  it('throws with context when the version query fails', async () => {
    await expect(
      loadCareContract(
        db({ care_contract_versions: { error: { message: 'boom' } } }),
        'recipient-1',
      ),
    ).rejects.toThrow(/care_contract_versions/);
  });

  it('throws with context when the clause query fails', async () => {
    await expect(
      loadCareContract(
        db({ care_contract_clauses: { error: { message: 'boom' } } }),
        'recipient-1',
      ),
    ).rejects.toThrow(/care_contract_clauses/);
  });
});
