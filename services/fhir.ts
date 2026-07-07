// Pure mapping of sihha's storage rows onto FHIR R4 resources (4.0.1).
// FHIR compliance here is a read-only facade at the API boundary: storage,
// RLS and the write-only privacy model stay exactly as they are, and this
// module serializes what already exists — the same pattern the CSV export
// uses, aimed at institutions instead of spreadsheets. Kept free of I/O so
// every mapping rule is unit-testable.
//
// Mapping overview:
//   care_recipients   → Patient   (non-human kinds via the patient-animal ext)
//   care_team_members → CareTeam  (participant roles; no user ids or e-mails)
//   care_log_entries  → Observation, one per defined metric value, dispatched
//                       on value_type; medication_checklist items instead
//                       become MedicationStatement resources
//
// Deliberate exclusions: free-text notes and geolocation never leave the
// server — the export carries defined metric values only, mirroring the
// dashboard's data-minimisation stance at raw-entry granularity.

import type { CareMembership, CareRecipientRow } from './careTeam';
import type { MetricDefinitionRow } from './dynamicLog';

export const FHIR_VERSION = '4.0.1';
export const FHIR_JSON_CONTENT_TYPE = 'application/fhir+json; charset=utf-8';

// Metric keys are machine-local, so codes default to a local code system.
// Owners attach standard vocabularies (LOINC/SNOMED) per metric via
// config.coding = { system, code, display } — emitting a wrong "well-known"
// code is worse than an honest local one.
export const METRIC_CODE_SYSTEM = 'urn:sihha:metric-key';
export const ENUM_VALUE_SYSTEM = 'urn:sihha:metric-value';

interface Coding {
  system: string;
  code: string;
  display?: string;
}

interface CodeableConcept {
  coding?: Coding[];
  text?: string;
}

interface Quantity {
  value: number;
  unit?: string;
  system?: string;
  code?: string;
}

// FHIR Reference requires at least one of reference/display; CareTeam
// participants are display-only (sihha stores no resource for team members).
interface Reference {
  reference?: string;
  display?: string;
}

export interface FhirPatient {
  resourceType: 'Patient';
  id: string;
  active: boolean;
  name: Array<{ text: string }>;
  extension?: Array<{
    url: string;
    extension: Array<{ url: string; valueCodeableConcept: CodeableConcept }>;
  }>;
}

export interface FhirCareTeam {
  resourceType: 'CareTeam';
  id: string;
  status: 'active';
  subject: Reference;
  participant: Array<{ role: CodeableConcept[]; member?: Reference }>;
}

export interface FhirObservation {
  resourceType: 'Observation';
  id: string;
  status: 'final';
  category: CodeableConcept[];
  code: CodeableConcept;
  subject: Reference;
  effectiveDateTime: string;
  issued?: string;
  valueInteger?: number;
  valueBoolean?: boolean;
  valueQuantity?: Quantity;
  valueCodeableConcept?: CodeableConcept;
}

export interface FhirMedicationStatement {
  resourceType: 'MedicationStatement';
  id: string;
  status: 'completed' | 'not-taken';
  medicationCodeableConcept: CodeableConcept;
  subject: Reference;
  effectiveDateTime: string;
  dosage?: Array<{ text: string }>;
}

export type FhirResource =
  | FhirPatient
  | FhirCareTeam
  | FhirObservation
  | FhirMedicationStatement;

export interface FhirBundle {
  resourceType: 'Bundle';
  type: 'searchset';
  total: number;
  link?: Array<{ relation: 'self' | 'next'; url: string }>;
  entry?: Array<{ fullUrl: string; resource: FhirResource }>;
}

// The IssueType subset this facade emits (spec: valueset-issue-type).
export type OutcomeCode =
  | 'login'
  | 'forbidden'
  | 'not-found'
  | 'invalid'
  | 'exception'
  | 'throttled';

export interface FhirOperationOutcome {
  resourceType: 'OperationOutcome';
  issue: Array<{
    severity: 'error';
    code: OutcomeCode;
    diagnostics: string;
  }>;
}

