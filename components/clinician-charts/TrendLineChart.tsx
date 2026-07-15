'use client';

import React, { useState } from 'react';
import type { TrendSeries } from '../../services/clinicianCharts';

// Shared brand palette for chart lines, cycling like the goals charts.
export const LINE_COLORS = [
  'var(--moss-600)',
  'var(--coral-500)',
  'var(--ochre-500)',
  'var(--info)',
  'var(--success)',
  'var(--warning)',
  'var(--moss-800)',
  'var(--coral-700)',
] as const;

export const lineColor = (index: number): string =>
  LINE_COLORS[index % LINE_COLORS.length];

interface BalloonContent {
  title: string;
  lines: string[];
}

interface TrendLineChartProps {
  // Ordered x buckets; every series has one point per bucket at the same index
  xKeys: string[];
  series: TrendSeries[];
  formatX: (key: string) => string;
  // Balloon for a hovered/pinned point (series index + bucket index)
  balloonFor: (seriesIndex: number, pointIndex: number) => BalloonContent;
  // Color offset so cards with several charts keep distinct hues
  colorOf?: (seriesIndex: number) => string;
}

/**
 * Generic 0–100 multi-line SVG chart for the clinician dashboard. Same
 * interaction model as the goals charts: hover previews the balloon on
 * pointer devices, click/tap pins it (the only way in on touch).
 */
export default function TrendLineChart({
  xKeys,
  series,
  formatX,
  balloonFor,
  colorOf = lineColor,
}: TrendLineChartProps) {
  type PointRef = { s: number; p: number };
  const [pinned, setPinned] = useState<PointRef | null>(null);
  const [hovered, setHovered] = useState<PointRef | null>(null);
  const shown = hovered ?? pinned;

  const W = 720;
  const H = 240;
  const padLeft = 40;
  const padRight = 12;
  const padTop = 12;
  const padBottom = 26;
  const x = (index: number) =>
    xKeys.length === 1
      ? (padLeft + W - padRight) / 2
      : padLeft + (index / (xKeys.length - 1)) * (W - padLeft - padRight);
  const y = (value: number) =>
    padTop + (1 - value / 100) * (H - padTop - padBottom);

  // Thin the x labels so long windows stay legible
  const labelStep = Math.max(1, Math.ceil(xKeys.length / 8));

  const balloon = shown ? balloonFor(shown.s, shown.p) : null;
  const balloonLeft = shown
    ? Math.min(86, Math.max(14, (x(shown.p) / W) * 100))
    : 0;

  return (
    <div style={{ position: 'relative' }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', height: 'auto', display: 'block' }}
        role="img"
      >
        {[0, 25, 50, 75, 100].map((line) => (
          <line
            key={line}
            x1={padLeft}
            y1={y(line)}
            x2={W - padRight}
            y2={y(line)}
            stroke={line === 0 ? 'var(--border-default)' : 'var(--border-soft)'}
            strokeDasharray={line === 0 ? undefined : '2 3'}
          />
        ))}
        {[0, 50, 100].map((line) => (
          <text
            key={line}
            x={padLeft - 6}
            y={y(line) + 3}
            fontSize={9}
            fill="var(--text-subtle)"
            textAnchor="end"
          >
            {line}
          </text>
        ))}
        {xKeys.map((key, index) =>
          index % labelStep === 0 ? (
            <text
              key={key}
              x={x(index)}
              y={H - 8}
              fontSize={9}
              fill="var(--text-subtle)"
              textAnchor="middle"
            >
              {formatX(key)}
            </text>
          ) : null,
        )}
        {series.map((s, sIndex) => {
          const drawn = s.points
            .map((point, pIndex) => ({ point, pIndex }))
            .filter(({ point }) => point.value !== null);
          const path = drawn
            .map(
              ({ point, pIndex }) =>
                `${x(pIndex).toFixed(1)},${y(point.value as number).toFixed(1)}`,
            )
            .join(' ');
          return (
            <g key={s.key}>
              {drawn.length > 1 && (
                <polyline
                  points={path}
                  fill="none"
                  stroke={colorOf(sIndex)}
                  strokeWidth={2}
                />
              )}
              {drawn.map(({ point, pIndex }) => {
                const isShown = shown?.s === sIndex && shown?.p === pIndex;
                return (
                  <g
                    key={point.bucket}
                    style={{ cursor: 'pointer' }}
                    onClick={() =>
                      setPinned(
                        pinned?.s === sIndex && pinned?.p === pIndex
                          ? null
                          : { s: sIndex, p: pIndex },
                      )
                    }
                    onMouseEnter={() => setHovered({ s: sIndex, p: pIndex })}
                    onMouseLeave={() => setHovered(null)}
                  >
                    <circle
                      cx={x(pIndex)}
                      cy={y(point.value as number)}
                      r={9}
                      fill="transparent"
                    />
                    <circle
                      cx={x(pIndex)}
                      cy={y(point.value as number)}
                      r={isShown ? 4.5 : 2.5}
                      fill={colorOf(sIndex)}
                    />
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>

      {balloon && (
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
            // A hover-driven balloon must not swallow the pointer — it can
            // sit over the hovered point and would flicker otherwise
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
            {balloon.title}
          </div>
          <div className="stack" style={{ gap: 2 }}>
            {balloon.lines.map((line) => (
              <div key={line} className="t-caption">
                {line}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
