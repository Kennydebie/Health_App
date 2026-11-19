import { describe, expect, it } from 'vitest';
import { DEFAULT_METABOLIC_SETTINGS, mifflinStJeorBmr, recommendTargets, totalDailyEnergyExpenditure, kgPerWeekFromDeficit, forecastFor } from './metabolism';

const kenny = { sex: 'male' as const, age: 30, heightCm: 174, weightKg: 85.5 };

describe('Mifflin-St Jeor and TDEE', () => {
  it('matches the reference fixture for the default profile', () => {
    const bmr = mifflinStJeorBmr(kenny);
    expect(bmr).toBeCloseTo(1797.5, 1);
    expect(totalDailyEnergyExpenditure(bmr, 1.2)).toBeCloseTo(2157, 0);
    expect(totalDailyEnergyExpenditure(bmr, 1.25)).toBeCloseTo(2246.9, 0);
  });

  it('uses the female constant', () => {
    expect(mifflinStJeorBmr({ ...kenny, sex: 'female' })).toBeCloseTo(1797.5 - 166, 1);
  });

  it('converts a daily deficit into kg per week', () => {
    expect(kgPerWeekFromDeficit(550)).toBeCloseTo(0.5, 2);
  });
});

describe('target recommendation', () => {
  it('suggests ~1800 kcal and 140 g protein for the starting profile', () => {
    const result = recommendTargets({ ...kenny, goalWeightKg: 73 }, DEFAULT_METABOLIC_SETTINGS, '2026-11-02');
    expect(result.suggested.kcal).toBe(1800);
    expect(result.suggested.protein).toBe(140);
    expect(result.suggested.fat).toBe(55);
    expect(result.suggested.carbs).toBe(185);
    expect(result.suggested.fiber).toBe(30);
    expect(result.maintenanceRange[0]).toBeGreaterThanOrEqual(2150);
    expect(result.maintenanceRange[1]).toBeLessThanOrEqual(2350);
    expect(result.expectedKgPerWeek).toBeGreaterThan(0.25);
    expect(result.expectedKgPerWeek).toBeLessThan(0.5);
    // Macro energy stays consistent with the calorie target.
    const macroKcal = result.active.protein * 4 + result.active.carbs * 4 + result.active.fat * 9;
    expect(Math.abs(macroKcal - result.active.kcal)).toBeLessThan(25);
  });

  it('explains that the 12-month timeframe is slower than the calorie target', () => {
    const result = recommendTargets({ ...kenny, goalWeightKg: 73 }, DEFAULT_METABOLIC_SETTINGS, '2026-11-02');
    expect(result.forecasts.timeframe.kgPerWeek).toBeCloseTo(0.24, 2);
    expect(result.warnings.map((warning) => warning.code)).toContain('slow_timeframe');
    expect(result.forecasts.target.weeks).toBeLessThan(result.forecasts.timeframe.weeks ?? Infinity);
  });

  it('uses the timeframe pace when chosen', () => {
    const result = recommendTargets({ ...kenny, goalWeightKg: 73 }, { ...DEFAULT_METABOLIC_SETTINGS, pace: 'timeframe' }, '2026-11-02');
    expect(result.suggested.kcal).toBe(2000);
  });

  it('respects overrides and warns about aggressive deficits', () => {
    const result = recommendTargets({ ...kenny, goalWeightKg: 73 }, { ...DEFAULT_METABOLIC_SETTINGS, overrides: { kcal: 1300, protein: null, carbs: null, fat: null, fiber: null } }, '2026-11-02');
    expect(result.active.kcal).toBe(1300);
    const codes = result.warnings.map((warning) => warning.code);
    expect(codes).toContain('aggressive_deficit');
    expect(codes).toContain('below_minimum');
    expect(codes).toContain('below_bmr');
  });

  it('recalculates when the weight changes', () => {
    const lighter = recommendTargets({ ...kenny, weightKg: 80, goalWeightKg: 73 }, DEFAULT_METABOLIC_SETTINGS, '2026-11-02');
    const heavier = recommendTargets({ ...kenny, goalWeightKg: 73 }, DEFAULT_METABOLIC_SETTINGS, '2026-11-02');
    expect(lighter.tdee).toBeLessThan(heavier.tdee);
    expect(lighter.remainingKg).toBe(7);
  });

  it('forecasts no date when there is no loss', () => {
    expect(forecastFor(5, 0, '2026-11-02').date).toBeNull();
    expect(forecastFor(0, 0.4, '2026-11-02').weeks).toBe(0);
  });
});
