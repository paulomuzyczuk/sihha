// Shared HTTP plumbing for the /api/fhir routes: fhir+json responses,
// OperationOutcome errors, the owner-gated authorization preamble, FHIR
// search-parameter parsing, and the entry/definition fetch every clinical
// resource search shares. Route files stay thin dispatchers.
//
// Access model: FHIR reads are OWNER-only. The facade serialises raw-entry
// granularity, which is more than the clinician dashboard exposes
// (aggregates only) — widening that to clinicians is a deliberate decision
// for the circle owner to take outside this codebase, not a default.

import { NextRequest, NextResponse } from 'next/server';
import { SupabaseClient } from '@supabase/supabase-js';
import { authorizeCareRequest, CareAuthResult } from './careTeam';
import {
  FHIR_JSON_CONTENT_TYPE,
  FhirLogEntryRow,
  operationOutcome,
  OutcomeCode,
} from './fhir';
import type { MetricDefinitionRow } from './dynamicLog';
import { logger } from './logger';

export function fhirJson(body: object, status = 200): NextResponse {
  return new NextResponse(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': FHIR_JSON_CONTENT_TYPE,
      'Cache-Control': 'no-store',
    },
  });
}

export function fhirError(
  status: number,
  code: OutcomeCode,
  diagnostics: string,
): NextResponse {
  return fhirJson(operationOutcome(code, diagnostics), status);
}

/**
 * Owner-gated preamble for FHIR routes. Reuses the standard care-request
 * authorization (IP limit → JWT → membership → role → user limit) but
 * re-shapes every failure into the FHIR-native OperationOutcome the spec
 * requires, keeping diagnostics as generic as the JSON API's messages.
 */
export async function authorizeFhirRequest(
  req: NextRequest,
  recipientId: string | undefined,
): Promise<CareAuthResult> {
  const auth = await authorizeCareRequest(req, ['owner'], { recipientId });
  if (auth.ok) return auth;

  const status = auth.response.status;
  const outcome =
    status === 401
      ? fhirError(401, 'login', 'Authentication required')
      : status === 403
        ? fhirError(403, 'forbidden', 'Insufficient permissions')
        : status === 429
          ? fhirError(429, 'throttled', 'Too many requests')
          : fhirError(500, 'exception', 'Internal server error');
  return { ok: false, response: outcome };
}

/** `patient` search param, accepting both `<id>` and `Patient/<id>`. */
export function patientParam(req: NextRequest): string | undefined {
  const raw = req.nextUrl.searchParams.get('patient');
  if (!raw) return undefined;
  return raw.startsWith('Patient/') ? raw.slice('Patient/'.length) : raw;
}

export interface FhirSearchWindow {
  since?: string; // inclusive lower bound on log_date (YYYY-MM-DD)
  until?: string; // inclusive upper bound on log_date
  count: number;
  offset: number;
  invalid?: string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const DEFAULT_COUNT = 100;
export const MAX_COUNT = 1000;

/**
 * Parses the supported subset of FHIR search parameters: repeatable `date`
 * with ge/le prefixes (matched against the recipient-local log_date) and
 * `_count`/`_offset` paging. Anything malformed reports `invalid` so routes
 * can return a 400 OperationOutcome instead of guessing.
 */
export function parseSearchWindow(req: NextRequest): FhirSearchWindow {
  const window: FhirSearchWindow = { count: DEFAULT_COUNT, offset: 0 };

  for (const value of req.nextUrl.searchParams.getAll('date')) {
    const prefix = value.slice(0, 2);
    const date = value.slice(2);
    if (prefix === 'ge' && DATE_RE.test(date)) {
      window.since = date;
    } else if (prefix === 'le' && DATE_RE.test(date)) {
      window.until = date;
    } else if (DATE_RE.test(value)) {
      // Bare date = that exact day
      window.since = value;
      window.until = value;
    } else {
      window.invalid = `Unsupported date parameter: ${value}`;
      return window;
    }
  }

  const count = req.nextUrl.searchParams.get('_count');
  if (count !== null) {
    const parsed = parseInt(count, 10);
    if (Number.isNaN(parsed) || parsed < 1) {
      window.invalid = 'Invalid _count parameter';
      return window;
    }
    window.count = Math.min(parsed, MAX_COUNT);
  }

  const offset = req.nextUrl.searchParams.get('_offset');
  if (offset !== null) {
    const parsed = parseInt(offset, 10);
    if (Number.isNaN(parsed) || parsed < 0) {
      window.invalid = 'Invalid _offset parameter';
      return window;
    }
    window.offset = parsed;
  }

  return window;
}

export interface ClinicalRows {
  definitions: MetricDefinitionRow[];
  entries: FhirLogEntryRow[];
}

/**
 * Definitions + entries for a recipient, oldest first. Definitions include
 * retired (inactive) metrics on purpose: historical entries still reference
 * them and an export must not silently drop that history. The select list
 * deliberately omits notes and coordinates — they never leave the server.
 */
export async function fetchClinicalRows(
  adminDb: SupabaseClient,
  recipientId: string,
  window: Pick<FhirSearchWindow, 'since' | 'until'> = {},
): Promise<ClinicalRows | null> {
  const { data: defRows, error: defError } = await adminDb
    .from('metric_definitions')
    .select(
      'key, label, value_type, config, cadence, cadence_day, filled_by, required, sort_order, active',
    )
    .eq('recipient_id', recipientId);
  if (defError) {
    logger.error(
      'fhir: metric_definitions read failed',
      { route: '/api/fhir', action: 'definitions' },
      defError,
    );
    return null;
  }

  let query = adminDb
    .from('care_log_entries')
    .select('id, log_date, created_at, values')
    .eq('recipient_id', recipientId)
    .order('log_date', { ascending: true })
    .order('created_at', { ascending: true });
  if (window.since) query = query.gte('log_date', window.since);
  if (window.until) query = query.lte('log_date', window.until);

  const { data: entryRows, error: entryError } = await query;
  if (entryError) {
    logger.error(
      'fhir: care_log_entries read failed',
      { route: '/api/fhir', action: 'entries' },
      entryError,
    );
    return null;
  }

  return {
    definitions: (defRows ?? []) as MetricDefinitionRow[],
    entries: (entryRows ?? []) as FhirLogEntryRow[],
  };
}

/** Absolute /api/fhir base for Bundle fullUrls and paging links. */
export function fhirBaseUrl(req: NextRequest): string {
  return `${req.nextUrl.origin}/api/fhir`;
}

/** self + next links for an offset-paged searchset. */
export function pagingLinks(
  req: NextRequest,
  window: FhirSearchWindow,
  total: number,
): Array<{ relation: 'self' | 'next'; url: string }> {
  const links: Array<{ relation: 'self' | 'next'; url: string }> = [
    { relation: 'self', url: req.nextUrl.toString() },
  ];
  if (window.offset + window.count < total) {
    const next = new URL(req.nextUrl.toString());
    next.searchParams.set('_count', String(window.count));
    next.searchParams.set('_offset', String(window.offset + window.count));
    links.push({ relation: 'next', url: next.toString() });
  }
  return links;
}
