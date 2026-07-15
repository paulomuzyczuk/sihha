'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { API_ROUTES } from '../lib/constants';
import { withRecipient, withViewAs } from '../lib/circles';
import { useI18n } from '../lib/i18n/I18nProvider';
import { DEFAULT_LOOKBACK, MAX_LOOKBACK } from '../services/aggregates';
import type { AggregationPeriod, MetricSeries } from '../services/aggregates';
import type { PsychometricResult } from '../services/clinicianCharts';
import { Card } from './ui';
import EngagementCard from './clinician-charts/EngagementCard';
import PsychometricTrendCard from './clinician-charts/PsychometricTrendCard';
import ScalesTrendCard from './clinician-charts/ScalesTrendCard';

const PERIODS: AggregationPeriod[] = ['daily', 'weekly', 'monthly'];

// The charts always look at the monthly development of the last year; the
// finer daily/weekly resolutions stay available through the CSV export.
const CHART_LOOKBACK_MONTHS = 12;

interface ClinicianDashboardProps {
  accessToken: string;
  // Absent → the API resolves the caller's single membership (admin views)
  recipientId?: string;
  // Platform-admin role preview — forwarded as ?view_as on every API call
  viewAs?: string | null;
}

interface AggregatesResponse {
  buckets: Array<{ key: string; logCount: number }>;
  series: MetricSeries[];
}

/**
 * The clinical team's "Indicadores" view, shared by /clinician and the admin
 * "Ver como Equipe Clínica" preview. A chart dashboard since M9: monthly
 * scale development, the yearly psychometric evaluation, and an engagement
 * strip — with the CSV export keeping the raw table available offline.
 */
export default function ClinicianDashboard({
  accessToken,
  recipientId,
  viewAs,
}: ClinicianDashboardProps) {
  const { t } = useI18n();
  const [buckets, setBuckets] = useState<AggregatesResponse['buckets']>([]);
  const [series, setSeries] = useState<MetricSeries[]>([]);
  const [psychometrics, setPsychometrics] = useState<PsychometricResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Export-only controls: which slice the downloaded CSV covers
  const [period, setPeriod] = useState<AggregationPeriod>('daily');
  const [lookback, setLookback] = useState<number>(DEFAULT_LOOKBACK.daily);
  const [exporting, setExporting] = useState(false);

  const authedFetch = useCallback(
    (base: string) =>
      fetch(
        withViewAs(
          recipientId ? withRecipient(base, recipientId) : base,
          viewAs,
        ),
        { headers: { Authorization: `Bearer ${accessToken}` } },
      ),
    [accessToken, recipientId, viewAs],
  );

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const [aggRes, psychRes] = await Promise.all([
          authedFetch(
            `${API_ROUTES.LOG_AGGREGATES}?period=monthly&lookback=${CHART_LOOKBACK_MONTHS}`,
          ),
          authedFetch(API_ROUTES.PSYCHOMETRICS),
        ]);
        if (!aggRes.ok || !psychRes.ok) {
          setError(t('clinician.loadError'));
          return;
        }
        const agg: AggregatesResponse = await aggRes.json();
        const psych = await psychRes.json();
        setBuckets(agg.buckets ?? []);
        setSeries(agg.series ?? []);
        setPsychometrics(psych.results ?? []);
      } catch {
        setError(t('clinician.connError'));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [authedFetch, t]);

  const switchPeriod = (next: AggregationPeriod) => {
    setPeriod(next);
    setLookback(DEFAULT_LOOKBACK[next]);
  };

  const handleLookbackChange = (raw: string) => {
    const value = parseInt(raw, 10);
    if (Number.isNaN(value)) return;
    setLookback(Math.min(Math.max(value, 1), MAX_LOOKBACK[period]));
  };

  // The blob dance is needed because the endpoint requires the Authorization
  // header — a plain <a href> cannot carry it.
  const handleExportCsv = async () => {
    setExporting(true);
    setError('');
    try {
      const res = await authedFetch(
        `${API_ROUTES.LOG_AGGREGATES}?period=${period}&lookback=${lookback}&format=csv`,
      );
      if (!res.ok) {
        setError(t('clinician.exportError'));
        return;
      }
      const url = URL.createObjectURL(await res.blob());
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `care-aggregates-${period}-last-${lookback}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError(t('clinician.exportError'));
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <div
        className="card card-wide flex-center"
        style={{ flexDirection: 'column', gap: '1rem', padding: '2rem' }}
      >
        <div
          className="spinner"
          style={{ width: '28px', height: '28px', borderWidth: '3px' }}
        ></div>
        <p className="t-sm t-muted">{t('clinician.loading')}</p>
      </div>
    );
  }

  return (
    <div className="stack" style={{ gap: 'var(--space-6)', width: '100%' }}>
      {error && (
        <div className="alert alert-error">
          <span>{error}</span>
        </div>
      )}

      <ScalesTrendCard series={series} buckets={buckets.map((b) => b.key)} />
      <PsychometricTrendCard results={psychometrics} />
      <EngagementCard buckets={buckets} series={series} />

      <Card wide>
        <div className="t-overline" style={{ marginBottom: 'var(--space-4)' }}>
          {t('clinician.exportTitle')}
        </div>
        <div
          className="row"
          style={{ gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}
        >
          {PERIODS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => switchPeriod(p)}
              className={
                period === p
                  ? 'btn btn-primary btn-sm'
                  : 'btn btn-outline btn-sm'
              }
              style={{ width: 'auto' }}
            >
              {t(`clinician.period.${p}`)}
            </button>
          ))}
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: '0.85rem',
              color: 'var(--text-muted)',
            }}
          >
            {t('clinician.last')}
            <input
              type="number"
              min={1}
              max={MAX_LOOKBACK[period]}
              value={lookback}
              onChange={(e) => handleLookbackChange(e.target.value)}
              className="form-input"
              style={{ width: '5rem', padding: '0.4rem 0.6rem' }}
              aria-label={t('clinician.lookbackAria')}
            />
            {t(`clinician.unit.${period}`)}
          </label>
          <button
            type="button"
            onClick={handleExportCsv}
            className="btn btn-outline btn-sm"
            disabled={exporting}
            style={{ width: 'auto' }}
          >
            {exporting ? t('clinician.exporting') : t('clinician.exportCsv')}
          </button>
        </div>
      </Card>
    </div>
  );
}
