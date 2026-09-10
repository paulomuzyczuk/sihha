'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { API_ROUTES } from '../lib/constants';
import { withRecipient, withViewAs } from '../lib/circles';
import { Button, Card, DateInput } from './ui';
import { useAdminT } from './admin/useAdminT';
import {
  careContractEditorPt,
  careContractEditorEn,
} from '../lib/i18n/dictionaries/careContractEditor';
import {
  emptyContractSection,
  moveContractItem,
  toContractDraft,
  toContractPayload,
  todayIso,
  type CareContractDraft,
  type DraftContractSection,
} from './careContractDraft';
import type { CareContract } from '../lib/careContract/types';

// Owner-facing editor for the care agreement. Built on the ordinary owner
// surface (PUT /api/care-contract) rather than an admin-only route, so a
// self-hoster gets the same screen.
//
// PUBLISHING, not editing: a save creates a new version and leaves every
// earlier one untouched. The form is seeded from the version in force, so an
// amendment means changing the current text rather than retyping the document.

interface CareContractEditorProps {
  recipientId: string;
  accessToken: string;
  viewAsOwner?: boolean;
}

const FIELD = { display: 'block', marginBottom: 'var(--space-2)' } as const;

function TextField({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <label style={FIELD}>
      <span className="form-label">{label}</span>
      {type === 'date' ? (
        <DateInput
          className="form-input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          className="form-input"
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </label>
  );
}

function RowButtons({
  t,
  onMove,
  onRemove,
}: {
  t: (k: keyof typeof careContractEditorPt) => string;
  onMove: (delta: number) => void;
  onRemove: () => void;
}) {
  return (
    <div className="row" style={{ gap: 'var(--space-2)' }}>
      <Button size="sm" variant="outline" onClick={() => onMove(-1)}>
        {t('contractEdit.moveUp')}
      </Button>
      <Button size="sm" variant="outline" onClick={() => onMove(1)}>
        {t('contractEdit.moveDown')}
      </Button>
      <Button size="sm" variant="outline" onClick={onRemove}>
        {t('contractEdit.remove')}
      </Button>
    </div>
  );
}

function SectionEditor({
  section,
  t,
  onChange,
  onRemove,
  onMove,
}: {
  section: DraftContractSection;
  t: (k: keyof typeof careContractEditorPt) => string;
  onChange: (next: DraftContractSection) => void;
  onRemove: () => void;
  onMove: (delta: number) => void;
}) {
  const setClauses = (clauses: string[]) => onChange({ ...section, clauses });
  return (
    <Card wide className="stack" style={{ gap: 'var(--space-3)' }}>
      <RowButtons t={t} onMove={onMove} onRemove={onRemove} />
      <TextField
        label={t('contractEdit.sectionTitle')}
        value={section.title}
        onChange={(v) => onChange({ ...section, title: v })}
      />
      <TextField
        label={t('contractEdit.groupTitle')}
        value={section.groupTitle}
        onChange={(v) => onChange({ ...section, groupTitle: v })}
      />
      {section.clauses.map((clause, i) => (
        <div key={i} className="stack" style={{ gap: 'var(--space-2)' }}>
          <TextField
            label={`${t('contractEdit.clause')} ${i + 1}`}
            value={clause}
            onChange={(v) =>
              setClauses(section.clauses.map((c, j) => (j === i ? v : c)))
            }
          />
          <RowButtons
            t={t}
            onMove={(delta) =>
              setClauses(moveContractItem(section.clauses, i, i + delta))
            }
            onRemove={() =>
              setClauses(section.clauses.filter((_, j) => j !== i))
            }
          />
        </div>
      ))}
      <div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setClauses([...section.clauses, ''])}
        >
          {t('contractEdit.addClause')}
        </Button>
      </div>
    </Card>
  );
}

export default function CareContractEditor({
  recipientId,
  accessToken,
  viewAsOwner = false,
}: CareContractEditorProps) {
  const t = useAdminT(careContractEditorPt, careContractEditorEn);
  const [contract, setContract] = useState<CareContract | null>(null);
  const [draft, setDraft] = useState<CareContractDraft | null>(null);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [error, setError] = useState('');

  const url = useCallback(() => {
    const base = withRecipient(API_ROUTES.CARE_CONTRACT, recipientId);
    return viewAsOwner ? withViewAs(base, 'owner') : base;
  }, [recipientId, viewAsOwner]);

  useEffect(() => {
    setDraft(null);
    setError('');
    fetch(url(), { headers: { Authorization: `Bearer ${accessToken}` } })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((body) => {
        setContract(body.contract);
        setDraft(toContractDraft(body.contract.version, todayIso(new Date())));
      })
      .catch(() => setError(t('contractEdit.loadFailed')));
  }, [url, accessToken, t]);

  if (error && !draft) return <p className="t-body">{error}</p>;
  if (!draft)
    return <p className="t-body t-muted">{t('contractEdit.loading')}</p>;

  const publish = async () => {
    setStatus('saving');
    setError('');
    try {
      const res = await fetch(url(), {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(toContractPayload(draft)),
      });
      if (!res.ok) throw new Error('save failed');
      const body = await res.json();
      // Re-seed from what was stored, so the form reflects the version that
      // now exists rather than the one it hoped to write.
      setContract(body.contract);
      setDraft(toContractDraft(body.contract.version, todayIso(new Date())));
      setStatus('saved');
    } catch {
      setStatus('idle');
      setError(t('contractEdit.saveFailed'));
    }
  };

  const current = contract?.version;

  return (
    <div className="stack" style={{ gap: 'var(--space-5)', width: '100%' }}>
      <div className="stack" style={{ gap: 'var(--space-2)' }}>
        <h3 className="t-h3">{t('contractEdit.title')}</h3>
        <p className="t-body t-muted">{t('contractEdit.intro')}</p>
        <p className="t-sm t-muted">
          {current
            ? t('contractEdit.currentVersion', {
                number: String(current.versionNumber),
                date: current.agreedOn,
              })
            : t('contractEdit.noVersion')}
        </p>
        <p className="t-sm">{t('contractEdit.startFromCurrent')}</p>
      </div>

      <Card wide className="stack" style={{ gap: 'var(--space-3)' }}>
        <TextField
          label={t('contractEdit.agreedOn')}
          type="date"
          value={draft.agreedOn}
          onChange={(v) => setDraft({ ...draft, agreedOn: v })}
        />
        <TextField
          label={t('contractEdit.allowance')}
          value={draft.monthlyAllowance}
          onChange={(v) => setDraft({ ...draft, monthlyAllowance: v })}
        />
      </Card>

      <h4 className="t-h4">{t('contractEdit.sectionsHeading')}</h4>
      {draft.sections.map((section, i) => (
        <SectionEditor
          key={i}
          section={section}
          t={t}
          onChange={(next) =>
            setDraft({
              ...draft,
              sections: draft.sections.map((s, j) => (j === i ? next : s)),
            })
          }
          onRemove={() =>
            setDraft({
              ...draft,
              sections: draft.sections.filter((_, j) => j !== i),
            })
          }
          onMove={(delta) =>
            setDraft({
              ...draft,
              sections: moveContractItem(draft.sections, i, i + delta),
            })
          }
        />
      ))}

      <Card wide className="stack" style={{ gap: 'var(--space-3)' }}>
        <h4 className="t-h4">{t('contractEdit.witnessesHeading')}</h4>
        {draft.witnesses.map((witness, i) => (
          <div key={i} className="stack" style={{ gap: 'var(--space-2)' }}>
            <TextField
              label={t('contractEdit.witnessName')}
              value={witness}
              onChange={(v) =>
                setDraft({
                  ...draft,
                  witnesses: draft.witnesses.map((w, j) => (j === i ? v : w)),
                })
              }
            />
            <RowButtons
              t={t}
              onMove={(delta) =>
                setDraft({
                  ...draft,
                  witnesses: moveContractItem(draft.witnesses, i, i + delta),
                })
              }
              onRemove={() =>
                setDraft({
                  ...draft,
                  witnesses: draft.witnesses.filter((_, j) => j !== i),
                })
              }
            />
          </div>
        ))}
        <div>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              setDraft({ ...draft, witnesses: [...draft.witnesses, ''] })
            }
          >
            {t('contractEdit.addWitness')}
          </Button>
        </div>
      </Card>

      <div className="row" style={{ gap: 'var(--space-3)' }}>
        <Button
          variant="outline"
          onClick={() =>
            setDraft({
              ...draft,
              sections: [...draft.sections, emptyContractSection()],
            })
          }
        >
          {t('contractEdit.addSection')}
        </Button>
        <Button onClick={publish} disabled={status === 'saving'}>
          {status === 'saving'
            ? t('contractEdit.saving')
            : t('contractEdit.save')}
        </Button>
        {status === 'saved' && (
          <span className="t-sm t-muted">{t('contractEdit.saved')}</span>
        )}
      </div>
      {error && <p className="t-body">{error}</p>}
    </div>
  );
}
