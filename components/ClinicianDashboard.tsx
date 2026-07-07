'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { API_ROUTES } from '../lib/constants';
import { withRecipient } from '../lib/circles';
import { useI18n } from '../lib/i18n/I18nProvider';
import type { I18n } from '../lib/i18n/I18nProvider';
import { DEFAULT_LOOKBACK, MAX_LOOKBACK } from '../services/aggregates';
import type {
  AggregationPeriod,
  MetricSeries,
  MetricSeriesPoint,
} from '../services/aggregates';

const PERIODS: AggregationPeriod[] = ['daily', 'weekly', 'monthly'];

function formatBucketLabel(
  key: string,
  period: AggregationPeriod,
  t: I18n['t'],
): string {
  if (period === 'daily') {
    const [year, month, day] = key.split('-');
    return `${day}/${month}/${year}`;
  }
  if (period === 'weekly') {
    const [year, week] = key.split('-W');
    return t('clinician.weekLabel', { week, year });
  }
  const [year, month] = key.split('-');
  return `${month}/${year}`;
}

/** Column header: the label plus the scale range or unit when configured. */
function seriesHeader(series: MetricSeries): string {
  const { min, max, unit } = series.config;
  if (series.value_type === 'scale' && min !== undefined && max !== undefined) {
    return `${series.label} (${min}–${max})`;
  }
  if (series.value_type === 'number' && unit) {
    return `${series.label} (${unit})`;
  }
  if (series.value_type === 'time_range') {
    return `${series.label} (h)`;
  }
  return series.label;
}

/** Display label for a stored enum value, via the definition's options. */
function enumLabel(series: MetricSeries, value: string): string {
  for (const option of series.config.options ?? []) {
    if (typeof option === 'object' && option.value === value) {
      return option.label;
    }
  }
  return value;
}

// One formatting rule per value_type — the client-side half of the generic
// dispatch (the arithmetic half lives in services/aggregates.ts).
function formatPoint(series: MetricSeries, point: MetricSeriesPoint): string {
  if (point.count === 0) return '—';
  switch (series.value_type) {
    case 'scale':
    case 'number':
    case 'time_range':
      return String(point.avg);
    case 'boolean':
    case 'medication_checklist':
      return `${point.pct}%`;
    case 'duration_minutes':
      return `${point.count}× (${point.sum} min)`;
    case 'enum':
      return Object.entries(point.distribution ?? {})
        .sort(([, a], [, b]) => b - a)
        .map(([value, n]) =>
          n === 1
            ? enumLabel(series, value)
            : `${enumLabel(series, value)} ×${n}`,
        )
        .join(', ');
  }
}

const cellStyle: React.CSSProperties = {
  padding: '0.6rem 0.75rem',
  borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
  fontSize: '0.85rem',
  textAlign: 'center',
  whiteSpace: 'nowrap',
};

