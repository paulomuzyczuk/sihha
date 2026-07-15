'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { API_ROUTES } from '../lib/constants';
import { withRecipient, withViewAs } from '../lib/circles';
import { parseDecimal } from '../lib/numberFormat';
import {
  displayDate,
  maskDisplayDate,
  parseDisplayDate,
} from '../services/dateUtils';
import { isDueToday, weekdayMon0FromDateStr } from '../services/dynamicLog';
import { useI18n } from '../lib/i18n/I18nProvider';
import { MedicationOption } from '../lib/types';
import { supabase } from './supabaseClient';
import SleepInput from './log-form/SleepInput';
import MedicationChecklist from './log-form/MedicationChecklist';
import NotesTextarea from './log-form/NotesTextarea';
import {
  Alert,
  Button,
  Field,
  Icon,
  Input,
  Pill,
  PillGroup,
  Select,
} from './ui';

// M3: the form is rendered FROM the recipient's metric definitions
// (/api/metrics) — one input control per value_type. Nothing about the
// specific care context (mood, meds, the cat) lives in this component.

interface MetricDto {
  key: string;
  label: string;
  value_type:
    | 'scale'
    | 'boolean'
    | 'number'
    | 'duration_minutes'
    | 'time_range'
    | 'enum'
    | 'medication_checklist'
    | 'text';
  config: {
    min?: number;
    max?: number;
    options?: Array<number | { value: string; label: string }>;
    depends_on?: string;
    depends_value?: string;
    anchors?: Record<string, string>;
  };
  cadence: 'daily' | 'weekly' | 'monthly' | 'quarterly';
  cadence_day: number | null;
  cadence_days: number[] | null;
  cadence_start: string | null;
  section: string | null;
  subsection: string | null;
  section_note: string | null;
  required: boolean;
  filled_by: string;
  clinician_profile?: string | null;
  dueToday: boolean;
}

// Client-side state for medication checklists stays camelCase (the shape the
// MedicationChecklist component and MedicationOption use); it is converted to
// the stored snake_case item shape at submit time.
interface ChecklistItemState {
  name: string;
  prescribedDosage: number;
  taken: boolean | null;
}

type MetricValue =
  | number
  | boolean
  | string
  | { start: string; end: string }
  | ChecklistItemState[]
  | null;

function defaultValueFor(
  metric: MetricDto,
  medications: MedicationOption[],
): MetricValue {
  switch (metric.value_type) {
    // Scales and yes/no questions start unanswered: pre-selected values
    // would let a rushed check-in submit answers nobody chose
    case 'time_range':
      return { start: '22:00', end: '07:00' };
    case 'medication_checklist':
      // Each med is a tri-state of its own; the no-meds fallback is a single
      // "as prescribed" tri-state
      return medications.length > 0
        ? medications.map((med) => ({
            name: med.name,
            prescribedDosage: med.dailyDosage,
            taken: null,
          }))
        : [{ name: 'default', prescribedDosage: 0, taken: null }];
    default:
      return null;
  }
}

/**
 * Whether a dependent metric's parent is empty, explicitly "none", or (when
 * depends_value narrows the trigger) any other answer than the revealing one.
 */
function parentEmpty(
  metric: MetricDto,
  values: Record<string, MetricValue>,
): boolean {
  const parent = metric.config.depends_on;
  if (!parent) return false;
  const parentValue = values[parent] ?? null;
  if (parentValue === null || parentValue === 'none') return true;
  const trigger = metric.config.depends_value;
  // String-compare so boolean parents work ("true" reveals on Sim)
  return trigger !== undefined && String(parentValue) !== trigger;
}

