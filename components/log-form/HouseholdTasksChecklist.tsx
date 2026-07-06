'use client';

import React from 'react';
import { HouseholdTasks } from '../../lib/types';
import {
  DAILY_HOUSEHOLD_TASKS,
  DailyTaskKey,
  HOUSEHOLD_TASK_LABELS,
  WEEKLY_HOUSEHOLD_TASKS,
  WeeklyTaskKey,
} from '../../lib/constants';

interface HouseholdTasksChecklistProps {
  value: HouseholdTasks;
  onChange: (value: HouseholdTasks) => void;
  showLaundry: boolean;
  showCleaning: boolean;
  showShopping: boolean;
  disabled: boolean;
}

const WEEKLY_VISIBILITY: {
  key: WeeklyTaskKey;
  showProp: keyof Pick<
    HouseholdTasksChecklistProps,
    'showLaundry' | 'showCleaning' | 'showShopping'
  >;
}[] = [
  { key: 'didLaundry', showProp: 'showLaundry' },
  { key: 'cleaningLady', showProp: 'showCleaning' },
  { key: 'groceryShopping', showProp: 'showShopping' },
];

export default function HouseholdTasksChecklist({
  value,
  onChange,
  showLaundry,
  showCleaning,
  showShopping,
  disabled,
}: HouseholdTasksChecklistProps) {
  const showMap = { showLaundry, showCleaning, showShopping };

  const toggle = (key: DailyTaskKey | WeeklyTaskKey) => {
    onChange({ ...value, [key]: !value[key] });
  };

  return (
    <div className="form-group">
      <label className="form-label">Tarefas Domésticas</label>
      {DAILY_HOUSEHOLD_TASKS.map((key) => (
        <div key={key} className="switch-container">
          <span className="form-label" style={{ margin: 0 }}>
            {HOUSEHOLD_TASK_LABELS[key]}
          </span>
          <label className="switch">
            <input
              type="checkbox"
              checked={value[key]}
              onChange={() => toggle(key)}
              disabled={disabled}
            />
            <span className="slider"></span>
          </label>
        </div>
      ))}
      {WEEKLY_HOUSEHOLD_TASKS.filter(
        (_, i) => showMap[WEEKLY_VISIBILITY[i].showProp],
      ).map((key) => (
        <div key={key} className="switch-container">
          <span className="form-label" style={{ margin: 0 }}>
            {HOUSEHOLD_TASK_LABELS[key]}
          </span>
          <label className="switch">
            <input
              type="checkbox"
              checked={value[key] === true}
              onChange={() => toggle(key)}
              disabled={disabled}
            />
            <span className="slider"></span>
          </label>
        </div>
      ))}
    </div>
  );
}
