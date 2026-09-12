/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { I18nProvider } from '../../lib/i18n/I18nProvider';
import GoalsDashboard from '../../components/GoalsDashboard';

// Goals-run-rate port: the dashboard now fetches /api/goals/series alongside
// /api/goals and matches each sub-goal bar to its trend by goalRuleUid. What
// must survive: the trend fetch never blocks or errors the main goals view,
// and a bar's balloon shows the 8-week trend only for its own uid.

jest.mock('../../components/supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: () =>
        Promise.resolve({ data: { session: { access_token: 'tok' } } }),
    },
  },
}));

const GOALS_RESPONSE = {
  program: {
    startsOn: '2026-01-01',
    monthlyAwardCents: 10000,
    currency: 'BRL',
    started: true,
  },
  months: { first: '2026-01', last: '2026-09' },
  progress: {
    month: '2026-09',
    periodStart: '2026-09-01',
    periodEnd: '2026-09-30',
    categories: [
      {
        key: 'sleep',
        label: 'Sono',
        weight: 1,
        score: 0.8,
        metrics: [
          {
            uid: 'sleep::min_hours::',
            key: 'sleep',
            label: 'Sono',
            rule: 'min_hours',
            score: 0.8,
            detail: { days: 5, achieved: 4, average: 7, target: 8 },
          },
        ],
      },
    ],
    totalScore: 0.8,
    projectedAwardCents: 8000,
  },
  runRate: null,
  grocery: null,
};

const SERIES_RESPONSE = {
  month: '2026-09',
  series: [
    {
      uid: 'sleep::min_hours::',
      sliceCents: 10000,
      daily: [],
      weekly: [
        { bucket: '2026-08-03', pct: 50 },
        { bucket: '2026-08-10', pct: 75 },
      ],
    },
  ],
};

function mockFetchSequence() {
  return jest.fn((url: string) => {
    const body = url.includes('/series') ? SERIES_RESPONSE : GOALS_RESPONSE;
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(body),
    });
  }) as unknown as typeof fetch;
}

describe('GoalsDashboard trend integration', () => {
  beforeEach(() => {
    global.fetch = mockFetchSequence();
  });

  it('shows the matching sub-goal’s 8-week trend when its bar is selected', async () => {
    render(
      <I18nProvider>
        <GoalsDashboard recipientId="recipient-1" />
      </I18nProvider>,
    );

    // "80%" also appears as the category's weighted-score badge; the bar's
    // own label is the last match in DOM order.
    const matches = await screen.findAllByText('80%');
    fireEvent.click(matches[matches.length - 1].closest('g')!);

    await waitFor(() => expect(screen.getByText('Last 8 weeks')).toBeTruthy());
  });

  it('still renders the goals view when the series fetch fails', async () => {
    global.fetch = jest.fn((url: string) => {
      if (url.includes('/series')) return Promise.reject(new Error('boom'));
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(GOALS_RESPONSE),
      });
    }) as unknown as typeof fetch;

    render(
      <I18nProvider>
        <GoalsDashboard recipientId="recipient-1" />
      </I18nProvider>,
    );

    await waitFor(() => expect(screen.getByText('Sono')).toBeTruthy());
  });
});