/** The entry subset the FHIR mappers need. */
export interface FhirLogEntryRow {
  id: string;
  log_date: string;
  created_at: string;
  values: Record<string, unknown>;
}

const UCUM = 'http://unitsofmeasure.org';

function patientRef(recipientId: string): Reference {
  return { reference: `Patient/${recipientId}` };
}

// ─── Patient ────────────────────────────────────────────────────────────────

export function toPatient(recipient: CareRecipientRow): FhirPatient {
  const patient: FhirPatient = {
    resourceType: 'Patient',
    id: recipient.id,
    active: recipient.active,
    name: [{ text: recipient.display_name }],
  };
  // R4 dropped Patient.animal; non-human recipients (the pet-care template)
  // carry the standard patient-animal extension with a text-only species.
  if (recipient.kind !== 'human') {
    patient.extension = [
      {
        url: 'http://hl7.org/fhir/StructureDefinition/patient-animal',
        extension: [
          { url: 'species', valueCodeableConcept: { text: recipient.kind } },
        ],
      },
    ];
  }
  return patient;
}

// ─── CareTeam ───────────────────────────────────────────────────────────────

/**
 * One CareTeam per care circle, sharing the recipient's id (distinct FHIR
 * resource types have independent id spaces). Participants expose the care
 * role and the member label only — never user ids or e-mail addresses.
 */
export function toCareTeam(
  recipientId: string,
  members: Array<
    Pick<CareMembership, 'role'> & { member_label?: string | null }
  >,
): FhirCareTeam {
  return {
    resourceType: 'CareTeam',
    id: recipientId,
    status: 'active',
    subject: patientRef(recipientId),
    participant: members.map((member) => ({
      role: [{ text: member.role }],
      ...(member.member_label
        ? { member: { display: member.member_label } }
        : {}),
    })),
  };
}

// ─── Observation / MedicationStatement ──────────────────────────────────────

/**
 * FHIR ids allow only [A-Za-z0-9.-]; metric keys are ^[a-z][a-z0-9_]*$, so
 * swapping _ for - is bijective (keys cannot contain a dash).
 */
export function observationId(entryId: string, metricKey: string): string {
  return `${entryId}.${metricKey.replace(/_/g, '-')}`;
}

function metricCode(def: MetricDefinitionRow): CodeableConcept {
  const override = (def.config as { coding?: Coding }).coding;
  const coding: Coding =
    override && override.system && override.code
      ? { ...override, display: override.display ?? def.label }
      : { system: METRIC_CODE_SYSTEM, code: def.key, display: def.label };
  return { coding: [coding], text: def.label };
}

