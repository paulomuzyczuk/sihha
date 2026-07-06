// The pre-M4 flagship aggregator, kept verbatim for one purpose: the M2
// backfill parity check (scripts/backfill-m2.ts) compares legacy care_logs
// rows against their care_log_entries transforms using the exact arithmetic
// the dashboard used when parity was first verified. Production aggregation
// is now the generic per-metric dispatch in services/aggregates.ts.

import { AggregationPeriod, bucketKey } from '../services/aggregates';

// The behavioral subset the aggregator needs. Only behavioral fields —
// notes and location are intentionally excluded so raw free text and
// coordinates can never leak through.
export interface CareLogAggregateRow {
  created_at: string;
  mood_score: number;
  medication_checklist: Array<{ taken: boolean }>;
  sleep_data: { hours: number };
  exercise: { duration_minutes: number } | null;
  household_tasks: Record<string, boolean | null>;
  appointment: { attended: boolean } | null;
}

export interface AggregateBucket {
  key: string; // '2026-07-04' | '2026-W27' | '2026-07'
  logCount: number;
  moodAvg: number | null;
  sleepHoursAvg: number | null;
  medicationAdherencePct: number | null;
  exerciseSessions: number;
  exerciseMinutesTotal: number;
  householdCompletionPct: number | null;
  appointmentsAttended: number;
  appointmentsMissed: number;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function ratioPct(hit: number, total: number): number | null {
  return total === 0 ? null : round1((hit / total) * 100);
}

/**
 * Groups rows into period buckets (ascending by key) and computes the
 * behavioral metrics per bucket. Percentages are computed over items, not
 * logs, so a day with 3 of 4 medications taken contributes 3/4 — matching
 * how adherence is reasoned about clinically.
 */
export function aggregateCareLogs(
  rows: CareLogAggregateRow[],
  period: AggregationPeriod,
): AggregateBucket[] {
  const groups = new Map<string, CareLogAggregateRow[]>();
  for (const row of rows) {
    const key = bucketKey(row.created_at, period);
    const group = groups.get(key);
    if (group) {
      group.push(row);
    } else {
      groups.set(key, [row]);
    }
  }

  return Array.from(groups.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, group]) => {
      let moodSum = 0;
      let sleepSum = 0;
      let medsTaken = 0;
      let medsTotal = 0;
      let exerciseSessions = 0;
      let exerciseMinutesTotal = 0;
      let tasksDone = 0;
      let tasksApplicable = 0;
      let appointmentsAttended = 0;
      let appointmentsMissed = 0;

      for (const row of group) {
        moodSum += row.mood_score;
        sleepSum += row.sleep_data.hours;

        for (const item of row.medication_checklist) {
          medsTotal += 1;
          if (item.taken) medsTaken += 1;
        }

        if (row.exercise) {
          exerciseSessions += 1;
          exerciseMinutesTotal += row.exercise.duration_minutes;
        }

        for (const done of Object.values(row.household_tasks)) {
          if (done === null) continue; // weekly task not due that day
          tasksApplicable += 1;
          if (done) tasksDone += 1;
        }

        if (row.appointment) {
          if (row.appointment.attended) appointmentsAttended += 1;
          else appointmentsMissed += 1;
        }
      }

      const logCount = group.length;
      return {
        key,
        logCount,
        moodAvg: logCount === 0 ? null : round1(moodSum / logCount),
        sleepHoursAvg: logCount === 0 ? null : round1(sleepSum / logCount),
        medicationAdherencePct: ratioPct(medsTaken, medsTotal),
        exerciseSessions,
        exerciseMinutesTotal,
        householdCompletionPct: ratioPct(tasksDone, tasksApplicable),
        appointmentsAttended,
        appointmentsMissed,
      };
    });
}
