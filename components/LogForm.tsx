'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { API_ROUTES, ERROR_MESSAGES } from '../lib/constants';
import { withRecipient } from '../lib/circles';
import { MedicationOption } from '../lib/types';
import { supabase } from './supabaseClient';
import SleepInput from './log-form/SleepInput';
import MedicationChecklist from './log-form/MedicationChecklist';
import NotesTextarea from './log-form/NotesTextarea';

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
    | 'medication_checklist';
  config: {
    min?: number;
    max?: number;
    options?: Array<number | { value: string; label: string }>;
    depends_on?: string;
  };
  required: boolean;
  filled_by: string;
  dueToday: boolean;
}

// Client-side state for medication checklists stays camelCase (the shape the
// MedicationChecklist component and MedicationOption use); it is converted to
// the stored snake_case item shape at submit time.
interface ChecklistItemState {
  name: string;
  prescribedDosage: number;
  taken: boolean;
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
    case 'scale':
      return Math.round(
        ((metric.config.min ?? 1) + (metric.config.max ?? 5)) / 2,
      );
    case 'boolean':
      return false;
    case 'time_range':
      return { start: '22:00', end: '07:00' };
    case 'medication_checklist':
      return medications.map((med) => ({
        name: med.name,
        prescribedDosage: med.dailyDosage,
        taken: false,
      }));
    default:
      return null;
  }
}

function toSubmittedValue(metric: MetricDto, value: MetricValue): unknown {
  if (metric.value_type === 'medication_checklist' && Array.isArray(value)) {
    return value.map((item) => ({
      name: item.name,
      prescribed_dosage: item.prescribedDosage,
      taken: item.taken,
    }));
  }
  return value;
}

interface LogFormProps {
  medications: MedicationOption[];
  // Absent → the API resolves the caller's single membership (admin views)
  recipientId?: string;
}

