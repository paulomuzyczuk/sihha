'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { API_ROUTES } from '../lib/constants';
import { withRecipient, withViewAs } from '../lib/circles';
import { Button, Card } from './ui';
import { useAdminT } from './admin/useAdminT';
import {
  crisisEditorPt,
  crisisEditorEn,
} from '../lib/i18n/dictionaries/crisisEditor';
import {
  emptyContact,
  emptyProtocol,
  emptyStep,
  moveItem,
  removeContact,
  toDraft,
  toPayload,
  type CrisisPlanDraft,
  type DraftProtocol,
  type DraftStep,
} from './crisisPlanDraft';

// Owner-facing editor for the crisis plan. Mounted in the admin console, but
// built on the ordinary owner surface (PUT /api/crisis-plan) rather than an
// admin-only route — a self-hoster with no institution layer needs this screen
// just as much, and it is the only way to maintain the plan without a
// developer.
//
// The list manipulations live in crisisPlanDraft.ts as tested pure functions:
// a reorder that drops a step, or a contact deletion that repoints a call step
// at the wrong person, are silent corruptions of a document read mid-episode.

interface CrisisPlanEditorProps {
  recipientId: string;
  accessToken: string;
  /** Sent as view_as so a platform admin is authorized as the circle's owner. */
  viewAsOwner?: boolean;
}

const FIELD = { display: 'block', marginBottom: 'var(--space-2)' } as const;

function TextField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label style={FIELD}>
      <span className="form-label">{label}</span>
      <input
        className="form-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function StepRow({
  step,
  contacts,
  t,
  onChange,
  onRemove,
  onMove,
}: {
  step: DraftStep;
  contacts: CrisisPlanDraft['contacts'];
  t: (k: keyof typeof crisisEditorPt) => string;
  onChange: (next: DraftStep) => void;
  onRemove: () => void;
  onMove: (delta: number) => void;
}) {
  return (
    <li className="stack" style={{ gap: 'var(--space-2)' }}>
      <TextField
        label={t('crisisEdit.stepText')}
        value={step.text ?? ''}
        onChange={(v) => onChange({ ...step, text: v })}
      />
      <label style={FIELD}>
        <span className="form-label">{t('crisisEdit.stepContact')}</span>
        <select
          className="form-input"
          value={step.contactIndex ?? ''}
          onChange={(e) =>
            onChange({
              ...step,
              contactIndex:
                e.target.value === '' ? null : Number(e.target.value),
            })
          }
        >
          <option value="">{t('crisisEdit.noContact')}</option>
          {contacts.map((contact, i) => (
            <option key={i} value={i}>
              {contact.name || `#${i + 1}`}
            </option>
          ))}
        </select>
      </label>
      <TextField
        label={t('crisisEdit.stepRole')}
        value={step.roleLabel ?? ''}
        onChange={(v) => onChange({ ...step, roleLabel: v })}
      />
      <label className="row" style={{ gap: 'var(--space-2)' }}>
        <input
          type="checkbox"
          checked={step.isFallback}
          onChange={(e) => onChange({ ...step, isFallback: e.target.checked })}
        />
        <span className="t-sm">{t('crisisEdit.stepFallback')}</span>
      </label>
      <div className="row" style={{ gap: 'var(--space-2)' }}>
        <Button size="sm" variant="outline" onClick={() => onMove(-1)}>
          {t('crisisEdit.moveUp')}
        </Button>
        <Button size="sm" variant="outline" onClick={() => onMove(1)}>
          {t('crisisEdit.moveDown')}
        </Button>
        <Button size="sm" variant="outline" onClick={onRemove}>
          {t('crisisEdit.remove')}
        </Button>
      </div>
    </li>
  );
}

