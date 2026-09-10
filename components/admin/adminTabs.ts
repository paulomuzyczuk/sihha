import type { TranslationKey } from '../../lib/i18n/dictionaries';

export type Tab =
  | 'companion'
  | 'patient'
  | 'psychologist'
  | 'psychiatrist'
  | 'metrics'
  | 'alerts'
  | 'counting'
  | 'invite'
  | 'recipient';

/** Tabs that operate on the selected circle. */
export const CIRCLE_TABS: Tab[] = [
  'companion',
  'patient',
  'psychologist',
  'psychiatrist',
  'metrics',
  'alerts',
  'counting',
];

/** Tabs that operate platform-wide, not one circle. */
export const PLATFORM_TABS: Tab[] = ['invite', 'recipient'];

export const TAB_LABEL_KEYS: Record<Tab, TranslationKey> = {
  companion: 'admin.viewTherapist',
  patient: 'admin.viewPatient',
  psychologist: 'admin.viewPsychologist',
  psychiatrist: 'admin.viewPsychiatrist',
  metrics: 'admin.editMetrics',
  alerts: 'admin.tab.alerts',
  counting: 'admin.tab.counting',
  invite: 'admin.invite',
  recipient: 'admin.newCircle',
};
