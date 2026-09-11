import { SupabaseClient } from '@supabase/supabase-js';
import {
  resolveResponsibleRole,
  resolveResponsibleRolesForRange,
} from '../../services/shiftSchedule';
import { chain } from '../helpers/careTeamMock';

// Regression (production, 2026-08-28): care_shift_overrides.responsible_user_id
// was NOT NULL, so an override could only reassign a date, never clear it — a
// shift SWAP was half-recordable. A Fri 31/07 <-> Sat 15/08 trade left the
// missing-log cron chasing the companion for the Friday he had given up and
// silent on the Saturday he worked. NULL now means "nobody on shift", and the
// row must win over the weekday default on its own existence, not on its value.

const RECIPIENT_ID = 'recipient-1';
const COMPANION = 'user-companion';

function makeDb(tables: Record<string, unknown>): SupabaseClient {
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    from: (table: string) => (tables[table] ?? chain({ data: [] })) as any,
  } as unknown as SupabaseClient;
}

describe('resolveResponsibleRole with a cleared override', () => {
  it('reports nobody on shift when the override names no one', async () => {
    // The day the companion traded away. Falling through to the Friday default
    // here is precisely the bug: the cron would nag him for a day he is off.
    const db = makeDb({
      care_shift_overrides: chain({ data: { responsible_user_id: null } }),
      care_shift_defaults: chain({ data: { responsible_user_id: COMPANION } }),
      care_team_members: chain({ data: { role: 'caregiver' } }),
    });

    const role = await resolveResponsibleRole(
      db,
      RECIPIENT_ID,
      '2026-07-31',
      4,
    );
    expect(role).toBeNull();
  });

  it('still falls back to the weekday default when no override row exists', async () => {
    const db = makeDb({
      care_shift_overrides: chain({ data: null }),
      care_shift_defaults: chain({ data: { responsible_user_id: COMPANION } }),
      care_team_members: chain({ data: { role: 'caregiver' } }),
    });

    const role = await resolveResponsibleRole(
      db,
      RECIPIENT_ID,
      '2026-07-24',
      4,
    );
    expect(role).toBe('caregiver');
  });

  it('honours an override that assigns an otherwise unassigned day', async () => {
    // The other half of the swap: a Saturday with no weekday default at all.
    const db = makeDb({
      care_shift_overrides: chain({
        data: { responsible_user_id: COMPANION },
      }),
      care_shift_defaults: chain({ data: null }),
      care_team_members: chain({ data: { role: 'caregiver' } }),
    });

    const role = await resolveResponsibleRole(
      db,
      RECIPIENT_ID,
      '2026-08-15',
      5,
    );
    expect(role).toBe('caregiver');
  });
});

describe('resolveResponsibleRolesForRange with a cleared override', () => {
  it('maps a cleared date to null without consulting the weekday default', async () => {
    const db = makeDb({
      care_shift_defaults: chain({
        data: [
          { weekday: 4, responsible_user_id: COMPANION }, // Friday
        ],
      }),
      care_shift_overrides: chain({
        data: [
          { shift_date: '2026-07-31', responsible_user_id: null }, // traded away
          { shift_date: '2026-08-15', responsible_user_id: COMPANION }, // taken on
        ],
      }),
      care_team_members: chain({
        data: [{ user_id: COMPANION, role: 'caregiver' }],
      }),
    });

    const roles = await resolveResponsibleRolesForRange(db, RECIPIENT_ID, [
      '2026-07-24', // Friday, no override → default applies
      '2026-07-31', // Friday, cleared → nobody
      '2026-08-15', // Saturday, no default → override assigns
    ]);

    expect(roles.get('2026-07-24')).toBe('caregiver');
    expect(roles.get('2026-07-31')).toBeNull();
    expect(roles.get('2026-08-15')).toBe('caregiver');
  });
});
