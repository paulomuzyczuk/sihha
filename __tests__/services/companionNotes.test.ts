import { fetchCompanionNotes } from '../../services/companionNotes';
import { chain } from '../helpers/careTeamMock';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function dbWith(table: ReturnType<typeof chain>): any {
  return { from: () => table };
}

const UNBOUNDED = { since: null, until: null };

describe('fetchCompanionNotes', () => {
  it('maps rows newest-first with a stable id and drops blank / whitespace notes', async () => {
    const table = chain({
      data: [
        {
          id: '1',
          log_date: '2026-07-29',
          shift_notes: 'Dia tranquilo.',
          created_at: 'b',
        },
        {
          id: '2',
          log_date: '2026-07-28',
          shift_notes: '   ',
          created_at: 'c',
        },
        { id: '3', log_date: '2026-07-27', shift_notes: null, created_at: 'd' },
        {
          id: '4',
          log_date: '2026-07-26',
          shift_notes: 'Recusou o almoço.',
          created_at: 'e',
        },
      ],
    });
    const result = await fetchCompanionNotes(
      dbWith(table),
      'recipient-1',
      UNBOUNDED,
    );
    expect(result).toEqual([
      {
        id: '1',
        logDate: '2026-07-29',
        notes: 'Dia tranquilo.',
        createdAt: 'b',
      },
      {
        id: '4',
        logDate: '2026-07-26',
        notes: 'Recusou o almoço.',
        createdAt: 'e',
      },
    ]);
  });

  it('scopes to caregiver entries and applies no date bounds when unbounded', async () => {
    const table = chain({ data: [] });
    await fetchCompanionNotes(dbWith(table), 'recipient-1', UNBOUNDED);
    expect(table.eq).toHaveBeenCalledWith('author_role', 'caregiver');
    expect(table.eq).toHaveBeenCalledWith('recipient_id', 'recipient-1');
    expect(table.gte).not.toHaveBeenCalled();
    expect(table.lte).not.toHaveBeenCalled();
  });

  it('applies both floor and ceiling for the recent window (future dates excluded)', async () => {
    const table = chain({ data: [] });
    await fetchCompanionNotes(dbWith(table), 'recipient-1', {
      since: '2026-07-15',
      until: '2026-07-30',
    });
    expect(table.gte).toHaveBeenCalledWith('log_date', '2026-07-15');
    expect(table.lte).toHaveBeenCalledWith('log_date', '2026-07-30');
  });

  it('throws when the query errors', async () => {
    const table = chain({ data: null, error: { message: 'boom' } });
    await expect(
      fetchCompanionNotes(dbWith(table), 'recipient-1', UNBOUNDED),
    ).rejects.toEqual({ message: 'boom' });
  });
});