function ProtocolCard({
  protocol,
  index,
  contacts,
  t,
  onChange,
  onRemove,
  onMove,
}: {
  protocol: DraftProtocol;
  index: number;
  contacts: CrisisPlanDraft['contacts'];
  t: (k: keyof typeof crisisEditorPt) => string;
  onChange: (next: DraftProtocol) => void;
  onRemove: () => void;
  onMove: (delta: number) => void;
}) {
  const setSteps = (steps: DraftStep[]) => onChange({ ...protocol, steps });
  return (
    <Card wide className="stack" style={{ gap: 'var(--space-3)' }}>
      <div className="row" style={{ gap: 'var(--space-2)' }}>
        <strong className="t-body">#{index + 1}</strong>
        <Button size="sm" variant="outline" onClick={() => onMove(-1)}>
          {t('crisisEdit.moveUp')}
        </Button>
        <Button size="sm" variant="outline" onClick={() => onMove(1)}>
          {t('crisisEdit.moveDown')}
        </Button>
        <Button size="sm" variant="outline" onClick={onRemove}>
          {t('crisisEdit.remove')}
        </Button>
      </div>
      <TextField
        label={t('crisisEdit.protocolTitle')}
        value={protocol.title}
        onChange={(v) => onChange({ ...protocol, title: v })}
      />
      <TextField
        label={t('crisisEdit.slug')}
        value={protocol.slug}
        onChange={(v) => onChange({ ...protocol, slug: v })}
      />
      <TextField
        label={t('crisisEdit.sectionTitle')}
        value={protocol.sectionTitle ?? ''}
        onChange={(v) => onChange({ ...protocol, sectionTitle: v })}
      />
      <TextField
        label={t('crisisEdit.responsible')}
        value={protocol.responsible ?? ''}
        onChange={(v) => onChange({ ...protocol, responsible: v })}
      />
      <TextField
        label={t('crisisEdit.note')}
        value={protocol.note ?? ''}
        onChange={(v) => onChange({ ...protocol, note: v })}
      />
      <TextField
        label={t('crisisEdit.facilityName')}
        value={protocol.facilityName ?? ''}
        onChange={(v) => onChange({ ...protocol, facilityName: v })}
      />
      <TextField
        label={t('crisisEdit.facilityCity')}
        value={protocol.facilityCity ?? ''}
        onChange={(v) => onChange({ ...protocol, facilityCity: v })}
      />
      <TextField
        label={t('crisisEdit.facilityTransport')}
        value={protocol.facilityTransport ?? ''}
        onChange={(v) => onChange({ ...protocol, facilityTransport: v })}
      />
      <ol className="stack" style={{ gap: 'var(--space-4)' }}>
        {protocol.steps.map((step, i) => (
          <StepRow
            key={i}
            step={step}
            contacts={contacts}
            t={t}
            onChange={(next) =>
              setSteps(protocol.steps.map((s, j) => (j === i ? next : s)))
            }
            onRemove={() => setSteps(protocol.steps.filter((_, j) => j !== i))}
            onMove={(delta) => setSteps(moveItem(protocol.steps, i, i + delta))}
          />
        ))}
      </ol>
      <div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setSteps([...protocol.steps, emptyStep()])}
        >
          {t('crisisEdit.addStep')}
        </Button>
      </div>
    </Card>
  );
}

