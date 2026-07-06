import { MedicationStock } from '../lib/types';

/**
 * Estimates remaining pills in a package: total minus the full daily dosage for
 * each day of consumption elapsed since the package start date.
 *
 * NOTE: `daysOfConsumption` is the number of elapsed days, NOT a count of
 * actually-logged doses — the estimate assumes the full daily dosage is taken
 * every day (a worst-case / conservative assumption for low-stock alerting). The
 * sole caller (services/stockAlert.ts) passes days elapsed since package start.
 */
export function calculateRemainingPills(
  stock: MedicationStock,
  daysOfConsumption: number,
): number {
  if (daysOfConsumption < 0) {
    throw new Error(
      `calculateRemainingPills: expected non-negative daysOfConsumption, got ${daysOfConsumption}`,
    );
  }
  if (stock.dailyDosage <= 0) {
    throw new Error(
      `calculateRemainingPills: expected positive dailyDosage, got ${stock.dailyDosage}`,
    );
  }

  // Linear consumption: total pills minus (full daily dosage × days elapsed)
  const remaining =
    stock.totalPillsInPackage - daysOfConsumption * stock.dailyDosage;

  // Clamped at zero because remaining stock cannot be negative
  return Math.max(0, remaining);
}
