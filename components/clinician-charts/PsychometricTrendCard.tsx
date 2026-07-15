'use client';

import React, { useState } from 'react';
import {
  buildPsychometricTrends,
  latestClassifications,
  type PsychometricResult,
} from '../../services/clinicianCharts';
import { useI18n } from '../../lib/i18n/I18nProvider';
import { Card } from '../ui';
import TrendLineChart, { lineColor } from './TrendLineChart';

interface PsychometricTrendCardProps {
  results: PsychometricResult[];
}

/**
 * Yearly psychometric evaluation development: one data point per year per
 * measure, plotted on the percentile axis (the only unit comparable across
 * instruments and years). Instrument chips toggle their measures on and off;
 * the legend lists each measure's latest percentile and classification.
 */
export default function PsychometricTrendCard({
  results,
}: PsychometricTrendCardProps) {
  const { t } = useI18n();
  const { years, series } = buildPsychometricTrends(results);
  const latest = latestClassifications(results);
  const instruments = [...new Set(series.map((s) => s.group ?? ''))];
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const toggleInstrument = (instrument: string) => {
    setHidden((current) => {
      const next = new Set(current);
      if (next.has(instrument)) next.delete(instrument);
      else next.add(instrument);
      return next;
    });
  };

  const visible = series
    .map((s, index) => ({ s, index }))
    .filter(({ s }) => !hidden.has(s.group ?? ''));

  return (
    <Card wide>
      <div className="t-overline" style={{ marginBottom: 'var(--space-4)' }}>
        {t('clinician.psychChartTitle')}
      </div>

      {series.length === 0 ? (
        <p className="t-sm t-muted" style={{ textAlign: 'center' }}>
          {t('clinician.psychEmpty')}
        </p>
      ) : (
        <>
          <div
            className="row"
            style={{
              gap: 'var(--space-2)',
              flexWrap: 'wrap',
              marginBottom: 'var(--space-3)',
            }}
          >
            {instruments.map((instrument) => (
              <button
                key={instrument}
                type="button"
                onClick={() => toggleInstrument(instrument)}
                className={
                  hidden.has(instrument)
                    ? 'btn btn-outline btn-sm'
                    : 'btn btn-primary btn-sm'
                }
                style={{ width: 'auto' }}
              >
                {instrument}
              </button>
            ))}
          </div>

          <TrendLineChart
            xKeys={years}
            series={visible.map(({ s }) => s)}
            formatX={(year) => year}
            // Colors keyed to the full series list so toggling an instrument
            // never recolors the remaining lines
            colorOf={(visibleIndex) => lineColor(visible[visibleIndex].index)}
            balloonFor={(visibleIndex, pointIndex) => {
              const { s } = visible[visibleIndex];
              const point = s.points[pointIndex];
              const meta = latest.get(s.key);
              return {
                title: `${s.group} · ${s.label}`,
                lines: [
                  t('clinician.psychBalloon', {
                    year: point.bucket,
                    pct: point.value === null ? '—' : Math.round(point.value),
                    raw: point.raw === null ? '—' : String(point.raw),
                  }),
                  ...(meta?.classification ? [meta.classification] : []),
                ],
              };
            }}
          />

          <div
            className="stack"
            style={{ gap: 2, marginTop: 'var(--space-3)' }}
          >
            {series.map((s, index) => {
              const meta = latest.get(s.key);
              if (hidden.has(s.group ?? '') || !meta) return null;
              return (
                <div
                  key={s.key}
                  className="row t-caption"
                  style={{ gap: 'var(--space-2)' }}
                >
                  <span style={{ color: lineColor(index) }}>●</span>
                  <span style={{ flex: 1 }}>
                    {s.group} · {s.label}
                  </span>
                  <span>
                    {t('clinician.psychLegendPct', {
                      pct: Math.round(meta.percentile),
                    })}
                    {meta.classification ? ` · ${meta.classification}` : ''}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="t-caption" style={{ marginTop: 'var(--space-2)' }}>
            {t('clinician.psychChartHint')}
          </p>
        </>
      )}
    </Card>
  );
}
