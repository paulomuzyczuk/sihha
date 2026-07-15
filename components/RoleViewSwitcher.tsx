'use client';

import React from 'react';
import { CARE_ROLES, CareRoleValue } from '../lib/constants';
import { useI18n } from '../lib/i18n/I18nProvider';
import type { TranslationKey } from '../lib/i18n/dictionaries';

// Option keys: plain care roles, except the clinical team which previews as
// a specific specialist (role + clinical profile compound).
const VIEW_LABEL_KEYS: Record<string, TranslationKey> = {
  owner: 'admin.viewOwner',
  caregiver: 'admin.viewTherapist',
  recipient: 'admin.viewPatient',
  'clinician:psychologist': 'admin.viewPsychologist',
  'clinician:psychiatrist': 'admin.viewPsychiatrist',
};

const viewKey = (role: CareRoleValue, profile: string | null): string =>
  role === CARE_ROLES.CLINICIAN
    ? `clinician:${profile ?? 'psychologist'}`
    : role;

interface RoleViewSwitcherProps {
  actualRole: CareRoleValue;
  actualProfile?: string | null;
  valueRole: CareRoleValue;
  valueProfile?: string | null;
  onChange: (role: CareRoleValue, profile: string | null) => void;
}

/**
 * Navbar dropdown for the platform admin to preview the selected circle as
 * another role (therapist/patient) or clinical specialist (psychologist/
 * psychiatrist). Rendered only for admins, and the server enforces the same
 * gate on the ?view_as/?view_profile params it drives (authorizeCareRequest)
 * — every other user is locked to their stored role.
 */
export default function RoleViewSwitcher({
  actualRole,
  actualProfile,
  valueRole,
  valueProfile,
  onChange,
}: RoleViewSwitcherProps) {
  const { t } = useI18n();
  const keys = Array.from(
    new Set<string>([
      viewKey(actualRole, actualProfile ?? null),
      CARE_ROLES.CAREGIVER,
      CARE_ROLES.RECIPIENT,
      `${CARE_ROLES.CLINICIAN}:psychologist`,
      `${CARE_ROLES.CLINICIAN}:psychiatrist`,
    ]),
  );

  return (
    <select
      value={viewKey(valueRole, valueProfile ?? null)}
      onChange={(e) => {
        const [role, profile] = e.target.value.split(':');
        onChange(role as CareRoleValue, profile ?? null);
      }}
      className="select"
      style={{ width: 'auto' }}
      aria-label={t('admin.viewSwitcherAria')}
    >
      {keys.map((key) => (
        <option key={key} value={key}>
          {t(VIEW_LABEL_KEYS[key])}
        </option>
      ))}
    </select>
  );
}
