import { calculateRemainingPills } from '../../services/stock';
import { MedicationStock } from '../../lib/types';

describe('calculateRemainingPills', () => {
  const mockStock: MedicationStock = {
    id: 'stock-1',
    name: 'Olanzapine',
    packageStartDate: '2026-05-10T00:00:00Z',
    totalPillsInPackage: 30,
    dailyDosage: 2,
  };

  it('should calculate remaining pills correctly when medication is taken', () => {
    // 5 logs with meds taken means 5 * 2 = 10 pills taken. 30 - 10 = 20 remaining.
    const result = calculateRemainingPills(mockStock, 5);
    expect(result).toBe(20);
  });

  it('should return total pills if no medication logs are provided', () => {
    const result = calculateRemainingPills(mockStock, 0);
    expect(result).toBe(30);
  });

  it('should clamp remaining pills to 0 if count exceeds total', () => {
    // 20 logs * 2 dailyDosage = 40 pills. Exceeds 30. Should be clamped to 0.
    const result = calculateRemainingPills(mockStock, 20);
    expect(result).toBe(0);
  });

  it('should throw an error if daysOfConsumption is negative', () => {
    expect(() => {
      calculateRemainingPills(mockStock, -1);
    }).toThrow(
      'calculateRemainingPills: expected non-negative daysOfConsumption, got -1',
    );
  });

  it('should throw an error if dailyDosage is non-positive', () => {
    const invalidStock = { ...mockStock, dailyDosage: 0 };
    expect(() => {
      calculateRemainingPills(invalidStock, 5);
    }).toThrow('calculateRemainingPills: expected positive dailyDosage, got 0');
  });
});
