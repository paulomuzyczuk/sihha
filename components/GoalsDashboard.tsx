'use client';

import React, { useEffect, useState } from 'react';
import { API_ROUTES } from '../lib/constants';
import { withRecipient, withViewAs } from '../lib/circles';
import { useI18n } from '../lib/i18n/I18nProvider';
import { DATE_LOCALES } from '../lib/i18n/dictionaries';
import { supabase } from './supabaseClient';
import { Alert, Card, Icon, Select } from './ui';

// The patient's goals dashboard (M6): a month picker, the award card with
// its weighted category bars, an interactive per-sub-goal bar chart with
// absolute MTD figures, and the accumulated run-rate projection with two
// closing scenarios. Read-only — the numbers move as the team logs the days.

interface MetricDetailDto {
  days: number;
  achieved: number | null;
  average: number | null;
  target: number | null;
  weekday?: string;
  weekend?: string;
  unit?: string;
}

interface MetricProgressDto {
  key: string;
  label: string;
  rule: string;
  score: number | null;
  detail: MetricDetailDto;
}

interface CategoryProgressDto {
  key: string;
  label: string;
  weight: number;
  metrics: MetricProgressDto[];
  score: number | null;
}

interface GoalsResponse {
  program: {
    startsOn: string;
    monthlyAwardCents: number;
    currency: string;
    started: boolean;
  } | null;
  months: { first: string; last: string } | null;
  progress: {
    month: string;
    periodStart: string;
    periodEnd: string;
    categories: CategoryProgressDto[];
    totalScore: number | null;
    projectedAwardCents: number | null;
  } | null;
  runRate: {
    lastLoggedDate: string | null;
    actual: { date: string; awardCents: number | null }[];
    projectedPerfectCents: number | null;
    projectedPaceCents: number | null;
  } | null;
  grocery: {
    totalCents: number;
    discretionaryCents: number;
    share: number;
    topCategories: { category: string; amountCents: number }[];
  } | null;
}

interface GoalsDashboardProps {
  // Absent → the API resolves the caller's single membership (admin views)
  recipientId?: string;
  // Platform-admin role preview — forwarded as ?view_as on every API call
  viewAs?: string | null;
}

function shiftMonth(month: string, delta: number): string {
  const [year, monthNum] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, monthNum - 1 + delta, 1));
  return date.toISOString().slice(0, 7);
}

function monthRange(first: string, last: string): string[] {
  const months: string[] = [];
  for (let m = first; m <= last && months.length < 60; m = shiftMonth(m, 1)) {
    months.push(m);
  }
  return months;
}

const pct = (score: number | null) =>
  score === null ? '—' : `${Math.round(score * 100)}%`;

/* ------------------------------------------------------------------ */
/* Sub-goal attainment: one bar per detailed goal, grouped by category */

// One brand hue per goal dimension, cycling; the paired tone is the
// selected state
const GROUP_COLORS: { fill: string; selected: string }[] = [
  { fill: 'var(--moss-500)', selected: 'var(--moss-700)' },
  { fill: 'var(--coral-500)', selected: 'var(--coral-700)' },
  { fill: 'var(--ochre-500)', selected: 'var(--ochre-700)' },
  { fill: 'var(--info)', selected: 'var(--info-ink)' },
  { fill: 'var(--success)', selected: 'var(--success-ink)' },
  { fill: 'var(--warning)', selected: 'var(--warning-ink)' },
];

interface FlatBar {
  categoryLabel: string;
  metric: MetricProgressDto;
  groupIndex: number;
}

