'use client';

import React, { useEffect, useState } from 'react';
import { API_ROUTES } from '../lib/constants';
import { withRecipient, withViewAs } from '../lib/circles';
import { displayDate } from '../services/dateUtils';
import { useI18n } from '../lib/i18n/I18nProvider';
import { Card } from './ui';

// Read-only feed of therapeutic-companion (caregiver) free-text notes, surfaced
// to the clinical team and admin (2026-07-30). The psychologist and psychiatrist
// see the last 15 days (scope 'recent'); the admin's audit view sees every
// submission (scope 'all'). Backed by /api/logs/companion-notes — the caregiver
// counterpart to the clinician-only SessionNotesLookup.

interface CompanionNote {
  id: string;
  logDate: string;
  notes: string;
  createdAt: string;
}

interface CompanionNotesFeedProps {
  accessToken: string;
  // Absent → the API resolves the caller's single membership (admin views name it)
  recipientId?: string;
  // Platform-admin role preview — forwarded as ?view_as on every API call
  viewAs?: string | null;
  scope: 'recent' | 'all';
}

export default function CompanionNotesFeed({
  accessToken,
  recipientId,
  viewAs,
  scope,
}: CompanionNotesFeedProps) {
  const { t } = useI18n();
  const [notes, setNotes] = useState<CompanionNote[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const base = recipientId
      ? withRecipient(API_ROUTES.LOGS_COMPANION_NOTES, recipientId)
      : API_ROUTES.LOGS_COMPANION_NOTES;
    const withScope = `${base}${base.includes('?') ? '&' : '?'}scope=${scope}`;
    const url = withViewAs(withScope, viewAs);
    let active = true;
    fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('load'))))
      .then((d) => active && setNotes(d.notes ?? []))
      .catch(() => active && setError(t('companionNotes.loadError')));
    return () => {
      active = false;
    };
  }, [accessToken, recipientId, viewAs, scope, t]);

  return (
    <Card wide className="stack" style={{ gap: 'var(--space-4)' }}>
      <div className="stack" style={{ gap: 'var(--space-2)' }}>
        <h3 className="t-h3">{t('companionNotes.title')}</h3>
        <p className="t-sm t-muted">
          {t(
            scope === 'all'
              ? 'companionNotes.introAll'
              : 'companionNotes.introRecent',
          )}
        </p>
      </div>

      {error && <p className="t-sm t-muted">{error}</p>}
      {!error && notes === null && (
        <p className="t-sm t-muted">{t('companionNotes.loading')}</p>
      )}
      {!error && notes !== null && notes.length === 0 && (
        <p className="t-sm t-muted">{t('companionNotes.empty')}</p>
      )}
      {!error && notes !== null && notes.length > 0 && (
        <ul
          className="stack"
          style={{
            gap: 'var(--space-4)',
            listStyle: 'none',
            padding: 0,
            margin: 0,
          }}
        >
          {notes.map((note) => (
            <li
              key={note.id}
              className="stack"
              style={{ gap: 'var(--space-1)' }}
            >
              <h4 className="t-overline">{displayDate(note.logDate)}</h4>
              <p className="t-sm" style={{ whiteSpace: 'pre-wrap' }}>
                {note.notes}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
