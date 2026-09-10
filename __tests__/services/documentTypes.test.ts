import {
  listDocumentTypes,
  updateDocumentType,
  DOCUMENT_TYPE_KEYS,
} from '../../services/documentTypes';
import { chain } from '../helpers/careTeamMock';

const INSTITUTION_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

describe('listDocumentTypes', () => {
  it('returns the stored rows as-is when all three keys are present', async () => {
    const rows = [
      { doc_key: 'invoice', active: false, copy: { pt: { label: 'Nota' } } },
      { doc_key: 'prescription', active: true, copy: {} },
      { doc_key: 'evaluation', active: true, copy: {} },
    ];
    const adminDb = { from: () => chain({ data: rows }) } as never;
    const result = await listDocumentTypes(adminDb, INSTITUTION_ID);
    expect(result).toEqual([
      { docKey: 'invoice', active: false, copy: { pt: { label: 'Nota' } } },
      { docKey: 'prescription', active: true, copy: {} },
      { docKey: 'evaluation', active: true, copy: {} },
    ]);
  });

  it('defaults every key to active with no copy override for a fresh institution', async () => {
    const adminDb = { from: () => chain({ data: [] }) } as never;
    const result = await listDocumentTypes(adminDb, INSTITUTION_ID);
    expect(result).toEqual(
      DOCUMENT_TYPE_KEYS.map((docKey) => ({ docKey, active: true, copy: {} })),
    );
  });

  it('fills in defaults only for keys missing a row', async () => {
    const adminDb = {
      from: () =>
        chain({ data: [{ doc_key: 'invoice', active: false, copy: {} }] }),
    } as never;
    const result = await listDocumentTypes(adminDb, INSTITUTION_ID);
    expect(result).toEqual([
      { docKey: 'invoice', active: false, copy: {} },
      { docKey: 'prescription', active: true, copy: {} },
      { docKey: 'evaluation', active: true, copy: {} },
    ]);
  });

  it('throws on a query error', async () => {
    const adminDb = {
      from: () => chain({ data: null, error: { message: 'boom' } }),
    } as never;
    await expect(listDocumentTypes(adminDb, INSTITUTION_ID)).rejects.toEqual({
      message: 'boom',
    });
  });
});

describe('updateDocumentType', () => {
  it('upserts only the provided fields, scoped to institution + doc_key', async () => {
    const upsert = jest.fn((..._args: unknown[]) =>
      chain({ data: null, error: null }),
    );
    const adminDb = { from: () => ({ upsert }) } as never;
    const { error } = await updateDocumentType(
      adminDb,
      INSTITUTION_ID,
      'invoice',
      { active: false },
    );
    expect(error).toBeNull();
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        institution_id: INSTITUTION_ID,
        doc_key: 'invoice',
        active: false,
      }),
      { onConflict: 'institution_id,doc_key' },
    );
    // copy was not provided — must not be forced to a default value
    expect(upsert.mock.calls[0][0]).not.toHaveProperty('copy');
  });

  it('surfaces an upsert error rather than swallowing it', async () => {
    const upsert = jest.fn(() =>
      chain({ data: null, error: { message: 'boom' } }),
    );
    const adminDb = { from: () => ({ upsert }) } as never;
    const { error } = await updateDocumentType(
      adminDb,
      INSTITUTION_ID,
      'prescription',
      { copy: { pt: { label: 'Receita' } } },
    );
    expect(error).toEqual({ message: 'boom' });
  });
});
