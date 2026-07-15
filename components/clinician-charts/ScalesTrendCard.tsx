'use client';

import React from 'react';
import type { MetricSeries } from '../../services/aggregates';
import { buildScaleTrends } from '../../services/clinicianCharts';
import { formatDecimal } from '../../lib/numberFormat';
import { useI18n } from '../../lib/i18n/I18nProvider';
import { Card } from '../ui';
import TrendLineChart, { lineColor } from './TrendLineChart';

/** '2026-07' → '07/26' — compact monthly tick. */
const monthTick = (key: string) => `${key.slice(5, 7)}/${key.slice(2, 4)}`;
/** '2026-07' → '07/2026' — balloon title. */
const monthTitle = (key: string) => `${key.slice(5, 7)}/${key.slice(0, 4)}`;

interface ScalesTrendCardProps {
  // Monthly aggregate series (all metrics — the card picks the scales)
  series: MetricSeries[];
  buckets: string[];
}

/**
 * Time-series development of every scale instrument: one line per scale,
 * monthly averages, normalized to each scale's own range so they share the
 * 0–100% axis. The balloon carries the raw average.
 */
export default function ScalesTrendCard({
  series,
  buckets,
}: ScalesTrendCardProps) {
  const { t, locale } = useI18n();
  const trends = buildScaleTrends(series);

  return (
    <Card wide>
      <div className="t-overline" style={{ marginBottom: 'var(--space-4)' }}>
        {t('clinician.scalesChartTitle')}
      </div>

      {trends.length === 0 ? (
        <p className="t-sm t-muted" style={{ textAlign: 'center' }}>
          {t('clinician.empty')}
        </p>
      ) : (
        <>
          <TrendLineChart
            xKeys={buckets}
            series={trends}
            formatX={monthTick}
            balloonFor={(sIndex, pIndex) => {
              const trend = trends[sIndex];
              const point = trend.points[pIndex];
              return {
                title: monthTitle(point.bucket),
                lines: [
                  `${trend.label} (${trend.rangeNote})`,
                  t('clinician.scaleBalloonAvg', {
                    avg:
                      point.raw === null
                        ? '—'
                        : formatDecimal(point.raw, locale),
                    pct: point.value === null ? '—' : Math.round(point.value),
                  }),
                ],
              };
            }}
          />
          <div
            className="row"
            style={{
              gap: 'var(--space-4)',
              flexWrap: 'wrap',
              marginTop: 'var(--space-3)',
            }}
          >
            {trends.map((trend, index) => (
              <span key={trend.key} className="t-caption">
                <span style={{ color: lineColor(index) }}>━</span> {trend.label}{' '}
                ({trend.rangeNote})
              </span>
            ))}
          </div>
          <p className="t-caption" style={{ marginTop: 'var(--space-2)' }}>
            {t('clinician.scalesChartHint')}
          </p>
        </>
      )}
    </Card>
  );
}
