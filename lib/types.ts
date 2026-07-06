export type UserRole = 'ADMIN' | 'THERAPIST' | 'PATIENT' | 'CLINICIAN';

export type ExerciseType = 'walking' | 'running' | 'gym_session' | 'swimming';
export type ExerciseDuration = 15 | 30 | 45 | 60 | 90;
export type AppointmentType = 'psychologist' | 'psychiatrist';

export interface Location {
  lat: number; // Must be between -90 and 90
  lng: number; // Must be between -180 and 180
  accuracy?: number; // Optional
}

// One entry per medication in medication_stocks; linked by name
export interface MedicationChecklistItem {
  name: string;
  prescribedDosage: number;
  taken: boolean;
}

export interface ExerciseEntry {
  type: ExerciseType;
  durationMinutes: ExerciseDuration;
}

export interface AppointmentEntry {
  type: AppointmentType;
  attended: boolean;
}

export interface SleepData {
  start: string; // HH:MM — bedtime
  end: string; // HH:MM — wake time
  hours: number; // computed server-side from start/end
}

export interface HouseholdTasks {
  // Daily — always required
  fedPet: boolean;
  cleanedLitter: boolean;
  tookTrash: boolean;
  madeBed: boolean;
  // Meals — tracked individually
  breakfast: boolean;
  lunch: boolean;
  snack: boolean;
  dinner: boolean;
  // Weekly — null when it is not that task's configured day
  didLaundry: boolean | null;
  cleaningLady: boolean | null;
  groceryShopping: boolean | null;
}

// Shape returned by GET /api/medications
export interface MedicationOption {
  name: string;
  dailyDosage: number;
}

export interface CareLogPayload {
  moodScore: number; // 1-5 scale
  medicationChecklist: MedicationChecklistItem[]; // replaces medicationTaken boolean
  sleepData: Pick<SleepData, 'start' | 'end'>; // hours computed server-side
  exercise: ExerciseEntry | null; // null = no exercise today
  householdTasks: HouseholdTasks;
  appointment: AppointmentEntry | null; // null = no appointment today
  notes?: string; // Optional, max 1000 characters
  location?: Location; // Optional — null stored when unavailable or denied
}

export interface CareLogResponse {
  id: string;
  createdAt: string;
}

export interface InvoicePayload {
  amount: number;
  fileUrl: string; // URL from object storage upload
  location: Location;
}

export interface InvoiceResponse {
  id: string;
  createdAt: string;
}

export interface MedicationStock {
  id: string;
  name: string;
  packageStartDate: string; // ISO 8601 Date
  totalPillsInPackage: number;
  dailyDosage: number;
}