function SubGoalsChart({
  categories,
  tooltipFor,
  subgoalLabel,
}: {
  categories: CategoryProgressDto[];
  tooltipFor: (metric: MetricProgressDto) => string;
  subgoalLabel: (metric: MetricProgressDto) => string;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  // Hover shows the balloon on pointer devices; a click/tap pins it — the
  // only way in on touch, where hover doesn't exist.
  const [hovered, setHovered] = useState<number | null>(null);

  const bars: FlatBar[] = [];
  categories.forEach((category, groupIndex) => {
    category.metrics.forEach((metric) =>
      bars.push({ categoryLabel: category.label, metric, groupIndex }),
    );
  });
  const groups = categories.length;

  const W = 720;
  const H = 240;
  const padLeft = 34;
  const padRight = 8;
  const padTop = 10;
  const padBottom = 40;
  const chartH = H - padTop - padBottom;
  const groupGap = 18;
  const barGap = 4;
  const innerW =
    W -
    padLeft -
    padRight -
    groupGap * (groups - 1) -
    barGap * (bars.length - groups);
  const barW = Math.min(52, innerW / bars.length);

  // x position per bar + the horizontal span of each group
  const xs: number[] = [];
  const groupSpan: { start: number; end: number }[] = categories.map(() => ({
    start: Infinity,
    end: -Infinity,
  }));
  let cursor = padLeft;
  bars.forEach((bar, index) => {
    if (index > 0) {
      cursor +=
        bars[index - 1].groupIndex === bar.groupIndex ? barGap : groupGap;
    }
    xs.push(cursor);
    groupSpan[bar.groupIndex].start = Math.min(
      groupSpan[bar.groupIndex].start,
      cursor,
    );
    groupSpan[bar.groupIndex].end = Math.max(
      groupSpan[bar.groupIndex].end,
      cursor + barW,
    );
    cursor += barW;
  });

  const y = (score: number) => padTop + (1 - score) * chartH;
  const displayed = hovered ?? selected;
  const displayedBar = displayed !== null ? bars[displayed] : null;
  const balloonLeft =
    displayed !== null
      ? Math.min(88, Math.max(12, ((xs[displayed] + barW / 2) / W) * 100))
      : 0;

  return (
    <div style={{ position: 'relative' }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', height: 'auto', display: 'block' }}
        role="img"
      >
        {[0, 0.25, 0.5, 0.75, 1].map((line) => (
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
        {[0, 0.5, 1].map((line) => (
          <text
            key={line}
            x={padLeft - 6}
            y={y(line) + 3}
            fontSize={9}
            fill="var(--text-subtle)"
            textAnchor="end"
          >
            {Math.round(line * 100)}%
          </text>
        ))}
        {bars.map((bar, index) => {
          const score = bar.metric.score ?? 0;
          const barY = y(score);
          const barH = Math.max(chartH + padTop - barY, 2);
          const isActive = displayed === index;
          const colors = GROUP_COLORS[bar.groupIndex % GROUP_COLORS.length];
          // Attainment label sits centered inside the column; short bars
          // carry it just above instead
          const fitsInside = barH >= 22;
          const labelY = fitsInside ? barY + barH / 2 + 3 : barY - 5;
          return (
            <g
              key={index}
              style={{ cursor: 'pointer' }}
              onClick={() => setSelected(selected === index ? null : index)}
              onMouseEnter={() => setHovered(index)}
              onMouseLeave={() => setHovered(null)}
            >
              {/* full-height hit area so empty bars stay tappable */}
              <rect
                x={xs[index]}
                y={padTop}
                width={barW}
                height={chartH}
                fill="transparent"
              />
              <rect
                x={xs[index]}
                y={barY}
                width={barW}
                height={barH}
                rx={3}
                fill={
                  bar.metric.score === null
                    ? 'var(--neutral-300)'
                    : isActive
                      ? colors.selected
                      : colors.fill
                }
              />
              <text
                x={xs[index] + barW / 2}
                y={labelY}
                fontSize={8.5}
                fontWeight={700}
                fill={fitsInside ? 'var(--text-on-brand)' : 'var(--text-muted)'}
                textAnchor="middle"
                style={{ pointerEvents: 'none' }}
              >
                {pct(bar.metric.score)}
              </text>
            </g>
          );
        })}
        {groupSpan.map((span, index) =>
          Number.isFinite(span.start) ? (
            <text
              key={index}
              x={(span.start + span.end) / 2}
              y={H - 24}
              fontSize={9}
              fill="var(--text-muted)"
              textAnchor="middle"
            >
              {categories[index].label.length > 22
                ? `${categories[index].label.slice(0, 21)}…`
                : categories[index].label}
            </text>
          ) : null,
        )}
      </svg>

      {displayedBar && (
        <div
          role="tooltip"
          onClick={() => setSelected(null)}
          style={{
            position: 'absolute',
            bottom: '34%',
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
            // sit over the hovered bar and would flicker otherwise
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
            {subgoalLabel(displayedBar.metric)}
          </div>
          <div className="stack" style={{ gap: 2 }}>
            {tooltipFor(displayedBar.metric)
              .split(' · ')
              .map((line) => (
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

/* ---------------------------------------------------------------- */
/* Run rate: the accumulated month so far + the two closing scenarios */

function RunRateChart({
  actual,
  perfectCents,
  paceCents,
  awardCents,
  month,
  periodStart,
  pointTooltip,
  endTooltip,
}: {
  actual: { date: string; awardCents: number | null }[];
  perfectCents: number | null;
  paceCents: number | null;
  awardCents: number;
  month: string;
  periodStart: string;
  pointTooltip: (point: {
    date: string;
    realizedCents: number;
    goalCents: number;
  }) => { title: string; lines: string[] };
  endTooltip: () => { title: string; lines: string[] };
}) {
  const [selected, setSelected] = useState<number | 'end' | null>(null);
  // Same interaction as the sub-goals chart: hover previews, click/tap pins
  const [hovered, setHovered] = useState<number | 'end' | null>(null);
  const displayed = hovered ?? selected;

  const daysInMonth = new Date(
    Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0),
  ).getUTCDate();
  const W = 720;
  const H = 240;
  const padLeft = 44;
  const padRight = 10;
  const padTop = 12;
  const padBottom = 22;
  const x = (day: number) =>
    padLeft + ((day - 1) / (daysInMonth - 1)) * (W - padLeft - padRight);
  const y = (cents: number) =>
    padTop + (1 - cents / awardCents) * (H - padTop - padBottom);
  const dayOf = (date: string) => Number(date.slice(8, 10));

  // What 100% attainment would have accumulated by each day
  const startDay = dayOf(periodStart);
  const periodDays = daysInMonth - startDay + 1;
  const dailyQuota = awardCents / periodDays;

  const plotted = actual
    .map((point, index) => ({ ...point, index }))
    .filter(
      (point): point is { date: string; awardCents: number; index: number } =>
        typeof point.awardCents === 'number',
    );
  const points = plotted.map(
    (point) =>
      `${x(dayOf(point.date)).toFixed(1)},${y(point.awardCents).toFixed(1)}`,
  );
  const last = plotted[plotted.length - 1];

  const scenario = (endCents: number | null) =>
    last && endCents !== null
      ? `${x(dayOf(last.date)).toFixed(1)},${y(last.awardCents).toFixed(1)} ${x(
          daysInMonth,
        ).toFixed(1)},${y(Math.min(endCents, awardCents)).toFixed(1)}`
      : null;

  const perfectLine = scenario(perfectCents);
  const paceLine = scenario(paceCents);
  const moneyShort = (cents: number) => `R$ ${Math.round(cents / 100)}`;

  const displayedPoint =
    typeof displayed === 'number'
      ? (plotted.find((p) => p.index === displayed) ?? null)
      : null;
  const balloonLeft =
    displayed === 'end'
      ? Math.min(86, Math.max(14, (x(daysInMonth) / W) * 100))
      : displayedPoint
        ? Math.min(86, Math.max(14, (x(dayOf(displayedPoint.date)) / W) * 100))
        : 0;
  const balloon =
    displayed === 'end'
      ? endTooltip()
      : displayedPoint
        ? pointTooltip({
            date: displayedPoint.date,
            realizedCents: displayedPoint.awardCents,
            goalCents: Math.round(
              (dayOf(displayedPoint.date) - startDay + 1) * dailyQuota,
            ),
          })
        : null;

  const endMarkers = [
    { key: 'perfect', cents: perfectCents, color: 'var(--success)' },
    { key: 'pace', cents: paceCents, color: 'var(--coral-500)' },
  ].filter(
    (marker): marker is { key: string; cents: number; color: string } =>
      marker.cents !== null,
  );

  return (
    <div style={{ position: 'relative' }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', height: 'auto', display: 'block' }}
        role="img"
      >
        {[0, 0.5, 1].map((line) => (
          <React.Fragment key={line}>
            <line
              x1={padLeft}
              y1={y(line * awardCents)}
              x2={W - padRight}
              y2={y(line * awardCents)}
              stroke={
                line === 0 ? 'var(--border-default)' : 'var(--border-soft)'
              }
              strokeDasharray={line === 0 ? undefined : '2 3'}
            />
            <text
              x={padLeft - 6}
              y={y(line * awardCents) + 3}
              fontSize={9}
              fill="var(--text-subtle)"
              textAnchor="end"
            >
              {moneyShort(line * awardCents)}
            </text>
          </React.Fragment>
        ))}
        {paceLine && (
          <polyline
            points={paceLine}
            fill="none"
            stroke="var(--coral-500)"
            strokeWidth={1.5}
            strokeDasharray="2 4"
          />
        )}
        {perfectLine && (
          <polyline
            points={perfectLine}
            fill="none"
            stroke="var(--success)"
            strokeWidth={1.5}
            strokeDasharray="6 4"
          />
        )}
        {points.length > 0 && (
          <polyline
            points={points.join(' ')}
            fill="none"
            stroke="var(--moss-600)"
            strokeWidth={2}
          />
        )}
        {/* togglable points along the realized line */}
        {plotted.map((point) => {
          const isActive = displayed === point.index;
          return (
            <g
              key={point.date}
              style={{ cursor: 'pointer' }}
              onClick={() =>
                setSelected(selected === point.index ? null : point.index)
              }
              onMouseEnter={() => setHovered(point.index)}
              onMouseLeave={() => setHovered(null)}
            >
              <circle
                cx={x(dayOf(point.date))}
                cy={y(point.awardCents)}
                r={9}
                fill="transparent"
              />
              <circle
                cx={x(dayOf(point.date))}
                cy={y(point.awardCents)}
                r={isActive ? 4.5 : 2.5}
                fill={isActive ? 'var(--moss-800)' : 'var(--moss-600)'}
              />
            </g>
          );
        })}
        {/* the month-end point: tapping shows both scenarios vs the goal */}
        {endMarkers.map((marker) => (
          <g
            key={marker.key}
            style={{ cursor: 'pointer' }}
            onClick={() => setSelected(selected === 'end' ? null : 'end')}
            onMouseEnter={() => setHovered('end')}
            onMouseLeave={() => setHovered(null)}
          >
            <circle
              cx={x(daysInMonth)}
              cy={y(Math.min(marker.cents, awardCents))}
              r={10}
              fill="transparent"
            />
            <circle
              cx={x(daysInMonth)}
              cy={y(Math.min(marker.cents, awardCents))}
              r={displayed === 'end' ? 4.5 : 2.5}
              fill={marker.color}
            />
          </g>
        ))}
        {/* value labels at the data points, colored like their lines. If
            two endpoints crowd each other, the lower line's label drops
            below its point instead of above. */}
        {(() => {
          const clampX = (value: number) =>
            Math.min(Math.max(value, padLeft + 22), W - padRight - 22);
          const labels: React.ReactNode[] = [];
          if (last) {
            labels.push(
              <text
                key="actual"
                x={clampX(x(dayOf(last.date)))}
                y={y(last.awardCents) - 9}
                fontSize={11}
                fontWeight={700}
                fill="var(--moss-700)"
                textAnchor="middle"
              >
                {moneyShort(last.awardCents)}
              </text>,
            );
          }
          const endpoints = [
            {
              key: 'perfect',
              cents: perfectCents,
              color: 'var(--success)',
            },
            { key: 'pace', cents: paceCents, color: 'var(--coral-500)' },
          ].filter(
            (
              endpoint,
            ): endpoint is { key: string; cents: number; color: string } =>
              endpoint.cents !== null,
          );
          const ys = endpoints.map((endpoint) =>
            y(Math.min(endpoint.cents, awardCents)),
          );
          const crowded =
            endpoints.length === 2 && Math.abs(ys[0] - ys[1]) < 18;
          endpoints.forEach((endpoint, index) => {
            // The lower line (larger y) yields and labels below its point
            const below = crowded && ys[index] === Math.max(...ys);
            labels.push(
              <text
                key={endpoint.key}
                x={clampX(x(daysInMonth))}
                y={ys[index] + (below ? 16 : -9)}
                fontSize={11}
                fontWeight={700}
                fill={endpoint.color}
                textAnchor="middle"
              >
                {moneyShort(endpoint.cents)}
              </text>,
            );
          });
          return labels;
        })()}
        <text x={padLeft} y={H - 6} fontSize={9} fill="var(--text-subtle)">
          {startDay}
        </text>
        <text
          x={W - padRight}
          y={H - 6}
          fontSize={9}
          fill="var(--text-subtle)"
          textAnchor="end"
        >
          {daysInMonth}
        </text>
      </svg>

      {balloon && (
        <div
          role="tooltip"
          onClick={() => setSelected(null)}
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

/* ------------------------------------------------------------------ */

export default function GoalsDashboard({
  recipientId,
  viewAs,
}: GoalsDashboardProps) {
  const { locale, t } = useI18n();
  // null = the API's default (current month, or the program's first)
  const [month, setMonth] = useState<string | null>(null);
  const [data, setData] = useState<GoalsResponse | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        setLoading(false);
        return;
      }
      try {
        let url = withViewAs(
          recipientId
            ? withRecipient(API_ROUTES.GOALS, recipientId)
            : API_ROUTES.GOALS,
          viewAs,
        );
        if (month) {
          url += `${url.includes('?') ? '&' : '?'}month=${month}`;
        }
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!res.ok) {
          setError(t('goal.loadError'));
          return;
        }
        setError('');
        setData((await res.json()) as GoalsResponse);
      } catch {
        setError(t('goal.loadError'));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [recipientId, viewAs, month, t]);

  if (loading && !data) return null;
  if (error) {
    return (
      <Card>
        <Alert variant="warning" style={{ marginBottom: 0 }}>
          {error}
        </Alert>
      </Card>
    );
  }
  if (!data?.program || !data.progress || !data.months) return null;

  const { program, months, progress, runRate, grocery } = data;
  const money = (cents: number) =>
    new Intl.NumberFormat(DATE_LOCALES[locale], {
      style: 'currency',
      currency: program.currency,
    }).format(cents / 100);
  const fmt1 = (n: number) =>
    n.toLocaleString(DATE_LOCALES[locale], { maximumFractionDigits: 1 });

  // "Agosto-26" style labels for the month picker
  const monthLabel = (m: string) => {
    const name = new Date(`${m}-01T00:00:00`).toLocaleDateString(
      DATE_LOCALES[locale],
      { month: 'long' },
    );
    return `${name.charAt(0).toUpperCase()}${name.slice(1)}-${m.slice(2, 4)}`;
  };

  const subgoalLabel = (metric: MetricProgressDto) => {
    switch (metric.rule) {
      case 'min_hours':
        return `${metric.label} · ${t('goal.rule.min_hours')}`;
      case 'wake_by':
        return `${metric.label} · ${t('goal.rule.wake_by')}`;
      // No rule suffix: "Supermercado" reads better bare, and the balloon
      // body already spells out the daily-average rule
      case 'monthly_avg_max':
        return metric.label;
      default:
        return metric.label;
    }
  };

  // The balloon: the goal in absolute terms, the realized MTD, and the %
  const tooltipFor = (metric: MetricProgressDto) => {
    const attainment = pct(metric.score);
    const { detail } = metric;
    switch (metric.rule) {
      case 'monthly_avg_max':
        return t('goal.tt.avgMax', {
          target: detail.target ?? 0,
          avg: fmt1(detail.average ?? 0),
          unit: detail.unit ?? '',
          pct: attainment,
        });
      case 'min_hours':
        return t('goal.tt.minHours', {
          target: detail.target ?? 0,
          avg: fmt1(detail.average ?? 0),
          pct: attainment,
        });
      case 'wake_by':
        return t('goal.tt.wakeBy', {
          weekday: detail.weekday ?? '—',
          weekend: detail.weekend ?? '—',
          done: fmt1(detail.achieved ?? 0),
          days: detail.days,
          pct: attainment,
        });
      case 'parent_value':
        return t('goal.tt.attend', {
          days: detail.days,
          done: fmt1(detail.achieved ?? 0),
          pct: attainment,
        });
      default:
        return t('goal.tt.auto', {
          done: fmt1(detail.achieved ?? 0),
          days: detail.days,
          pct: attainment,
        });
    }
  };

  return (
    <div className="stack" style={{ gap: 'var(--space-6)', width: '100%' }}>
      {/* ---- first line: award + weighted categories, groceries beside ---- */}
      <div
        className="row"
        style={{
          gap: 'var(--space-6)',
          width: '100%',
          justifyContent: 'center',
          alignItems: 'stretch',
          flexWrap: 'wrap',
        }}
      >
        <Card style={{ flex: '1 1 380px', maxWidth: 480 }}>
          <div
            className="row"
            style={{
              justifyContent: 'space-between',
              gap: 'var(--space-3)',
              marginBottom: 'var(--space-4)',
            }}
          >
            <div className="t-overline">{t('goal.overline')}</div>
            <Select
              value={progress.month}
              onChange={(e) => setMonth(e.target.value)}
              aria-label={t('goal.monthAria')}
              style={{ width: 'auto', minHeight: 34, fontSize: 'var(--fs-sm)' }}
            >
              {monthRange(months.first, months.last).map((m) => (
                <option key={m} value={m}>
                  {monthLabel(m)}
                </option>
              ))}
            </Select>
          </div>

          {progress.projectedAwardCents === null ? (
            <p
              className="t-sm t-muted"
              style={{ marginBottom: 'var(--space-4)' }}
            >
              {t('goal.noData', { amount: money(program.monthlyAwardCents) })}
            </p>
          ) : (
            <div style={{ marginBottom: 'var(--space-5)' }}>
              <h2 style={{ marginBottom: 2 }}>
                {money(progress.projectedAwardCents)}
              </h2>
              <span className="t-caption" style={{ display: 'block' }}>
                {t('goal.ofTotal', { total: money(program.monthlyAwardCents) })}
              </span>
              <span
                className="t-caption"
                style={{ display: 'block', marginTop: 'var(--space-1)' }}
              >
                {t('goal.projectionDisclaimer')}
              </span>
            </div>
          )}

          <div className="stack" style={{ gap: 'var(--space-3)' }}>
            {progress.categories.map((category) => (
              <div key={category.key}>
                <div
                  className="row"
                  style={{
                    justifyContent: 'space-between',
                    gap: 'var(--space-2)',
                    marginBottom: 'var(--space-1)',
                  }}
                >
                  <span className="t-sm">
                    {category.label} (
                    {t('goal.weight', {
                      pct: Math.round(category.weight * 100),
                    })}
                    )
                  </span>
                  <span className="t-caption">{pct(category.score)}</span>
                </div>
                <div className="progress-track">
                  <div
                    className="progress-fill"
                    style={{ width: `${(category.score ?? 0) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          {!program.started && (
            <p className="t-caption" style={{ marginTop: 'var(--space-4)' }}>
              {t('goal.startsOn', {
                date: new Date(
                  `${program.startsOn}T00:00:00`,
                ).toLocaleDateString(DATE_LOCALES[locale]),
                amount: money(program.monthlyAwardCents),
              })}
            </p>
          )}
        </Card>

        {/* ---- Supermercado: the month's classified receipts at a glance ---- */}
        {grocery && (
          <Card style={{ flex: '1 1 380px', maxWidth: 480 }}>
            <div
              className="t-overline"
              style={{ marginBottom: 'var(--space-4)' }}
            >
              {t('goal.groceryTitle')}
            </div>

            <div style={{ marginBottom: 'var(--space-4)' }}>
              <h2 style={{ marginBottom: 2 }}>
                {money(grocery.discretionaryCents)}
              </h2>
              <span className="t-caption" style={{ display: 'block' }}>
                {t('goal.groceryDiscretionary')} ·{' '}
                {t('goal.groceryShare', {
                  pct: `${Math.round(grocery.share * 100)}%`,
                })}
              </span>
            </div>

            <div style={{ marginBottom: 'var(--space-4)' }}>
              <div
                className="row"
                style={{
                  justifyContent: 'space-between',
                  gap: 'var(--space-2)',
                  marginBottom: 'var(--space-1)',
                }}
              >
                <span className="t-sm">{t('goal.groceryTotal')}</span>
                <span className="t-caption">{money(grocery.totalCents)}</span>
              </div>
              <div className="progress-track">
                <div
                  className="progress-fill"
                  style={{
                    width: `${Math.min(grocery.share, 1) * 100}%`,
                    background: 'var(--coral-500)',
                  }}
                />
              </div>
            </div>

            {grocery.topCategories.length > 0 && (
              <div className="stack" style={{ gap: 'var(--space-2)' }}>
                <span className="t-sm">{t('goal.groceryTopTitle')}</span>
                {grocery.topCategories.map((entry) => (
                  <div
                    key={entry.category}
                    className="row"
                    style={{
                      justifyContent: 'space-between',
                      gap: 'var(--space-2)',
                    }}
                  >
                    <span className="t-caption">
                      {entry.category.charAt(0).toUpperCase()}
                      {entry.category.slice(1)}
                    </span>
                    <span className="t-caption">
                      {money(entry.amountCents)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <p className="t-caption" style={{ marginTop: 'var(--space-4)' }}>
              {t('goal.groceryFootnote')}
            </p>
          </Card>
        )}
      </div>

      {/* ---- every sub-goal, one interactive bar each ---- */}
      <Card wide>
        <div className="t-overline" style={{ marginBottom: 'var(--space-4)' }}>
          {t('goal.subgoalsTitle')}
        </div>
        <SubGoalsChart
          categories={progress.categories}
          tooltipFor={tooltipFor}
          subgoalLabel={subgoalLabel}
        />
        <p className="t-caption" style={{ marginTop: 'var(--space-2)' }}>
          {t('goal.subgoalsHint')}
        </p>
      </Card>

      {/* ---- run rate: accumulated month + two closing scenarios ---- */}
      {runRate && runRate.lastLoggedDate && (
        <Card wide>
          <div
            className="t-overline"
            style={{ marginBottom: 'var(--space-4)' }}
          >
            {t('goal.runRateTitle')}
          </div>
          <RunRateChart
            actual={runRate.actual}
            perfectCents={runRate.projectedPerfectCents}
            paceCents={runRate.projectedPaceCents}
            awardCents={program.monthlyAwardCents}
            month={progress.month}
            periodStart={progress.periodStart}
            pointTooltip={({ date, realizedCents, goalCents }) => ({
              title: new Date(`${date}T00:00:00`).toLocaleDateString(
                DATE_LOCALES[locale],
                { day: '2-digit', month: 'long' },
              ),
              lines: [
                t('goal.rr.accGoal', { goal: money(goalCents) }),
                t('goal.rr.accRealized', { realized: money(realizedCents) }),
                t('goal.rr.accPct', {
                  pct:
                    goalCents > 0
                      ? `${Math.round((realizedCents / goalCents) * 100)}%`
                      : '—',
                }),
              ],
            })}
            endTooltip={() => {
              const award = program.monthlyAwardCents;
              const scenarioPct = (cents: number) =>
                `${Math.round((cents / award) * 100)}%`;
              return {
                title: new Date(
                  `${progress.periodEnd}T00:00:00`,
                ).toLocaleDateString(DATE_LOCALES[locale], {
                  day: '2-digit',
                  month: 'long',
                }),
                lines: [
                  t('goal.rr.accGoal', { goal: money(award) }),
                  ...(runRate.projectedPerfectCents !== null
                    ? [
                        t('goal.rr.scenarioPerfect', {
                          value: money(runRate.projectedPerfectCents),
                          pct: scenarioPct(runRate.projectedPerfectCents),
                        }),
                      ]
                    : []),
                  ...(runRate.projectedPaceCents !== null
                    ? [
                        t('goal.rr.scenarioPace', {
                          value: money(runRate.projectedPaceCents),
                          pct: scenarioPct(runRate.projectedPaceCents),
                        }),
                      ]
                    : []),
                ],
              };
            }}
          />
          <div
            className="row"
            style={{
              gap: 'var(--space-5)',
              flexWrap: 'wrap',
              marginTop: 'var(--space-3)',
            }}
          >
            <span className="t-caption">
              <span style={{ color: 'var(--moss-600)' }}>━</span>{' '}
              {t('goal.legendActual')}
            </span>
            <span className="t-caption">
              <span style={{ color: 'var(--success)' }}>╌╌</span>{' '}
              {t('goal.legendPerfect')}
            </span>
            <span className="t-caption">
              <span style={{ color: 'var(--coral-500)' }}>┄┄</span>{' '}
              {t('goal.legendPace')}
            </span>
          </div>
        </Card>
      )}

      <div
        className="row"
        style={{ gap: 'var(--space-2)', justifyContent: 'center' }}
      >
        <Icon name="leaf" size={15} style={{ color: 'var(--moss-500)' }} />
        <span className="t-caption">{t('goal.footnote')}</span>
      </div>
    </div>
  );
}
