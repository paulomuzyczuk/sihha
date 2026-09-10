import {
  institutionMemberUserIds,
  isInstitutionMember,
  institutionMemberAccounts,
  isRecipientInInstitution,
  addInstitutionStaffMember,
} from '../../services/institutionMembers';
import { chain } from '../helpers/careTeamMock';

const INSTITUTION_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

describe('institutionMemberUserIds', () => {
  it('returns the user_ids of every member', async () => {
    const adminDb = {
      from: () => chain({ data: [{ user_id: 'u1' }, { user_id: 'u2' }] }),
    } as never;
    const ids = await institutionMemberUserIds(adminDb, INSTITUTION_ID);
    expect(ids).toEqual(['u1', 'u2']);
  });

  it('throws on a query error rather than silently returning empty', async () => {
    const adminDb = {
      from: () => chain({ data: null, error: { message: 'boom' } }),
    } as never;
    await expect(
      institutionMemberUserIds(adminDb, INSTITUTION_ID),
    ).rejects.toEqual({ message: 'boom' });
  });

  it('returns an empty array when there are no members', async () => {
    const adminDb = { from: () => chain({ data: null }) } as never;
    expect(await institutionMemberUserIds(adminDb, INSTITUTION_ID)).toEqual([]);
  });
});

describe('isInstitutionMember', () => {
  it('returns true when a matching row exists', async () => {
    const adminDb = { from: () => chain({ data: { user_id: 'u1' } }) } as never;
    expect(await isInstitutionMember(adminDb, INSTITUTION_ID, 'u1')).toBe(true);
  });

  it('returns false when no matching row exists', async () => {
    const adminDb = { from: () => chain({ data: null }) } as never;
    expect(await isInstitutionMember(adminDb, INSTITUTION_ID, 'u1')).toBe(
      false,
    );
  });
});

describe('institutionMemberAccounts', () => {
  it('resolves each member id individually via getUserById, never listUsers', async () => {
    const getUserById = jest.fn((id: string) =>
      Promise.resolve({
        data: { user: { id, email: `${id}@example.com` } },
        error: null,
      }),
    );
    const adminDb = {
      from: () => chain({ data: [{ user_id: 'u1' }, { user_id: 'u2' }] }),
      auth: { admin: { getUserById } },
    } as never;
    const accounts = await institutionMemberAccounts(adminDb, INSTITUTION_ID);
    expect(accounts).toEqual([
      { id: 'u1', email: 'u1@example.com' },
      { id: 'u2', email: 'u2@example.com' },
    ]);
    expect(getUserById).toHaveBeenCalledTimes(2);
  });

  it('skips a member id whose account lookup fails or has no e-mail', async () => {
    const getUserById = jest.fn().mockResolvedValue({
      data: { user: null },
      error: { message: 'not found' },
    });
    const adminDb = {
      from: () => chain({ data: [{ user_id: 'ghost' }] }),
      auth: { admin: { getUserById } },
    } as never;
    expect(await institutionMemberAccounts(adminDb, INSTITUTION_ID)).toEqual(
      [],
    );
  });
});

describe('isRecipientInInstitution', () => {
  it('returns true when the recipient belongs to the institution', async () => {
    const adminDb = { from: () => chain({ data: { id: 'r1' } }) } as never;
    expect(await isRecipientInInstitution(adminDb, 'r1', INSTITUTION_ID)).toBe(
      true,
    );
  });

  it('returns false when the recipient belongs to a different institution', async () => {
    const adminDb = { from: () => chain({ data: null }) } as never;
    expect(await isRecipientInInstitution(adminDb, 'r1', INSTITUTION_ID)).toBe(
      false,
    );
  });
});

describe('addInstitutionStaffMember', () => {
  it('upserts an institution_staff row, idempotent on conflict', async () => {
    const upsert = jest.fn(() => chain({ data: null, error: null }));
    const adminDb = { from: () => ({ upsert }) } as never;
    const { error } = await addInstitutionStaffMember(
      adminDb,
      INSTITUTION_ID,
      'u1',
    );
    expect(error).toBeNull();
    expect(upsert).toHaveBeenCalledWith(
      {
        institution_id: INSTITUTION_ID,
        user_id: 'u1',
        institution_role: 'institution_staff',
      },
      { onConflict: 'institution_id,user_id', ignoreDuplicates: true },
    );
  });

  it('surfaces an upsert error rather than swallowing it', async () => {
    const upsert = jest.fn(() =>
      chain({ data: null, error: { message: 'boom' } }),
    );
    const adminDb = { from: () => ({ upsert }) } as never;
    const { error } = await addInstitutionStaffMember(
      adminDb,
      INSTITUTION_ID,
      'u1',
    );
    expect(error).toEqual({ message: 'boom' });
  });
});
