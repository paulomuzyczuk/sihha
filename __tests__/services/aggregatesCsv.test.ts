import {
  aggregateMetricSeries,
  AggregateMetricDefinition,
} from '../../services/aggregates';
import { aggregatesToCsv, csvCell } from '../../services/aggregatesCsv';

// One metric per column-layout family: single-column numeric (scale), pct
// (boolean), two-column (duration_minutes) and distribution (enum).
const DEFS: AggregateMetricDefinition[] = [
  {
    key: 'mood',
    label: 'Humor',
    value_type: 'scale',
    config: { min: 1, max: 5 },
    sort_order: 0,
  },
  {
    key: 'made_bed',
    label: 'Fez a cama',
    value_type: 'boolean',
    config: {},
    sort_order: 1,
  },
  {
    key: 'exercise_minutes',
    label: 'Exercício',
    value_type: 'duration_minutes',
    config: {},
    sort_order: 2,
  },
  {
    key: 'exercise_type',
    label: 'Tipo de exercício',
    value_type: 'enum',
    config: { options: [{ value: 'walking', label: 'Caminhada' }] },
    sort_order: 3,
  },
];

const ENTRIES = [
  {
    created_at: '2026-07-01T10:00:00.000Z',
    values: {
      mood: 2,
      made_bed: true,
      exercise_minutes: 30,
      exercise_type: 'walking',
    },
  },
  {
    created_at: '2026-07-01T18:00:00.000Z',
    values: {
      mood: 4,
      made_bed: false,
      exercise_minutes: 15,
      exercise_type: 'running',
    },
  },
  // Day with a log but no metric values → empty cells, not zeros
  { created_at: '2026-07-02T10:00:00.000Z', values: {} },
];

describe('aggregatesToCsv', () => {
  const result = aggregateMetricSeries(DEFS, ENTRIES, 'daily');
  const csv = aggregatesToCsv(result);
  const lines = csv.split('\r\n');

  it('emits one header with per-value_type column suffixes', () => {
    expect(lines[0]).toBe(
      'period,logs,Humor (avg),Fez a cama (%),' +
        'Exercício (count),Exercício (min),Tipo de exercício',
    );
  });

  it('emits one row per bucket with machine-friendly values', () => {
    expect(lines[1]).toBe('01/07/2026,2,3,50,2,45,walking:1; running:1');
  });

  it('leaves cells empty when a metric has no values in the bucket', () => {
    expect(lines[2]).toBe('02/07/2026,1,,,,,');
  });

  it('uses CRLF line endings and no trailing newline', () => {
    expect(lines).toHaveLength(3);
    expect(csv.endsWith('\r\n')).toBe(false);
  });
});

describe('csvCell', () => {
  it('passes plain values through untouched', () => {
    expect(csvCell('walking')).toBe('walking');
    expect(csvCell(3.5)).toBe('3.5');
    expect(csvCell(null)).toBe('');
  });

  it('quotes cells containing separators, quotes or newlines', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('line\nbreak')).toBe('"line\nbreak"');
  });

  it('neutralises spreadsheet formula injection in user-defined text', () => {
    expect(csvCell('=SUM(A1:A9)')).toBe("'=SUM(A1:A9)");
    expect(csvCell('@cmd')).toBe("'@cmd");
    expect(csvCell('+alert')).toBe("'+alert");
  });

  it('does not mangle negative numbers', () => {
    expect(csvCell(-5)).toBe('-5');
    expect(csvCell('-2.5')).toBe('-2.5');
  });
});