function toSubmittedValue(metric: MetricDto, value: MetricValue): unknown {
  if (metric.value_type === 'medication_checklist' && Array.isArray(value)) {
    return value.map((item) => ({
      name: item.name,
      prescribed_dosage: item.prescribedDosage,
      taken: item.taken,
    }));
  }
  // Number metrics hold the raw typed text while editing (comma or dot
  // decimals both accepted); convert to a plain number at submit time.
  if (metric.value_type === 'number' && typeof value === 'string') {
    const parsed = parseDecimal(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return value;
}

interface LogFormProps {
  medications: MedicationOption[];
  // Absent → the API resolves the caller's single membership (admin views)
  recipientId?: string;
  // Platform-admin role preview — forwarded as ?view_as on every API call
  viewAs?: string | null;
  // Specialist refinement of a clinician preview (?view_profile)
  viewProfile?: string | null;
  // Whose metrics this form collects (filled_by). The caregiver's daily log
  // is the default; 'recipient' renders the self-report scales, 'clinician'
  // the rated instruments. Non-caregiver forms hide when nothing is due.
  role?: 'caregiver' | 'clinician' | 'recipient';
  // Rendered instead of nothing when a non-caregiver form has nothing due
  emptyFallback?: React.ReactNode;
  // The trailing free-text notes page. The clinician feedback flow drops it
  // — its own text metric already asks how the session went.
  withNotes?: boolean;
}

export default function LogForm({
  medications,
  recipientId,
  viewAs,
  viewProfile,
  role = 'caregiver',
  emptyFallback = null,
  withNotes = true,
}: LogFormProps) {
  const { t } = useI18n();
  const router = useRouter();
  const [metrics, setMetrics] = useState<MetricDto[]>([]);
  const [values, setValues] = useState<Record<string, MetricValue>>({});
  const [notes, setNotes] = useState<string>('');
  const [loadError, setLoadError] = useState<string>('');
  const [loadingMetrics, setLoadingMetrics] = useState(true);
  const [status, setStatus] = useState<{
    type: 'error' | 'idle' | 'loading';
    message: string;
  }>({ type: 'idle', message: '' });
  const [geoProgress, setGeoProgress] = useState<string>('');
  const [page, setPage] = useState(0);
  const [todaySubmitted, setTodaySubmitted] = useState(false);
  // The metrics response carries the med list; the prop is only a fallback
  const [medsList, setMedsList] = useState<MedicationOption[]>(medications);
  // Clinician feedback targets a date: today by default, or a past
  // session/appointment typed as dd/mm/aaaa (the form itself stays the same
  // — resubmitting a past date overwrites that day's entry, audited
  // server-side).
  // Dates the clinical team already answered — targeting one gets the
  // explicit "this will overwrite" warning before anything is sent.
  const [recordedDates, setRecordedDates] = useState<string[]>([]);
  const [clinicalProfile, setClinicalProfile] = useState<string | null>(null);
  const [todayDate, setTodayDate] = useState<string | null>(null);
  const [logDate, setLogDate] = useState<string | null>(null);
  // The masked dd/mm/aaaa text as typed; logDate holds the committed ISO date
  const [logDateText, setLogDateText] = useState('');
  // Every metric the role fills regardless of cadence — the due set is
  // re-derived from this when the clinician re-targets a past date, so a
  // periodic scale shows up exactly on the dates it was due.
  const [roleMetrics, setRoleMetrics] = useState<MetricDto[]>([]);

  useEffect(() => {
    const load = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        setLoadError(t('errors.unauthorized'));
        setLoadingMetrics(false);
        return;
      }
      try {
        const res = await fetch(
          withViewAs(
            recipientId
              ? withRecipient(API_ROUTES.METRICS, recipientId)
              : API_ROUTES.METRICS,
            viewAs,
            viewProfile,
          ),
          { headers: { Authorization: `Bearer ${session.access_token}` } },
        );
        if (!res.ok) {
          setLoadError(t('logForm.loadError'));
          return;
        }
        const data = await res.json();
        setTodaySubmitted(data.todaySubmitted === true);
        setTodayDate(
          typeof data.todayLocalDate === 'string' ? data.todayLocalDate : null,
        );
        setRecordedDates(
          Array.isArray(data.recordedDates) ? data.recordedDates : [],
        );
        const meds: MedicationOption[] = Array.isArray(data.medications)
          ? data.medications
          : medications;
        setMedsList(meds);
        // Clinician metrics may be scoped to one specialist; the server
        // reports the caller's effective profile (view_profile-substituted
        // for admin previews) and /api/logs applies the same rule.
        const callerProfile = (data.clinicalProfile ?? null) as string | null;
        setClinicalProfile(callerProfile);
        const allRoleMetrics = (data.metrics as MetricDto[]).filter(
          (metric) =>
            metric.filled_by === role &&
            (role !== 'clinician' ||
              metric.clinician_profile == null ||
              metric.clinician_profile === callerProfile),
        );
        setRoleMetrics(allRoleMetrics);
        const dueMetrics = allRoleMetrics.filter((metric) => metric.dueToday);
        setMetrics(dueMetrics);
        setValues(
          Object.fromEntries(
            dueMetrics.map((metric) => [
              metric.key,
              defaultValueFor(metric, meds),
            ]),
          ),
        );
      } catch {
        setLoadError(t('logForm.connError'));
      } finally {
        setLoadingMetrics(false);
      }
    };
    load();
  }, [medications, recipientId, viewAs, viewProfile, role, t]);

  // Re-targeting the entry date rebuilds the form for that date's due set —
  // a periodic scale (WHO-5, PHQ-9, BPRS, PSQI) reappears when editing the
  // date it was due on — and starts the answers fresh (the previous record
  // is overwritten wholesale, never merged).
  const selectLogDate = (value: string) => {
    const date = value || null;
    setLogDate(date);
    const dueMetrics = roleMetrics.filter((metric) =>
      date === null
        ? metric.dueToday
        : isDueToday(metric, weekdayMon0FromDateStr(date), date),
    );
    setMetrics(dueMetrics);
    setValues(
      Object.fromEntries(
        dueMetrics.map((metric) => [
          metric.key,
          defaultValueFor(metric, medsList),
        ]),
      ),
    );
    setPage(0);
  };

  // Enforce the dd/mm/aaaa format by construction: mask while typing, and
  // only commit a complete, real, non-future calendar date. Clearing the
  // field returns the entry to today.
  const handleLogDateText = (raw: string) => {
    const masked = maskDisplayDate(raw);
    setLogDateText(masked);
    if (masked === '') {
      if (logDate !== null) selectLogDate('');
      return;
    }
    const iso = parseDisplayDate(masked);
    if (iso && (!todayDate || iso <= todayDate) && iso !== logDate) {
      selectLogDate(iso);
    }
  };

  const setValue = (key: string, value: MetricValue) => {
    setValues((current) => {
      const next = { ...current, [key]: value };
      // Coupled metrics: clearing a parent clears its dependents
      if (value === null) {
        for (const metric of metrics) {
          if (metric.config.depends_on === key) next[metric.key] = null;
        }
      }
      return next;
    });
  };

  const getGeolocation = (): Promise<GeolocationPosition> =>
    new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation is not supported by your browser'));
        return;
      }
      setGeoProgress(t('logForm.requestingLocation'));
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve(pos),
        (err) => reject(err),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
      );
    });

  // One page per section, in form order; each ungrouped metric (mood,
  // sleep) stands on its own page, and the team note closes the flow.
  const metricPages: { section: string | null; metrics: MetricDto[] }[] = [];
  for (const metric of metrics) {
    const last = metricPages[metricPages.length - 1];
    if (last && last.section !== null && last.section === metric.section) {
      last.metrics.push(metric);
    } else {
      metricPages.push({ section: metric.section, metrics: [metric] });
    }
  }
  const totalPages = metricPages.length + (withNotes ? 1 : 0);
  const isNotesPage = page >= metricPages.length;
  const isLastPage = page === totalPages - 1;
  const currentPage = isNotesPage ? null : metricPages[page];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Only the save button on the final page submits — never a stray Enter
    // key or a click that landed while an earlier page was showing
    if (!isLastPage) return;
    setStatus({ type: 'loading', message: t('logForm.submittingStatus') });
    setGeoProgress('');

    // Geolocation is best-effort — failure does not block submission
    let location: { lat: number; lng: number; accuracy?: number } | undefined;
    try {
      const position = await getGeolocation();
      setGeoProgress(t('logForm.locationObtained'));
      location = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy,
      };
    } catch {
      setGeoProgress('');
    }

    try {
      const submittedValues = Object.fromEntries(
        metrics.map((metric) => [
          metric.key,
          toSubmittedValue(metric, values[metric.key] ?? null),
        ]),
      );

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        setStatus({ type: 'error', message: t('errors.unauthorized') });
        return;
      }

      const res = await fetch(
        withViewAs(
          recipientId
            ? withRecipient(API_ROUTES.LOGS, recipientId)
            : API_ROUTES.LOGS,
          viewAs,
          viewProfile,
        ),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            values: submittedValues,
            notes: notes.trim() || undefined,
            ...(logDate && { logDate }),
            ...(location && { location }),
          }),
        },
      );

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 429) {
          setStatus({ type: 'error', message: t('errors.rateLimit') });
        } else if (res.status === 403) {
          setStatus({
            type: 'error',
            message: t('logForm.forbidden'),
          });
        } else if (res.status === 401) {
          setStatus({ type: 'error', message: t('errors.unauthorized') });
        } else {
          setStatus({
            type: 'error',
            message: t('errors.validation'),
          });
        }
        return;
      }

      router.push(`/success?createdAt=${encodeURIComponent(data.createdAt)}`);
    } catch {
      setStatus({ type: 'error', message: t('errors.validation') });
    }
  };

  const disabled = status.type === 'loading';

  // The entry's target date (today unless the clinician re-opened a past
  // appointment) and whether that date already holds this team's record.
  const targetDate = logDate ?? todayDate;
  const targetRecorded =
    role === 'clinician' &&
    targetDate !== null &&
    recordedDates.includes(targetDate);

  // A non-empty date text must be a committed valid date before the form can
  // advance; the error message waits until the typing looks finished.
  const typedLogDate =
    logDateText.length === 10 ? parseDisplayDate(logDateText) : null;
  const logDateBlocked =
    logDateText !== '' &&
    (typedLogDate === null || (todayDate !== null && typedLogDate > todayDate));
  const logDateShowError = logDateText.length === 10 && logDateBlocked;

  const renderMetric = (metric: MetricDto) => {
    // Dependent metrics stay hidden until their parent has a real value
    // ("none" = nothing scheduled today)
    if (parentEmpty(metric, values)) return null;

    const value = values[metric.key] ?? null;

    switch (metric.value_type) {
      case 'scale': {
        const min = metric.config.min ?? 1;
        const max = metric.config.max ?? 5;
        // Small scales read as choice pills (the mood row in the design);
        // wide ranges fall back to the slider.
        if (max - min <= 9) {
          const steps = Array.from(
            { length: max - min + 1 },
            (_, i) => min + i,
          );
          const anchors = metric.config.anchors ?? {};
          return (
            <Field key={metric.key} label={metric.label} className="form-group">
              <PillGroup role="group" aria-label={metric.label}>
                {steps.map((step) => {
                  const anchor = anchors[String(step)];
                  return (
                    <Pill
                      key={step}
                      active={value === step}
                      onClick={() => setValue(metric.key, step)}
                      disabled={disabled}
                    >
                      {anchor ? `${step} · ${anchor}` : step}
                    </Pill>
                  );
                })}
              </PillGroup>
            </Field>
          );
        }
        return (
          <div key={metric.key} className="mood-slider-container">
            <label className="field-label">
              {metric.label} ({min}–{max})
            </label>
            <input
              type="range"
              min={min}
              max={max}
              step={1}
              value={(value as number) ?? min}
              onChange={(e) => setValue(metric.key, parseInt(e.target.value))}
              // A tap that lands on the current position fires no change
              // event — commit the displayed value so "min" is choosable
              onClick={(e) =>
                value === null &&
                setValue(metric.key, parseInt(e.currentTarget.value))
              }
              className="mood-slider"
              disabled={disabled}
            />
            <div className="mood-labels">
              <span>{min}</span>
              <span>{value === null ? '—' : String(value)}</span>
              <span>{max}</span>
            </div>
          </div>
        );
      }
      case 'boolean':
        // Tri-state: starts unanswered, "Sim"/"Não" are explicit choices
        return (
          <Field key={metric.key} label={metric.label} className="form-group">
            <PillGroup role="group" aria-label={metric.label}>
              <Pill
                active={value === true}
                onClick={() => setValue(metric.key, true)}
                disabled={disabled}
              >
                <Icon name="check" size={16} />
                {t('logForm.yes')}
              </Pill>
              <Pill
                active={value === false}
                onClick={() => setValue(metric.key, false)}
                disabled={disabled}
              >
                {t('logForm.no')}
              </Pill>
            </PillGroup>
          </Field>
        );
      case 'enum': {
        const options = (metric.config.options ?? []).filter(
          (option): option is { value: string; label: string } =>
            typeof option === 'object',
        );
        return (
          <Field key={metric.key} label={metric.label} className="form-group">
            <Select
              value={(value as string) ?? ''}
              onChange={(e) => setValue(metric.key, e.target.value || null)}
              disabled={disabled}
            >
              {metric.required ? (
                <option value="" disabled>
                  {t('logForm.selectPlaceholder')}
                </option>
              ) : (
                <option value="">—</option>
              )}
              {options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
        );
      }
      case 'duration_minutes': {
        const options = (metric.config.options ?? []).filter(
          (option): option is number => typeof option === 'number',
        );
        return (
          <Field key={metric.key} label={metric.label} className="form-group">
            {options.length > 0 ? (
              <Select
                value={value === null ? '' : String(value)}
                onChange={(e) =>
                  setValue(
                    metric.key,
                    e.target.value === '' ? null : parseInt(e.target.value),
                  )
                }
                disabled={disabled}
              >
                {metric.required ? (
                  <option value="" disabled>
                    {t('logForm.selectPlaceholder')}
                  </option>
                ) : (
                  <option value="">—</option>
                )}
                {options.map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {minutes} min
                  </option>
                ))}
              </Select>
            ) : (
              <Input
                type="number"
                min={1}
                value={value === null ? '' : String(value)}
                onChange={(e) =>
                  setValue(
                    metric.key,
                    e.target.value === '' ? null : parseInt(e.target.value),
                  )
                }
                disabled={disabled}
              />
            )}
          </Field>
        );
      }
      case 'number':
        return (
          <Field key={metric.key} label={metric.label} className="form-group">
            <Input
              type="text"
              inputMode="decimal"
              value={value === null ? '' : String(value)}
              onChange={(e) =>
                setValue(
                  metric.key,
                  e.target.value === '' ? null : e.target.value,
                )
              }
              disabled={disabled}
            />
          </Field>
        );
      case 'text':
        return (
          <Field key={metric.key} label={metric.label} className="form-group">
            <Input
              type="text"
              maxLength={200}
              value={value === null ? '' : String(value)}
              onChange={(e) =>
                setValue(
                  metric.key,
                  e.target.value.trim() === '' ? null : e.target.value,
                )
              }
              disabled={disabled}
            />
          </Field>
        );
      case 'time_range':
        return (
          <SleepInput
            key={metric.key}
            value={
              (value as { start: string; end: string }) ?? {
                start: '22:00',
                end: '07:00',
              }
            }
            onChange={(v) => setValue(metric.key, v)}
            disabled={disabled}
          />
        );
      case 'medication_checklist':
        return (
          <MedicationChecklist
            key={metric.key}
            medications={medsList}
            checklist={(value as ChecklistItemState[]) ?? []}
            onChange={(checklist) => setValue(metric.key, checklist)}
            disabled={disabled}
          />
        );
    }
  };

  if (loadingMetrics) {
    if (role !== 'caregiver') return null; // quiet until we know it's due
    return (
      <div
        className="card card-wide flex-center"
        style={{ flexDirection: 'column', gap: '1rem', padding: '2rem' }}
      >
        <div
          className="spinner"
          style={{ width: '28px', height: '28px', borderWidth: '3px' }}
        ></div>
        <p className="t-sm t-muted">{t('logForm.loading')}</p>
      </div>
    );
  }

  // Self-report and clinician forms only exist on the days something is due
  if (role !== 'caregiver' && !loadError && metrics.length === 0) {
    return <>{emptyFallback}</>;
  }

  if (loadError) {
    return (
      <div className="card card-wide">
        <Alert variant="danger" style={{ marginBottom: 0 }}>
          {loadError}
        </Alert>
      </div>
    );
  }

  // "Próxima página" waits until every required visible question on the
  // page has an answer (the team note at the end stays optional). A med
  // checklist is answered when every one of its tri-states is.
  const metricAnswered = (metric: MetricDto): boolean => {
    const value = values[metric.key] ?? null;
    if (value === null) return false;
    if (metric.value_type === 'medication_checklist' && Array.isArray(value)) {
      return value.every((item) => item.taken !== null);
    }
    return true;
  };
  const pageComplete =
    !currentPage ||
    currentPage.metrics.every(
      (metric) =>
        !metric.required ||
        parentEmpty(metric, values) ||
        metricAnswered(metric),
    );

  const renderPageMetrics = (pageMetrics: MetricDto[]) => {
    // Subsections split the page further ("Compromissos" > "Consultas" /
    // "Exames"); hidden dependents don't open one on their own.
    const rows: React.ReactNode[] = [];
    let lastSubsection: string | null = null;
    for (const metric of pageMetrics) {
      const node = renderMetric(metric);
      if (!node) continue;
      const subsection = metric.section ? metric.subsection : null;
      if (subsection && subsection !== lastSubsection) {
        rows.push(
          <div
            key={`subsection-${subsection}`}
            className="t-sm t-strong"
            style={{
              fontWeight: 'var(--fw-semibold)',
              marginBottom: 'var(--space-2)',
            }}
          >
            {subsection}
          </div>,
        );
      }
      lastSubsection = subsection;
      rows.push(node);
    }
    return rows;
  };

  return (
    <form className="card card-wide" onSubmit={handleSubmit}>
      {status.type === 'error' && (
        <Alert variant="danger">{status.message}</Alert>
      )}

      {page === 0 && todaySubmitted && (
        <Alert variant="info">
          {role === 'clinician'
            ? t('clinician.noScales')
            : t('logForm.alreadyLogged')}
        </Alert>
      )}

      {/* Kept visible on every page so it still reads right beside the save
          button when the flow spans several pages */}
      {targetRecorded && (
        <Alert variant="warning">
          {t('clinician.overwriteWarning', {
            date: targetDate ? displayDate(targetDate) : '',
          })}
        </Alert>
      )}

      {/* Always present for the clinical team — the entry's target date is
          explicit, typed as dd/mm/aaaa, empty meaning today */}
      {page === 0 && role === 'clinician' && (
        <Field
          label={
            clinicalProfile === 'psychologist'
              ? t('clinician.sessionDateLabel')
              : clinicalProfile === 'psychiatrist'
                ? t('clinician.apptDateLabel')
                : t('clinician.sessionApptDateLabel')
          }
          className="form-group"
        >
          <Input
            type="text"
            inputMode="numeric"
            value={logDateText}
            onChange={(e) => handleLogDateText(e.target.value)}
            placeholder={t('clinician.apptDatePlaceholder')}
            maxLength={10}
            disabled={disabled}
          />
          <p
            className="t-caption"
            style={{
              marginTop: 'var(--space-1)',
              ...(logDateShowError ? { color: 'var(--danger-ink)' } : {}),
            }}
          >
            {logDateShowError
              ? t('clinician.apptDateInvalid')
              : t('clinician.apptDateBlankHint', {
                  date: todayDate ? displayDate(todayDate) : '',
                })}
          </p>
        </Field>
      )}

      {geoProgress && (
        <div className="geo-loader">
          <Icon name="location" size={16} />
          <span>{geoProgress}</span>
        </div>
      )}

      {currentPage ? (
        <>
          {currentPage.section &&
            currentPage.metrics.every(
              (metric) => metric.cadence !== 'daily',
            ) && <Alert variant="info">{t('logForm.periodicScaleNote')}</Alert>}
          {currentPage.section && (
            <div
              className="t-overline"
              style={{ marginBottom: 'var(--space-3)' }}
            >
              {currentPage.section}
            </div>
          )}
          {renderPageMetrics(currentPage.metrics)}
          {currentPage.metrics[0]?.section_note && (
            <p className="t-caption" style={{ marginBottom: 'var(--space-4)' }}>
              {currentPage.metrics[0].section_note}
            </p>
          )}
        </>
      ) : (
        <NotesTextarea value={notes} onChange={setNotes} disabled={disabled} />
      )}

      <hr
        className="divider"
        style={{ margin: 'var(--space-1) 0 var(--space-5)' }}
      />
      <div
        className="row"
        style={{ justifyContent: 'space-between', gap: 'var(--space-3)' }}
      >
        {page > 0 ? (
          <Button
            variant="outline"
            disabled={disabled}
            onClick={() => setPage(page - 1)}
          >
            {t('logForm.prevPage')}
          </Button>
        ) : (
          <span />
        )}
        <span className="t-caption">
          {pageComplete
            ? t('logForm.pageOf', { current: page + 1, total: totalPages })
            : t('logForm.answerAll')}
        </span>
        {isLastPage ? (
          // key: never let React morph the next button into the submit
          // button in place — the advancing click's default action would
          // submit the form before the note could be written
          <Button
            key="save"
            type="submit"
            disabled={disabled || !pageComplete || logDateBlocked}
          >
            <Icon name="check" size={18} />
            {disabled
              ? t('logForm.submitting')
              : role === 'clinician' && logDate
                ? t('logForm.submitFor', { date: displayDate(logDate) })
                : t('logForm.submit')}
          </Button>
        ) : (
          <Button
            key="next"
            disabled={disabled || !pageComplete || logDateBlocked}
            onClick={(e) => {
              e.preventDefault();
              setPage(page + 1);
            }}
          >
            {t('logForm.nextPage')}
            <Icon name="arrow-right" size={18} />
          </Button>
        )}
      </div>
    </form>
  );
}
