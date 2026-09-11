'use client';

import React, { useState } from 'react';
import { API_ROUTES } from '../lib/constants';
import { withRecipient, withViewAs } from '../lib/circles';
import {
  displayDate,
  maskDisplayDate,
  parseDisplayDate,
} from '../services/dateUtils';
import { useI18n } from '../lib/i18n/I18nProvider';
import { supabase } from './supabaseClient';
import { Button, Card, Field, Input } from './ui';

// "Notas - Sessões Anteriores" — a date lookup for the psychologist's own past
// session notes, served by /api/logs/notes (profile-scoped). Keeps the session
// history one field away without cluttering the entry flow. The dd/mm/aaaa mask
// reuses services/dateUtils, the same date handling as the clinician backdating
// field in LogForm.

interface SessionNotesLookupProps {
  // Absent → the API resolves the caller's single membership (admin views)
  recipientId?: string;
  // Platform-admin role preview — forwarded as ?view_as on every API call
  viewAs?: string | null;
  // Specialist refinement of a clinician preview (?view_profile)
  viewProfile?: string | null;
}

type LookupResult = { date: string; notes: string | null } | null;

export default function SessionNotesLookup({
  recipientId,
  viewAs,
  viewProfile,
}: SessionNotesLookupProps) {
  const { t } = useI18n();
  const [dateText, setDateText] = useState('');
  const [result, setResult] = useState<LookupResult>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const iso = dateText.length === 10 ? parseDisplayDate(dateText) : null;
  const invalid = dateText.length === 10 && iso === null;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!iso) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        setError(t('errors.unauthorized'));
        return;
      }
      const base = recipientId
        ? withRecipient(API_ROUTES.LOGS_NOTES, recipientId)
        : API_ROUTES.LOGS_NOTES;
      const withDate = `${base}${base.includes('?') ? '&' : '?'}date=${iso}`;
      const url = withViewAs(withDate, viewAs, viewProfile);
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) {
        setError(t('sessionNotes.loadError'));
        return;
      }
      const body = await res.json();
      setResult({ date: iso, notes: body.notes ?? null });
    } catch {
      setError(t('errors.server'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card wide className="stack" style={{ gap: 'var(--space-4)' }}>
      <div className="stack" style={{ gap: 'var(--space-2)' }}>
        <h3 className="t-h3">{t('sessionNotes.title')}</h3>
        <p className="t-sm t-muted">{t('sessionNotes.intro')}</p>
      </div>

      <form
        className="stack"
        style={{ gap: 'var(--space-3)' }}
        onSubmit={handleSubmit}
      >
        <Field label={t('sessionNotes.dateLabel')} htmlFor="session-note-date">
          <Input
            id="session-note-date"
            type="text"
            inputMode="numeric"
            maxLength={10}
            value={dateText}
            placeholder={t('sessionNotes.datePlaceholder')}
            onChange={(e) => setDateText(maskDisplayDate(e.target.value))}
          />
        </Field>
        {invalid && (
          <p className="t-sm" style={{ color: 'var(--danger-ink)' }}>
            {t('sessionNotes.dateInvalid')}
          </p>
        )}
        <Button
          type="submit"
          disabled={!iso || loading}
          style={{ width: 'auto' }}
        >
          {t('sessionNotes.lookup')}
        </Button>
      </form>

      {loading && <p className="t-sm t-muted">{t('sessionNotes.loading')}</p>}
      {error && <p className="t-sm t-muted">{error}</p>}
      {!loading && !error && result && result.notes && (
        <div className="stack" style={{ gap: 'var(--space-2)' }}>
          <h4 className="t-overline">
            {t('sessionNotes.found', { date: displayDate(result.date) })}
          </h4>
          <p className="t-sm" style={{ whiteSpace: 'pre-wrap' }}>
            {result.notes}
          </p>
        </div>
      )}
      {!loading && !error && result && !result.notes && (
        <p className="t-sm t-muted">
          {t('sessionNotes.empty', { date: displayDate(result.date) })}
        </p>
      )}
    </Card>
  );
}
