import { describe, expect, it } from 'vitest';
import type { BodyMeasurement } from '../types/models';
import { createWeightLossPlan, planChartSeries, projectionPoints, weeklyActuals } from './weightLossPlan';

const blank = {
  bmi: null, bodyFatPercent: null, fatMassKg: null, fatFreeMassKg: null, muscleMassKg: null,
  musclePercent: null, skeletalMusclePercent: null, boneMassKg: null, proteinMassKg: null,
  proteinPercent: null, waterMassKg: null, bodyWaterPercent: null, subcutaneousFatPercent: null,
  visceralFatIndex: null, bmrKcal: null, bodyAge: null, waistCircumferenceCm: null,
};

function measurement(id: string, date: string, weightKg: number, extra: Partial<BodyMeasurement> = {}): BodyMeasurement {
  return { ...blank, id, measuredAt: `${date}T08:00:00Z`, weightKg, source: 'fitdays_ai_image', createdAt: `${date}T08:05:00Z`, ...extra };
}

const baseline = measurement('baseline', '2026-06-22', 87.1, { bodyFatPercent: 28.9, fatMassKg: 25.2, fatFreeMassKg: 61.9, muscleMassKg: 58 });
const plan = createWeightLossPlan({ id: 'plan_1', measurement: baseline, goalWeightKg: 75, weeklyRatePct: 0.8, planStartDate: '2026-06-22', version: 1, now: '2026-06-22T09:00:00Z' });

describe('weight-loss target plan', () => {
  it('shows one actual baseline point and a complete target path that stops at the goal', () => {
    const series = planChartSeries(plan, [baseline], 'weightKg');
    expect(series.filter((point) => point.actual != null)).toHaveLength(1);
    expect(series[0].actual).toBe(87.1);
    expect(series.at(-1)?.target).toBe(75);
    expect(series.every((point) => point.target == null || point.target >= 75)).toBe(true);
  });

  it('creates the first comparison after a second confirmed week and leaves missing weeks empty', () => {
    const second = measurement('week_2', '2026-07-06', 85.8);
    const series = planChartSeries(plan, [baseline, second], 'weightKg');
    expect(series[1].actual).toBeNull();
    expect(series[2].actual).toBe(85.8);
    expect(series[2].status).not.toBe('Not enough data');
  });

  it('uses the weekly median without changing raw measurements', () => {
    const readings = [measurement('a', '2026-06-29', 86.6), measurement('b', '2026-07-01', 86.2), measurement('c', '2026-07-03', 87.4)];
    const before = structuredClone(readings);
    expect(weeklyActuals(readings, 'weightKg')[0]).toMatchObject({ value: 86.6, readingCount: 3 });
    expect(readings).toEqual(before);
  });

  it('projects fat mass and body fat from maintained fat-free mass', () => {
    const last = projectionPoints(plan).at(-1)!;
    expect(last.fatFreeMassKg).toBe(61.9);
    expect(last.fatMassKg).toBeCloseTo(13.1, 5);
    expect(last.bodyFatPercent).toBeCloseTo(17.47, 1);
  });

  it('uses maintenance references for fat-free and muscle mass', () => {
    expect(planChartSeries(plan, [baseline], 'fatFreeMassKg').every((point) => point.target == null && point.maintenanceTarget === 61.9)).toBe(true);
    expect(planChartSeries(plan, [baseline], 'muscleMassKg').every((point) => point.target == null && point.maintenanceTarget === 58)).toBe(true);
  });

  it('keeps projections out of the measurement collection', () => {
    const saved = [baseline];
    const before = structuredClone(saved);
    planChartSeries(plan, saved, 'bodyFatPercent');
    expect(saved).toEqual(before);
  });
});
