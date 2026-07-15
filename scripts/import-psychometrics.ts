// Imports a flattened psychometric-evaluation CSV (produced by the
// psychometric-ingestion skill from the psychiatrist's PDF laudo) into the
// psychometric_results table. Idempotent: rows upsert on
// (recipient_id, test_date, instrument, measure), so re-running a corrected
// CSV overwrites in place.
//
// CSV columns (header required, no quoted fields — measure/classification
// values must not contain commas):
//   test_date,instrument,measure,raw_score,percentile,classification,source_file
//
// Usage:
//   pnpm tsx scripts/import-psychometrics.ts analytics/psychometric_tests/<file>.csv
// The recipient defaults to the sole active care recipient; with several,
// pass PSYCH_RECIPIENT_ID=<uuid>.

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';

// tsx doesn't auto-load .env; parse it manually so the script is self-contained
function loadEnv(): void {
  try {
    const lines = readFileSync(resolve(process.cwd(), '.env'), 'utf-8').split(
      '\n',
    );
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      if (!(key in process.env)) process.env[key] = val;
    }
  } catch {
    // .env absent — rely on environment variables already being set
  }
}

interface CsvRow {
  test_date: string;
  instrument: string;
  measure: string;
  raw_score: number | null;
  percentile: number | null;
  classification: string | null;
  source_file: string | null;
}

const EXPECTED_HEADER = [
  'test_date',
  'instrument',
  'measure',
  'raw_score',
  'percentile',
  'classification',
  'source_file',
];

function parseCsv(path: string): CsvRow[] {
  const lines = readFileSync(path, 'utf-8')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const header = lines[0]?.split(',').map((cell) => cell.trim());
  if (JSON.stringify(header) !== JSON.stringify(EXPECTED_HEADER)) {
    throw new Error(
      `import-psychometrics: unexpected header ${JSON.stringify(header)}; ` +
        `expected ${JSON.stringify(EXPECTED_HEADER)}`,
    );
  }
  return lines.slice(1).map((line, index) => {
    const cells = line.split(',').map((cell) => cell.trim());
    if (cells.length !== EXPECTED_HEADER.length) {
      throw new Error(
        `import-psychometrics: row ${index + 2} has ${cells.length} cells, ` +
          `expected ${EXPECTED_HEADER.length}: ${line}`,
      );
    }
    const [testDate, instrument, measure, rawScore, percentile, cls, source] =
      cells;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(testDate)) {
      throw new Error(
        `import-psychometrics: row ${index + 2} test_date "${testDate}" is not YYYY-MM-DD`,
      );
    }
    const num = (cell: string): number | null => {
      if (cell === '') return null;
      const parsed = Number(cell);
      if (!Number.isFinite(parsed)) {
        throw new Error(
          `import-psychometrics: row ${index + 2} has non-numeric value "${cell}"`,
        );
      }
      return parsed;
    };
    return {
      test_date: testDate,
      instrument,
      measure,
      raw_score: num(rawScore),
      percentile: num(percentile),
      classification: cls || null,
      source_file: source || null,
    };
  });
}

async function main(): Promise<void> {
  loadEnv();
  const csvPath = process.argv[2];
  if (!csvPath) {
    console.error(
      'Usage: pnpm tsx scripts/import-psychometrics.ts <path-to-csv>',
    );
    process.exit(1);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error(
      'import-psychometrics: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required',
    );
    process.exit(1);
  }
  const db = createClient(url, serviceKey);

  let recipientId = process.env.PSYCH_RECIPIENT_ID;
  if (!recipientId) {
    const { data: recipients, error } = await db
      .from('care_recipients')
      .select('id, display_name')
      .eq('active', true);
    if (error) throw error;
    if ((recipients ?? []).length !== 1) {
      console.error(
        `import-psychometrics: found ${recipients?.length ?? 0} active recipients; ` +
          'set PSYCH_RECIPIENT_ID to pick one',
      );
      process.exit(1);
    }
    recipientId = recipients![0].id;
    console.log(`Recipient: ${recipients![0].display_name} (${recipientId})`);
  }

  const rows = parseCsv(resolve(process.cwd(), csvPath));
  const { error: upsertError } = await db.from('psychometric_results').upsert(
    rows.map((row) => ({ ...row, recipient_id: recipientId })),
    { onConflict: 'recipient_id,test_date,instrument,measure' },
  );
  if (upsertError) throw upsertError;
  console.log(`Imported ${rows.length} rows from ${csvPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
