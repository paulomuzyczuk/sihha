export const API_ROUTES = {
  LOGS: '/api/logs',
  INVOICES: '/api/invoices',
  MEDICATIONS: '/api/medications',
  METRICS: '/api/metrics',
  LOG_AGGREGATES: '/api/logs/aggregates',
  CIRCLES: '/api/circles',
  ADMIN_INVITE: '/api/admin/invite',
  ADMIN_RECIPIENTS: '/api/admin/recipients',
} as const;

// Care-circle roles (care_team_members.role) — the M3 authorization model.
// Kept alongside ROLES below: the JWT tier now matters only for platform
// administration (ROLES.ADMIN); everything else is membership-based.
export const CARE_ROLES = {
  OWNER: 'owner',
  CAREGIVER: 'caregiver',
  CLINICIAN: 'clinician',
  RECIPIENT: 'recipient',
} as const;
export type CareRoleValue = (typeof CARE_ROLES)[keyof typeof CARE_ROLES];

// ACCESS-TIER roles, stored in the Supabase JWT app_metadata.role and used for
// authorization (route role checks + RLS policies). These are intentionally
// distinct from the CLINICAL PROFILE roles (therapist/psychologist/psychiatrist,
// lowercase) stored in user_profiles.role — access tier governs what you may do;
// profile describes who you are. The two vocabularies must not be merged.
export const ROLES = {
  ADMIN: 'ADMIN',
  THERAPIST: 'THERAPIST',
  PATIENT: 'PATIENT',
  // Read-only analytics tier for the psychologist and psychiatrist: grants the
  // aggregate dashboard, never the therapist/patient input flows. Which inputs
  // a clinician gives is decided by their clinical profile, not this tier.
  CLINICIAN: 'CLINICIAN',
} as const;

// CLINICAL PROFILE vocabulary (user_profiles.role). 'patient' is not a
// clinical profile — it exists only in the invite flow mapping below.
export const CLINICAL_PROFILES = [
  'therapist',
  'psychologist',
  'psychiatrist',
] as const;
export type ClinicalProfile = (typeof CLINICAL_PROFILES)[number];

// Single authoritative mapping from the person being invited to the access
// tier written into app_metadata.role at invite time.
export const PROFILE_ACCESS_TIER: Record<
  ClinicalProfile | 'patient',
  (typeof ROLES)[keyof typeof ROLES]
> = {
  therapist: ROLES.THERAPIST,
  psychologist: ROLES.CLINICIAN,
  psychiatrist: ROLES.CLINICIAN,
  patient: ROLES.PATIENT,
} as const;

export const ERROR_MESSAGES = {
  UNAUTHORIZED: 'Acesso não autorizado',
  VALIDATION_FAILED: 'Dados de entrada inválidos',
  RATE_LIMIT: 'Muitas requisições. Tente novamente mais tarde.',
} as const;

export const EXERCISE_TYPES = {
  WALKING: 'walking',
  RUNNING: 'running',
  GYM_SESSION: 'gym_session',
  SWIMMING: 'swimming',
} as const;

export const EXERCISE_DURATIONS = [15, 30, 45, 60, 90] as const;

export const DAILY_HOUSEHOLD_TASKS = [
  'fedPet',
  'cleanedLitter',
  'tookTrash',
  'madeBed',
  'breakfast',
  'lunch',
  'snack',
  'dinner',
] as const;

export const WEEKLY_HOUSEHOLD_TASKS = [
  'didLaundry',
  'cleaningLady',
  'groceryShopping',
] as const;

export type DailyTaskKey = (typeof DAILY_HOUSEHOLD_TASKS)[number];
export type WeeklyTaskKey = (typeof WEEKLY_HOUSEHOLD_TASKS)[number];

export const HOUSEHOLD_TASK_LABELS: Record<
  DailyTaskKey | WeeklyTaskKey,
  string
> = {
  fedPet: 'Alimentou o pet (água e ração)',
  cleanedLitter: 'Limpou a caixa de areia do gato',
  tookTrash: 'Descartou o lixo',
  madeBed: 'Fez a cama',
  breakfast: 'Tomou café da manhã',
  lunch: 'Realizou o almoço',
  snack: 'Realizou o lanche',
  dinner: 'Realizou o jantar',
  didLaundry: 'Realizou a lavagem de roupa',
  cleaningLady: 'Recebeu a diarista',
  groceryShopping: 'Realizou as compras do supermercado',
} as const;

export const EXERCISE_TYPE_LABELS: Record<
  (typeof EXERCISE_TYPES)[keyof typeof EXERCISE_TYPES],
  string
> = {
  walking: 'Caminhada',
  running: 'Corrida',
  gym_session: 'Sessão de academia',
  swimming: 'Natação',
} as const;
