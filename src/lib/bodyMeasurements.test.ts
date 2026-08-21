import { describe, expect, it } from 'vitest';
import { EMPTY_BODY_MEASUREMENT_VALUES } from './fitdays';
import {
  currentWeight,
  goalProgressPercentage,
  latestBodyComposition,
  metricSeries,
  sortedMeasurements,
  startingWeight,
  targetWeightAtBodyFat,
  weightRemaining,
  withDetectedOutliers,
} from './bodyMeasurements';
import type { BodyMeasurement } from '../types/models';

function measurement(id: string, measuredAt: string, weightKg: number, changes: Partial<BodyMeasurement> = {}): BodyMeasurement {
  return {
    ...EMPTY_BODY_MEASUREMENT_VALUES,
    id,
    measuredAt,
    weightKg,
    source: 'fitdays_ai_image',
    createdAt: '2026-08-21T12:00:00.000Z',
    ...changes,
  };
}

describe('canonical body measurement selectors', () => {
  it('uses measuredAt rather than upload order or createdAt for current weight', () => {
    const current = measurement('current', '2026-08-21T08:00:00.000Z', 87.1, { createdAt: '2026-08-21T08:01:00.000Z' });
    const historical = measurement('historical', '2026-06-22T08:00:00.000Z', 90.4, { createdAt: '2026-08-22T08:01:00.000Z' });
    expect(sortedMeasurements([current, historical]).map((item) => item.id)).toEqual(['historical', 'current']);
    expect(currentWeight([current, historical])).toBe(87.1);
    expect(startingWeight([current, historical])).toBe(90.4);
  });

  it('starts a first genuine measurement at zero progress and ignores demo data', () => {
    const demo = measurement('demo_weight_1', '2026-08-01T08:00:00.000Z', 82.5, { source: 'manual', isDemo: true });
    const firstReal = measurement('real', '2026-08-21T08:00:00.000Z', 87.1, { bodyFatPercent: 28.9, fatFreeMassKg: 61.9 });
    expect(currentWeight([demo, firstReal])).toBe(87.1);
    expect(startingWeight([demo, firstReal])).toBe(87.1);
    expect(goalProgressPercentage([demo, firstReal], 75)).toBe(0);
    expect(weightRemaining([demo, firstReal], 75)).toBeCloseTo(12.1);
    expect(latestBodyComposition([demo, firstReal])?.id).toBe('real');
  });

  it('keeps actual outlier records but excludes them from the smoothed metric series', () => {
    const baseline = measurement('a', '2026-08-14T08:00:00.000Z', 87.1, { bodyFatPercent: 28.9 });
    const unusual = measurement('b', '2026-08-21T08:00:00.000Z', 86.8, { bodyFatPercent: 20 });
    const detected = withDetectedOutliers([baseline, unusual]);
    expect(detected).toHaveLength(2);
    expect(detected[1].excludedFromTrend).toContain('bodyFatPercent');
    expect(metricSeries(detected, 'bodyFatPercent')).toHaveLength(1);
    expect(metricSeries(detected, 'bodyFatPercent', true)).toHaveLength(2);
  });

  it('calculates the documented lean-mass-maintained target examples', () => {
    expect(targetWeightAtBodyFat(61.9, 20)).toBe(77.4);
    expect(targetWeightAtBodyFat(61.9, 18)).toBe(75.5);
  });
});
