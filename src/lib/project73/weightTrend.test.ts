import { describe, expect, it } from 'vitest';
import type { BodyMeasurement } from '../../types/models';
import { emptyMeasurementValues } from '../appDataMigration';
import { addDays, dailyWeights, expectedWeightOn, observedRate, smoothedTrend, weeklyAverages, weightProgress } from './weightTrend';
import { assessProgress, type AdherenceSummary } from './progressCoach';

function measurement(date: string, weightKg: number, extra: Partial<BodyMeasurement> = {}): BodyMeasurement {
  return { ...emptyMeasurementValues, id: `m_${date}_${weightKg}`, measuredAt: `${date}T07:30:00`, weightKg, source: 'manual', createdAt: `${date}T07:30:00`, ...extra };
}

describe('weight trend', () => {
  it('averages same-day weigh-ins and skips excluded values', () => {
    const weights = dailyWeights([
      measurement('2026-11-02', 85.6),
      measurement('2026-11-02', 85.2),
      measurement('2026-11-03', 99, { excludedFromTrend: ['weightKg'] }),
    ]);
    expect(weights).toHaveLength(1);
    expect(weights[0].weightKg).toBeCloseTo(85.4, 5);
  });

  it('dampens a single-day water spike', () => {
    const weights = dailyWeights([0, 1, 2, 3, 4].map((day) => measurement(addDays('2026-11-02', day), day === 3 ? 86.5 : 85.5)));
    const trend = smoothedTrend(weights);
    expect(trend[3].trendKg).toBeLessThan(85.7);
  });

  it('measures a steady 0.5 kg per week decline', () => {
    const weights = dailyWeights(Array.from({ length: 29 }, (_, day) => measurement(addDays('2026-10-01', day), 86 - (0.5 / 7) * day)));
    const rate = observedRate(smoothedTrend(weights, 0.3));
    expect(rate?.reliable).toBe(true);
    expect(rate?.kgPerWeek).toBeCloseTo(0.5, 1);
  });

  it('reports weekly averages from Monday', () => {
    const averages = weeklyAverages(dailyWeights([measurement('2026-11-02', 85), measurement('2026-11-04', 84), measurement('2026-11-09', 83)]));
    expect(averages.map((item) => item.weekStart)).toEqual(['2026-11-02', '2026-11-09']);
    expect(averages[0].averageKg).toBe(84.5);
  });

  it('computes progress towards the goal', () => {
    const progress = weightProgress([{ date: '2026-11-30', weightKg: 83, trendKg: 83 }], 85.5, 73, 75);
    expect(progress.lostKg).toBeCloseTo(2.5);
    expect(progress.remainingKg).toBeCloseTo(10);
    expect(progress.percent).toBeCloseTo(20);
    expect(progress.milestoneReached).toBe(false);
  });

  it('gives the planned weight on a date', () => {
    expect(expectedWeightOn('2026-11-30', '2026-11-02', 85.5, 0.4, 73)).toBeCloseTo(83.9, 1);
    expect(expectedWeightOn('2028-01-01', '2026-11-02', 85.5, 0.4, 73)).toBe(73);
  });
});

const goodAdherence: AdherenceSummary = { daysWithIntake: 18, windowDays: 21, averageKcal: 1790, averageProtein: 138, plannedMeals: 60, eatenMeals: 55, skippedOrReplaced: 5 };
const unknownAdherence: AdherenceSummary = { daysWithIntake: 4, windowDays: 21, averageKcal: 1700, averageProtein: 120, plannedMeals: 60, eatenMeals: 10, skippedOrReplaced: 0 };
const base = { expectedKgPerWeek: 0.45, desiredBand: [0.25, 0.5] as [number, number], currentKg: 84, kcalTarget: 1800, proteinTarget: 140, strengthSessionsLast4Weeks: 8, strengthSessionsPrevious4Weeks: 8, daysSinceTargetChange: null };

describe('progress coach', () => {
  it('asks for more data before judging', () => {
    expect(assessProgress({ ...base, rate: null, adherence: goodAdherence }).tone).toBe('insufficient_data');
  });

  it('confirms an on-track pace in Dutch', () => {
    const result = assessProgress({ ...base, rate: { kgPerWeek: 0.33, spanDays: 28, weighIns: 10, reliable: true }, adherence: goodAdherence });
    expect(result.tone).toBe('on_track');
    expect(result.message).toContain('Dat past bij je geplande tempo');
    expect(result.calorieAdjustment).toBeNull();
  });

  it('reviews intake before changing targets on a plateau with unknown intake', () => {
    const result = assessProgress({ ...base, rate: { kgPerWeek: 0.02, spanDays: 21, weighIns: 8, reliable: true }, adherence: unknownAdherence });
    expect(result.tone).toBe('review_intake');
    expect(result.calorieAdjustment).toBeNull();
    expect(result.message).toContain('Laten we eerst je calorie-inname en activiteit bekijken');
  });

  it('suggests a small reduction only with reliable data and good adherence', () => {
    const result = assessProgress({ ...base, rate: { kgPerWeek: 0.0, spanDays: 24, weighIns: 9, reliable: true }, adherence: goodAdherence });
    expect(result.tone).toBe('stable');
    expect(result.calorieAdjustment?.deltaKcal).toBe(-100);
    const tooSoon = assessProgress({ ...base, daysSinceTargetChange: 5, rate: { kgPerWeek: 0.0, spanDays: 24, weighIns: 9, reliable: true }, adherence: goodAdherence });
    expect(tooSoon.calorieAdjustment).toBeNull();
  });

  it('protects muscle when losing too fast', () => {
    const result = assessProgress({ ...base, rate: { kgPerWeek: 1.1, spanDays: 21, weighIns: 8, reliable: true }, adherence: goodAdherence });
    expect(result.tone).toBe('faster');
    expect(result.calorieAdjustment?.deltaKcal).toBeGreaterThan(0);
  });
});
