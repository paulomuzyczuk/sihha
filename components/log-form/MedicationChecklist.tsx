'use client';

import React from 'react';
import { useI18n } from '../../lib/i18n/I18nProvider';
import { MedicationChecklistItem, MedicationOption } from '../../lib/types';
import { Icon, Pill, PillGroup } from '../ui';

interface MedicationChecklistProps {
  medications: MedicationOption[];
  checklist: MedicationChecklistItem[];
  onChange: (checklist: MedicationChecklistItem[]) => void;
  disabled: boolean;
}

// One tri-state per medication: each starts unanswered and takes an
// explicit Sim/Não, like every other yes/no in the check-in.

function TriState({
  label,
  taken,
  onSelect,
  disabled,
}: {
  label: string;
  taken: boolean | null;
  onSelect: (taken: boolean) => void;
  disabled: boolean;
}) {
  const { t } = useI18n();
  return (
    <div
      className="row"
      style={{
        justifyContent: 'space-between',
        gap: 'var(--space-3)',
        flexWrap: 'wrap',
      }}
    >
      <span className="t-sm">{label}</span>
      <PillGroup role="group" aria-label={label}>
        <Pill
          active={taken === true}
          onClick={() => onSelect(true)}
          disabled={disabled}
        >
          <Icon name="check" size={16} />
          {t('logForm.yes')}
        </Pill>
        <Pill
          active={taken === false}
          onClick={() => onSelect(false)}
          disabled={disabled}
        >
          {t('logForm.no')}
        </Pill>
      </PillGroup>
    </div>
  );
}

export default function MedicationChecklist({
  medications,
  checklist,
  onChange,
  disabled,
}: MedicationChecklistProps) {
  const { t } = useI18n();

  const setTaken = (index: number, taken: boolean) =>
    onChange(
      checklist.map((item, i) => (i === index ? { ...item, taken } : item)),
    );

  if (medications.length === 0) {
    return (
      <div className="form-group">
        <span className="field-label">{t('meds.title')}</span>
        <TriState
          label={t('meds.asPrescribed')}
          taken={checklist[0]?.taken ?? null}
          onSelect={(taken) =>
            onChange([{ name: 'default', prescribedDosage: 0, taken }])
          }
          disabled={disabled}
        />
      </div>
    );
  }

  return (
    <div className="form-group">
      <span className="field-label">{t('meds.title')}</span>
      <div className="stack" style={{ gap: 'var(--space-3)' }}>
        {checklist.map((item, index) => (
          <TriState
            key={item.name}
            label={t('meds.perDay', {
              name: item.name,
              dosage: item.prescribedDosage,
            })}
            taken={item.taken}
            onSelect={(taken) => setTaken(index, taken)}
            disabled={disabled}
          />
        ))}
      </div>
    </div>
  );
}