export default function CrisisPlanEditor({
  recipientId,
  accessToken,
  viewAsOwner = false,
}: CrisisPlanEditorProps) {
  const t = useAdminT(crisisEditorPt, crisisEditorEn);
  const [draft, setDraft] = useState<CrisisPlanDraft | null>(null);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [error, setError] = useState('');

  const url = useCallback(() => {
    const base = withRecipient(API_ROUTES.CRISIS_PLAN, recipientId);
    return viewAsOwner ? withViewAs(base, 'owner') : base;
  }, [recipientId, viewAsOwner]);

  useEffect(() => {
    setDraft(null);
    setError('');
    fetch(url(), { headers: { Authorization: `Bearer ${accessToken}` } })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((body) => setDraft(toDraft(body.plan)))
      .catch(() => setError(t('crisisEdit.loadFailed')));
  }, [url, accessToken, t]);

  if (error && !draft) return <p className="t-body">{error}</p>;
  if (!draft)
    return <p className="t-body t-muted">{t('crisisEdit.loading')}</p>;

  const save = async () => {
    setStatus('saving');
    setError('');
    try {
      const res = await fetch(url(), {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(toPayload(draft)),
      });
      if (!res.ok) throw new Error('save failed');
      // Re-seed from what the server stored, never from the local copy — the
      // editor must show the plan that exists, not the one it hoped to write.
      setDraft(toDraft((await res.json()).plan));
      setStatus('saved');
    } catch {
      setStatus('idle');
      setError(t('crisisEdit.saveFailed'));
    }
  };

  const dropContact = (i: number) => {
    const result = removeContact(draft, i);
    if (!result.removed) {
      setError(t('crisisEdit.contactInUse'));
      return;
    }
    setError('');
    setDraft(result.draft);
  };

  return (
    <div className="stack" style={{ gap: 'var(--space-5)', width: '100%' }}>
      <div className="stack" style={{ gap: 'var(--space-2)' }}>
        <h3 className="t-h3">{t('crisisEdit.title')}</h3>
        <p className="t-body t-muted">{t('crisisEdit.intro')}</p>
        <p className="t-sm">{t('crisisEdit.reviewWarning')}</p>
      </div>

      <Card wide className="stack" style={{ gap: 'var(--space-3)' }}>
        <h4 className="t-h4">{t('crisisEdit.contactsHeading')}</h4>
        {draft.contacts.map((contact, i) => (
          <div key={i} className="stack" style={{ gap: 'var(--space-2)' }}>
            <TextField
              label={t('crisisEdit.name')}
              value={contact.name}
              onChange={(v) =>
                setDraft({
                  ...draft,
                  contacts: draft.contacts.map((c, j) =>
                    j === i ? { ...c, name: v } : c,
                  ),
                })
              }
            />
            <TextField
              label={t('crisisEdit.phone')}
              value={contact.phone}
              onChange={(v) =>
                setDraft({
                  ...draft,
                  contacts: draft.contacts.map((c, j) =>
                    j === i ? { ...c, phone: v } : c,
                  ),
                })
              }
            />
            <label className="row" style={{ gap: 'var(--space-2)' }}>
              <input
                type="checkbox"
                checked={contact.whatsappOnly}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    contacts: draft.contacts.map((c, j) =>
                      j === i ? { ...c, whatsappOnly: e.target.checked } : c,
                    ),
                  })
                }
              />
              <span className="t-sm">{t('crisisEdit.whatsappOnly')}</span>
            </label>
            <div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => dropContact(i)}
              >
                {t('crisisEdit.remove')}
              </Button>
            </div>
          </div>
        ))}
        <div>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              setDraft({
                ...draft,
                contacts: [...draft.contacts, emptyContact()],
              })
            }
          >
            {t('crisisEdit.addContact')}
          </Button>
        </div>
      </Card>

      <h4 className="t-h4">{t('crisisEdit.protocolsHeading')}</h4>
      {draft.protocols.length === 0 && (
        <p className="t-body t-muted">{t('crisisEdit.empty')}</p>
      )}
      {draft.protocols.map((protocol, i) => (
        <ProtocolCard
          key={i}
          protocol={protocol}
          index={i}
          contacts={draft.contacts}
          t={t}
          onChange={(next) =>
            setDraft({
              ...draft,
              protocols: draft.protocols.map((p, j) => (j === i ? next : p)),
            })
          }
          onRemove={() =>
            setDraft({
              ...draft,
              protocols: draft.protocols.filter((_, j) => j !== i),
            })
          }
          onMove={(delta) =>
            setDraft({
              ...draft,
              protocols: moveItem(draft.protocols, i, i + delta),
            })
          }
        />
      ))}

      <div className="row" style={{ gap: 'var(--space-3)' }}>
        <Button
          variant="outline"
          onClick={() =>
            setDraft({
              ...draft,
              protocols: [...draft.protocols, emptyProtocol()],
            })
          }
        >
          {t('crisisEdit.addProtocol')}
        </Button>
        <Button onClick={save} disabled={status === 'saving'}>
          {status === 'saving' ? t('crisisEdit.saving') : t('crisisEdit.save')}
        </Button>
        {status === 'saved' && (
          <span className="t-sm t-muted">{t('crisisEdit.saved')}</span>
        )}
      </div>
      {error && <p className="t-body">{error}</p>}
    </div>
  );
}
