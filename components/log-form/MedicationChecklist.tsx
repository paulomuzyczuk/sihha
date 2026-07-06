'use client';

import React from 'react';
import { MedicationChecklistItem, MedicationOption } from '../../lib/types';

interface MedicationChecklistProps {
  medications: MedicationOption[];
  checklist: MedicationChecklistItem[];
  onChange: (checklist: MedicationChecklistItem[]) => void;
  disabled: boolean;
}

export default function MedicationChecklist({
  medications,
  checklist,
  onChange,
  disabled,
}: MedicationChecklistProps) {
  if (medications.length === 0) {
    const taken = checklist[0]?.taken ?? false;
    return (
      <div className="form-group">
        <label className="form-label">Medicamentos Administrados</label>
        <div className="switch-container">
          <span className="form-label" style={{ margin: 0 }}>
            Medicamentos administrados conforme prescrição
          </span>
          <label className="switch">
            <input
              type="checkbox"
              checked={taken}
              onChange={() =>
                onChange([
                  { name: 'default', prescribedDosage: 0, taken: !taken },
                ])
              }
              disabled={disabled}
            />
            <span className="slider"></span>
          </label>
        </div>
      </div>
    );
  }

  const toggle = (index: number) => {
    const updated = checklist.map((item, i) =>
      i === index ? { ...item, taken: !item.taken } : item,
    );
    onChange(updated);
  };

  return (
    <div className="form-group">
      <label className="form-label">Medicamentos Administrados</label>
      {checklist.map((item, index) => (
        <div key={item.name} className="switch-container">
          <span className="form-label" style={{ margin: 0 }}>
            {item.name} ({item.prescribedDosage} comprimidos/dia)
          </span>
          <label className="switch">
            <input
              type="checkbox"
              checked={item.taken}
              onChange={() => toggle(index)}
              disabled={disabled}
            />
            <span className="slider"></span>
          </label>
        </div>
      ))}
    </div>
  );
}