const headerCellStyle: React.CSSProperties = {
  ...cellStyle,
  color: 'hsl(var(--text-secondary))',
  fontWeight: 600,
  fontSize: '0.75rem',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

interface ClinicianDashboardProps {
  accessToken: string;
  // Absent → the API resolves the caller's single membership (admin views)
  recipientId?: string;
}

interface AggregatesResponse {
  buckets: Array<{ key: string; logCount: number }>;
  series: MetricSeries[];
}

/**
 * Read-only aggregate view over the recipient's logs, shared by the CLINICIAN
 * page (/clinician) and the admin "Ver como Equipe Clínica" view. Fully
 * generic since M4: one column per active metric definition, each rendered by
 * its value_type — no flagship metric names in the code.
 */
export default function ClinicianDashboard({
  accessToken,
  recipientId,
}: ClinicianDashboardProps) {
  const { t } = useI18n();
  const [period, setPeriod] = useState<AggregationPeriod>('daily');
  const [lookback, setLookback] = useState<number>(DEFAULT_LOOKBACK.daily);
  const [buckets, setBuckets] = useState<AggregatesResponse['buckets']>([]);
  const [series, setSeries] = useState<MetricSeries[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');

  const switchPeriod = (next: AggregationPeriod) => {
    setPeriod(next);
    setLookback(DEFAULT_LOOKBACK[next]);
  };

  const handleLookbackChange = (raw: string) => {
    const value = parseInt(raw, 10);
    if (Number.isNaN(value)) return;
    setLookback(Math.min(Math.max(value, 1), MAX_LOOKBACK[period]));
  };

  const loadAggregates = useCallback(
    async (selected: AggregationPeriod, periods: number) => {
      setLoading(true);
      setError('');
      try {
        const base = `${API_ROUTES.LOG_AGGREGATES}?period=${selected}&lookback=${periods}`;
        const res = await fetch(
          recipientId ? withRecipient(base, recipientId) : base,
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );
        if (!res.ok) {
          setError(t('clinician.loadError'));
          setBuckets([]);
          setSeries([]);
          return;
        }
        const data: AggregatesResponse = await res.json();
        setBuckets(data.buckets ?? []);
        setSeries(data.series ?? []);
      } catch {
        setError(t('clinician.connError'));
        setBuckets([]);
        setSeries([]);
      } finally {
        setLoading(false);
      }
    },
    [accessToken, recipientId, t],
  );

  useEffect(() => {
    loadAggregates(period, lookback);
  }, [period, lookback, loadAggregates]);

  // Same query the table shows, as a downloaded CSV file. The blob dance is
  // needed because the endpoint requires the Authorization header — a plain
  // <a href> cannot carry it.
  const handleExportCsv = async () => {
    setExporting(true);
    setError('');
    try {
      const base = `${API_ROUTES.LOG_AGGREGATES}?period=${period}&lookback=${lookback}&format=csv`;
      const res = await fetch(
        recipientId ? withRecipient(base, recipientId) : base,
        { headers: { Authorization: `Bearer ${accessToken}` } },
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

  // Newest period first — clinicians scan from the current state backwards.
  // Every series carries one point per bucket at the same index, so rows keep
  // the original index to read each series positionally.
  const rows = buckets.map((bucket, index) => ({ bucket, index })).reverse();

  return (
    <div className="card" style={{ maxWidth: '900px', width: '100%' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
          marginBottom: '1.5rem',
        }}
      >
        <h2 style={{ fontSize: '1.25rem' }}>{t('clinician.title')}</h2>
        <div
          style={{
            display: 'flex',
            gap: '0.5rem',
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          {PERIODS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => switchPeriod(p)}
              className={period === p ? 'btn' : 'btn btn-secondary'}
              style={{
                width: 'auto',
                padding: '0.45rem 1rem',
                fontSize: '0.85rem',
              }}
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
              color: 'hsl(var(--text-secondary))',
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
            className="btn btn-secondary"
            disabled={exporting || loading}
            style={{
              width: 'auto',
              padding: '0.45rem 1rem',
              fontSize: '0.85rem',
            }}
          >
            {exporting ? t('clinician.exporting') : t('clinician.exportCsv')}
          </button>
        </div>
      </div>

      {error && (
        <div className="alert alert-error">
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div
          className="flex-center"
          style={{ padding: '2rem', flexDirection: 'column', gap: '1rem' }}
        >
          <div
            className="spinner"
            style={{ width: '28px', height: '28px', borderWidth: '3px' }}
          ></div>
          <p
            style={{ color: 'hsl(var(--text-secondary))', fontSize: '0.9rem' }}
          >
            {t('clinician.loading')}
          </p>
        </div>
      ) : rows.length === 0 && !error ? (
        <p
          style={{
            color: 'hsl(var(--text-secondary))',
            textAlign: 'center',
            padding: '2rem 0',
          }}
        >
          {t('clinician.empty')}
        </p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...headerCellStyle, textAlign: 'left' }}>
                  {t('clinician.periodColumn')}
                </th>
                <th style={headerCellStyle}>{t('clinician.logsColumn')}</th>
                {series.map((s) => (
                  <th key={s.key} style={headerCellStyle}>
                    {seriesHeader(s)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ bucket, index }) => (
                <tr key={bucket.key}>
                  <td style={{ ...cellStyle, textAlign: 'left' }}>
                    {formatBucketLabel(bucket.key, period, t)}
                  </td>
                  <td style={cellStyle}>{bucket.logCount}</td>
                  {series.map((s) => (
                    <td key={s.key} style={cellStyle}>
                      {formatPoint(s, s.points[index])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