export default function LogForm({ medications, recipientId }: LogFormProps) {
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

  useEffect(() => {
    const load = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        setLoadError(ERROR_MESSAGES.UNAUTHORIZED);
        setLoadingMetrics(false);
        return;
      }
      try {
        const res = await fetch(
          recipientId
            ? withRecipient(API_ROUTES.METRICS, recipientId)
            : API_ROUTES.METRICS,
          { headers: { Authorization: `Bearer ${session.access_token}` } },
        );
        if (!res.ok) {
          setLoadError('Não foi possível carregar o formulário.');
          return;
        }
        const data = await res.json();
        const caregiverMetrics = (data.metrics as MetricDto[]).filter(
          (metric) => metric.filled_by === 'caregiver' && metric.dueToday,
        );
        setMetrics(caregiverMetrics);
        setValues(
          Object.fromEntries(
            caregiverMetrics.map((metric) => [
              metric.key,
              defaultValueFor(metric, medications),
            ]),
          ),
        );
      } catch {
        setLoadError('Erro de conexão ao carregar o formulário.');
      } finally {
        setLoadingMetrics(false);
      }
    };
    load();
  }, [medications, recipientId]);

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
      setGeoProgress('Solicitando permissão de localização...');
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve(pos),
        (err) => reject(err),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
      );
    });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus({ type: 'loading', message: 'Enviando registro...' });
    setGeoProgress('');

    // Geolocation is best-effort — failure does not block submission
    let location: { lat: number; lng: number; accuracy?: number } | undefined;
    try {
      const position = await getGeolocation();
      setGeoProgress('Localização obtida.');
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
        setStatus({ type: 'error', message: ERROR_MESSAGES.UNAUTHORIZED });
        return;
      }

      const res = await fetch(
        recipientId
          ? withRecipient(API_ROUTES.LOGS, recipientId)
          : API_ROUTES.LOGS,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            values: submittedValues,
            notes: notes.trim() || undefined,
            ...(location && { location }),
          }),
        },
      );

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 429) {
          setStatus({ type: 'error', message: ERROR_MESSAGES.RATE_LIMIT });
        } else if (res.status === 409) {
          setStatus({
            type: 'error',
            message: 'O registro de hoje já foi enviado.',
          });
        } else if (res.status === 403) {
          setStatus({
            type: 'error',
            message:
              'Acesso negado: sem permissão para registrar logs de cuidados.',
          });
        } else if (res.status === 401) {
          setStatus({ type: 'error', message: ERROR_MESSAGES.UNAUTHORIZED });
        } else {
          setStatus({
            type: 'error',
            message: ERROR_MESSAGES.VALIDATION_FAILED,
          });
        }
        return;
      }

      router.push(`/success?createdAt=${encodeURIComponent(data.createdAt)}`);
    } catch {
      setStatus({ type: 'error', message: ERROR_MESSAGES.VALIDATION_FAILED });
    }
  };

  const disabled = status.type === 'loading';

  const renderMetric = (metric: MetricDto) => {
    // Dependent metrics stay hidden until their parent has a value
    const parent = metric.config.depends_on;
    if (parent && (values[parent] ?? null) === null) return null;

    const value = values[metric.key] ?? null;

    switch (metric.value_type) {
      case 'scale': {
        const min = metric.config.min ?? 1;
        const max = metric.config.max ?? 5;
        return (
          <div key={metric.key} className="mood-slider-container">
            <label className="form-label">
              {metric.label} ({min}–{max})
            </label>
            <input
              type="range"
              min={min}
              max={max}
              step={1}
              value={(value as number) ?? min}
              onChange={(e) => setValue(metric.key, parseInt(e.target.value))}
              className="mood-slider"
              disabled={disabled}
            />
            <div className="mood-labels">
              <span>{min}</span>
              <span style={{ fontWeight: 600 }}>{String(value)}</span>
              <span>{max}</span>
            </div>
          </div>
        );
      }
      case 'boolean':
        return (
          <div key={metric.key} className="switch-container">
            <span className="form-label" style={{ margin: 0 }}>
              {metric.label}
            </span>
            <label className="switch">
              <input
                type="checkbox"
                checked={value === true}
                onChange={() => setValue(metric.key, value !== true)}
                disabled={disabled}
              />
              <span className="slider"></span>
            </label>
          </div>
        );
      case 'enum': {
        const options = (metric.config.options ?? []).filter(
          (option): option is { value: string; label: string } =>
            typeof option === 'object',
        );
        return (
          <div key={metric.key} className="form-group">
            <label className="form-label">{metric.label}</label>
            <select
              className="form-input"
              value={(value as string) ?? ''}
              onChange={(e) => setValue(metric.key, e.target.value || null)}
              disabled={disabled}
            >
              {!metric.required && <option value="">—</option>}
              {options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        );
      }
      case 'duration_minutes': {
        const options = (metric.config.options ?? []).filter(
          (option): option is number => typeof option === 'number',
        );
        return (
          <div key={metric.key} className="form-group">
            <label className="form-label">{metric.label}</label>
            {options.length > 0 ? (
              <select
                className="form-input"
                value={value === null ? '' : String(value)}
                onChange={(e) =>
                  setValue(
                    metric.key,
                    e.target.value === '' ? null : parseInt(e.target.value),
                  )
                }
                disabled={disabled}
              >
                {!metric.required && <option value="">—</option>}
                {options.map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {minutes} min
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="number"
                className="form-input"
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
          </div>
        );
      }
      case 'number':
        return (
          <div key={metric.key} className="form-group">
            <label className="form-label">{metric.label}</label>
            <input
              type="number"
              className="form-input"
              min={metric.config.min}
              max={metric.config.max}
              value={value === null ? '' : String(value)}
              onChange={(e) =>
                setValue(
                  metric.key,
                  e.target.value === '' ? null : parseFloat(e.target.value),
                )
              }
              disabled={disabled}
            />
          </div>
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
            medications={medications}
            checklist={(value as ChecklistItemState[]) ?? []}
            onChange={(checklist) => setValue(metric.key, checklist)}
            disabled={disabled}
          />
        );
    }
  };

  if (loadingMetrics) {
    return (
      <div
        className="card flex-center"
        style={{ flexDirection: 'column', gap: '1rem', padding: '2rem' }}
      >
        <div
          className="spinner"
          style={{ width: '28px', height: '28px', borderWidth: '3px' }}
        ></div>
        <p style={{ color: 'hsl(var(--text-secondary))', fontSize: '0.9rem' }}>
          Carregando formulário...
        </p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="card">
        <div className="alert alert-error">
          <span>{loadError}</span>
        </div>
      </div>
    );
  }

  return (
    <form className="card" onSubmit={handleSubmit}>
      <h2>Registro Diário do Cuidador</h2>

      {status.type === 'error' && (
        <div className="alert alert-error">
          <span>{status.message}</span>
        </div>
      )}

      {geoProgress && (
        <div className="geo-loader">
          <div className="spinner"></div>
          <span>{geoProgress}</span>
        </div>
      )}

      {metrics.map(renderMetric)}

      <NotesTextarea value={notes} onChange={setNotes} disabled={disabled} />

      <button type="submit" className="btn" disabled={disabled}>
        {disabled ? 'Enviando...' : 'Enviar Registro'}
      </button>
    </form>
  );
}
