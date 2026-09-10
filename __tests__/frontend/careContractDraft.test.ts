import {
  moveContractItem,
  toContractDraft,
  toContractPayload,
  todayIso,
} from '../../components/careContractDraft';
import { careContractPayloadSchema } from '../../services/careContractEditor';
import type { CareContractVersion } from '../../lib/careContract/types';

// Placeholder content throughout. The operations under test are the ones that
// can drop or reorder a clause in a document someone is held to.

const VERSION: CareContractVersion = {
  id: 'v1',
  versionNumber: 1,
  agreedOn: '2026-05-31',
  isCurrent: true,
  monthlyAllowance: 'R$000',
  sections: [
    {
      groupTitle: 'Group',
      title: 'A section',
      clauses: [{ text: 'First clause' }, { text: 'Second clause' }],
    },
    { groupTitle: null, title: 'Another section', clauses: [] },
  ],
  witnesses: ['Witness One'],
};

describe('todayIso', () => {
  it('formats a date as YYYY-MM-DD', () => {
    expect(todayIso(new Date('2026-08-24T15:00:00Z'))).toBe('2026-08-24');
  });
});

describe('toContractDraft', () => {
  it('seeds the form from the version in force', () => {
    const draft = toContractDraft(VERSION, '2026-08-24');
    expect(draft.sections[0].clauses).toEqual([
      'First clause',
      'Second clause',
    ]);
    expect(draft.witnesses).toEqual(['Witness One']);
    expect(draft.monthlyAllowance).toBe('R$000');
  });

  it('defaults the new version’s date to TODAY, not the old version’s', () => {
    // An amendment agreed today must not silently claim the date the original
    // was signed — that would falsify the version history.
    const draft = toContractDraft(VERSION, '2026-08-24');
    expect(draft.agreedOn).toBe('2026-08-24');
  });

  it('turns a null group title into an empty field, not the string "null"', () => {
    const draft = toContractDraft(VERSION, '2026-08-24');
    expect(draft.sections[1].groupTitle).toBe('');
  });

  it('starts blank when there is no agreement yet', () => {
    const draft = toContractDraft(null, '2026-08-24');
    expect(draft).toEqual({
      agreedOn: '2026-08-24',
      monthlyAllowance: '',
      sections: [],
      witnesses: [],
    });
  });
});

describe('moveContractItem', () => {
  it('reorders without losing an item', () => {
    expect(moveContractItem(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
  });

  it('is a no-op past either end, never a drop', () => {
    expect(moveContractItem(['a', 'b'], 0, -1)).toEqual(['a', 'b']);
    expect(moveContractItem(['a', 'b'], 1, 2)).toEqual(['a', 'b']);
  });
});

describe('toContractPayload', () => {
  const draft = toContractDraft(VERSION, '2026-08-24');

  it('produces a payload the write schema accepts', () => {
    expect(
      careContractPayloadSchema.safeParse(toContractPayload(draft)).success,
    ).toBe(true);
  });

  it('turns a blank group title into null rather than an empty string', () => {
    // The schema rejects empty strings on optional fields; sending "" would
    // fail the publish with an error the editor cannot point at.
    const payload = toContractPayload(draft);
    expect(payload.sections[1].groupTitle).toBeNull();
  });

  it('drops a blank clause row instead of failing the whole publish', () => {
    const withBlank = {
      ...draft,
      sections: [{ ...draft.sections[0], clauses: ['Real clause', '   ', ''] }],
    };
    const payload = toContractPayload(withBlank);
    expect(payload.sections[0].clauses).toEqual(['Real clause']);
  });

  it('drops a blank witness row', () => {
    const payload = toContractPayload({
      ...draft,
      witnesses: ['Someone', '  '],
    });
    expect(payload.witnesses).toEqual(['Someone']);
  });

  it('keeps clause order exactly as edited', () => {
    // Order is the reading order of an agreement; a silent reshuffle changes
    // what the document says.
    const payload = toContractPayload(draft);
    expect(payload.sections[0].clauses).toEqual([
      'First clause',
      'Second clause',
    ]);
  });
});