function enumDisplay(def: MetricDefinitionRow, value: string): string {
  for (const option of def.config.options ?? []) {
    if (typeof option === 'object' && option.value === value) {
      return option.label;
    }
  }
  return value;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

// Caregiver-reported data is categorised as 'survey' across the board — the
// stricter categories (vital-signs) mandate LOINC codings this generic layer
// cannot guarantee.
const SURVEY_CATEGORY: CodeableConcept[] = [
  {
    coding: [
      {
        system: 'http://terminology.hl7.org/CodeSystem/observation-category',
        code: 'survey',
        display: 'Survey',
      },
    ],
  },
];

function baseObservation(
  def: MetricDefinitionRow,
  entry: FhirLogEntryRow,
  recipientId: string,
): FhirObservation {
  return {
    resourceType: 'Observation',
    id: observationId(entry.id, def.key),
    status: 'final',
    category: SURVEY_CATEGORY,
    code: metricCode(def),
    subject: patientRef(recipientId),
    // The clinical time is the recipient-local log date (day precision);
    // `issued` carries the exact submission instant.
    effectiveDateTime: entry.log_date,
    issued: entry.created_at,
  };
}

/**
 * One Observation per defined metric value present in the entry, dispatched
 * on value_type. Values are JSONB, so every extractor type-checks and skips
 * malformed or absent values rather than emitting a broken resource.
 * medication_checklist values are excluded here — they map to
 * MedicationStatement via toMedicationStatements().
 */
export function toObservations(
  definitions: MetricDefinitionRow[],
  entry: FhirLogEntryRow,
  recipientId: string,
): FhirObservation[] {
  const observations: FhirObservation[] = [];

  for (const def of definitions) {
    if (def.value_type === 'medication_checklist') continue;
    const raw = entry.values[def.key];
    if (raw == null) continue;

    const observation = baseObservation(def, entry, recipientId);

    switch (def.value_type) {
      case 'scale':
        if (!isFiniteNumber(raw)) continue;
        observation.valueInteger = raw;
        break;
      case 'number':
        if (!isFiniteNumber(raw)) continue;
        observation.valueQuantity = {
          value: raw,
          ...((def.config as { unit?: string }).unit
            ? { unit: (def.config as { unit?: string }).unit }
            : {}),
        };
        break;
      case 'boolean':
        if (typeof raw !== 'boolean') continue;
        observation.valueBoolean = raw;
        break;
      case 'duration_minutes':
        if (!isFiniteNumber(raw)) continue;
        observation.valueQuantity = {
          value: raw,
          unit: 'min',
          system: UCUM,
          code: 'min',
        };
        break;
      case 'time_range': {
        const hours = (raw as { hours?: unknown }).hours;
        if (!isFiniteNumber(hours)) continue;
        observation.valueQuantity = {
          value: hours,
          unit: 'h',
          system: UCUM,
          code: 'h',
        };
        break;
      }
      case 'enum':
        if (typeof raw !== 'string') continue;
        observation.valueCodeableConcept = {
          coding: [
            {
              system: ENUM_VALUE_SYSTEM,
              code: raw,
              display: enumDisplay(def, raw),
            },
          ],
          text: enumDisplay(def, raw),
        };
        break;
    }
    observations.push(observation);
  }

  return observations;
}

interface ChecklistItem {
  name?: unknown;
  prescribed_dosage?: unknown;
  taken?: unknown;
}

/**
 * medication_checklist items → one MedicationStatement each. `taken` maps to
 * status completed / not-taken; the prescribed dosage becomes dosage text.
 */
export function toMedicationStatements(
  definitions: MetricDefinitionRow[],
  entry: FhirLogEntryRow,
  recipientId: string,
): FhirMedicationStatement[] {
  const statements: FhirMedicationStatement[] = [];

  for (const def of definitions) {
    if (def.value_type !== 'medication_checklist') continue;
    const raw = entry.values[def.key];
    if (!Array.isArray(raw)) continue;

    raw.forEach((item: ChecklistItem, index) => {
      if (typeof item?.name !== 'string' || typeof item?.taken !== 'boolean') {
        return;
      }
      statements.push({
        resourceType: 'MedicationStatement',
        id: `${entry.id}.med${index}`,
        status: item.taken ? 'completed' : 'not-taken',
        medicationCodeableConcept: { text: item.name },
        subject: patientRef(recipientId),
        effectiveDateTime: entry.log_date,
        ...(isFiniteNumber(item.prescribed_dosage)
          ? { dosage: [{ text: `${item.prescribed_dosage} per day` }] }
          : {}),
      });
    });
  }

  return statements;
}

// ─── Bundle / OperationOutcome ──────────────────────────────────────────────

export function toSearchsetBundle(
  resources: FhirResource[],
  total: number,
  baseUrl: string,
  links: Array<{ relation: 'self' | 'next'; url: string }> = [],
): FhirBundle {
  return {
    resourceType: 'Bundle',
    type: 'searchset',
    total,
    ...(links.length > 0 ? { link: links } : {}),
    entry: resources.map((resource) => ({
      fullUrl: `${baseUrl}/${resource.resourceType}/${resource.id}`,
      resource,
    })),
  };
}

export function operationOutcome(
  code: OutcomeCode,
  diagnostics: string,
): FhirOperationOutcome {
  return {
    resourceType: 'OperationOutcome',
    issue: [{ severity: 'error', code, diagnostics }],
  };
}
