import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ERROR_MESSAGES } from '../lib/constants';

// The one JSON-body preamble for write routes (audit A18): parse → zod →
// generic 400. Fourteen handlers hand-rolled this ritual with drifting
// variable names and copy; the knowledge (reject early, never leak zod
// internals to the caller) lives here once. Routes that answer with
// field-level validation detail (e.g. /api/logs' per-question errors) do
// their OWN schema step after parsing and are not forced through this.

export type ParsedJsonBody<T> =
  | { ok: true; data: T }
  | { ok: false; response: NextResponse };

export async function parseJsonBody<Schema extends z.ZodTypeAny>(
  req: NextRequest,
  schema: Schema,
  errorMessage: string = ERROR_MESSAGES.VALIDATION_FAILED,
): Promise<ParsedJsonBody<z.infer<Schema>>> {
  const reject = () => ({
    ok: false as const,
    response: NextResponse.json({ error: errorMessage }, { status: 400 }),
  });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return reject();
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) return reject();
  return { ok: true, data: parsed.data };
}
