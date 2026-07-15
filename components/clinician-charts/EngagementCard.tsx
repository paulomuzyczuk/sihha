'use client';

import React, { useState } from 'react';
import type { MetricSeries } from '../../services/aggregates';
import { useI18n } from '../../lib/i18n/I18nProvider';
import { Card } from '../ui';

const monthTick = (key: string) => `${key.slice(5, 7)}/${key.slice(2, 4)}`;
const monthTitle = (key: string) => `${key.slice(5, 7)}/${key.slice(0, 4)}`;

interface EngagementCardProps {
  buckets: Array<{ key: string; logCount: number }>;
  // Monthly aggregate series — the card picks the medication checklist
  series: MetricSeries[];
}

/**
 * Team engagement at a glance: bars count the month's log entries (is the
 * routine being recorded at all?), the line overlays medication adherence %.
 * Same hover/pin interaction as the other dashboard charts.
 */
export default function EngagementCard({
  buckets,
  series,
}: EngagementCardProps) {
  const { t } = useI18n();
  const [pinned, setPinned] = useState<number | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const shown = hovered ?? pinned;

  const adherence = series.find((s) => s.value_type === 'medication_checklist');
  const maxLogs = Math.max(1, ...buckets.map((bucket) => bucket.logCount));

  const W = 720;
  const H = 200;
  const padLeft = 40;
  const padRight = 12;
  const padTop = 12;
  const padBottom = 26;
  const chartH = H - padTop - padBottom;
  const slot = (W - padLeft - padRight) / Math.max(buckets.length, 1);
  const barW = Math.min(40, slot * 0.6);
  const xMid = (index: number) => padLeft + slot * index + slot / 2;
  const yPct = (value: number) => padTop + (1 - value / 100) * chartH;

  const adherencePath = buckets
    .map((bucket, index) => {
      const pct = adherence?.points[index]?.pct ?? null;
      return pct === null
        ? null
        : `${xMid(index).toFixed(1)},${yPct(pct).toFixed(1)}`;
    })
    .filter(Boolean)
    .join(' ');

  const balloonLeft =
    shown !== null ? Math.min(86, Math.max(14, (xMid(shown) / W) * 100)) : 0;

  return (
    <Card wide>
      <div className="t-overline" style={{ marginBottom: 'var(--space-4)' }}>
        {t('clinician.engagementTitle')}
      </div>

      {buckets.length === 0 ? (
        <p className="t-sm t-muted" style={{ textAlign: 'center' }}>
          {t('clinician.empty')}
        </p>
      ) : (
        <div style={{ position: 'relative' }}>
          <svg
            viewBox={`0 0 ${W} ${H}`}
            style={{ width: '100%', height: 'auto', display: 'block' }}
            role="img"
          >
            {[0, 50, 100].map((line) => (
              <React.Fragment key={line}>
                <line
                  x1={padLeft}
                  y1={yPct(line)}
                  x2={W - padRight}
                  y2={yPct(line)}
                  stroke={
                    line === 0 ? 'var(--border-default)' : 'var(--border-soft)'
                  }
                  strokeDasharray={line === 0 ? undefined : '2 3'}
                />
                <text
                  x={padLeft - 6}
                  y={yPct(line) + 3}
                  fontSize={9}
                  fill="var(--text-subtle)"
                  textAnchor="end"
                >
                  {line}%
                </text>
              </React.Fragment>
            ))}
            {buckets.map((bucket, index) => {
              const barH = (bucket.logCount / maxLogs) * chartH;
              const isShown = shown === index;
              return (
                <g
                  key={bucket.key}
                  style={{ cursor: 'pointer' }}
                  onClick={() => setPinned(pinned === index ? null : index)}
                  onMouseEnter={() => setHovered(index)}
                  onMouseLeave={() => setHovered(null)}
                >
                  <rect
                    x={padLeft + slot * index}
                    y={padTop}
                    width={slot}
                    height={chartH}
                    fill="transparent"
                  />
                  <rect
                    x={xMid(index) - barW / 2}
                    y={padTop + chartH - barH}
                    width={barW}
                    height={Math.max(barH, bucket.logCount > 0 ? 2 : 0)}
                    rx={3}
                    fill={isShown ? 'var(--moss-500)' : 'var(--moss-200)'}
                  />
                  <text
                    x={xMid(index)}
                    y={H - 8}
                    fontSize={9}
                    fill="var(--text-subtle)"
                    textAnchor="middle"
                  >
                    {monthTick(bucket.key)}
                  </text>
                </g>
              );
            })}
            {adherencePath && (
              <polyline
                points={adherencePath}
                fill="none"
                stroke="var(--coral-500)"
                strokeWidth={2}
              />
            )}
          </svg>

          {shown !== null && (
            <div
              role="tooltip"
              onClick={() => setPinned(null)}
              style={{
                position: 'absolute',
                bottom: '30%',
                left: `${balloonLeft}%`,
                transform: 'translateX(-50%)',
                background: 'var(--bg-raised)',
                border: '1px solid var(--border-soft)',
                borderRadius: 'var(--radius-md)',
                boxShadow: 'var(--shadow-lg)',
                padding: 'var(--space-3)',
                maxWidth: 280,
                zIndex: 10,
                cursor: 'pointer',
                pointerEvents: hovered !== null ? 'none' : 'auto',
              }}
            >
              <div
                className="t-sm t-strong"
                style={{
                  fontWeight: 'var(--fw-semibold)',
                  marginBottom: 'var(--space-1)',
                }}
              >
                {monthTitle(buckets[shown].key)}
              </div>
              <div className="stack" style={{ gap: 2 }}>
                <div className="t-caption">
                  {t('clinician.engagementLogs', {
                    count: buckets[shown].logCount,
                  })}
                </div>
                <div className="t-caption">
                  {t('clinician.engagementAdherence', {
                    pct: adherence?.points[shown]?.pct ?? '—',
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <div
        className="row"
        style={{
          gap: 'var(--space-4)',
          flexWrap: 'wrap',
          marginTop: 'var(--space-3)',
        }}
      >
        <span className="t-caption">
          <span style={{ color: 'var(--moss-400)' }}>▮</span>{' '}
          {t('clinician.engagementLegendLogs')}
        </span>
        <span className="t-caption">
          <span style={{ color: 'var(--coral-500)' }}>━</span>{' '}
          {t('clinician.engagementLegendAdherence')}
        </span>
      </div>
    </Card>
  );
}
