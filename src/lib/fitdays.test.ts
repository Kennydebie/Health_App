import { describe, expect, it } from 'vitest';
import { EMPTY_BODY_MEASUREMENT_CONFIDENCE, EMPTY_BODY_MEASUREMENT_VALUES, findSimilarBodyMeasurement, parseMeasurementNumber, sanitizeFitDaysDraft, validateFitDaysMeasurement } from './fitdays';
import type { BodyMeasurement, BodyMeasurementDraft } from '../types/models';

const draft = (changes: Partial<BodyMeasurementDraft> = {}): BodyMeasurementDraft => ({
  ...EMPTY_BODY_MEASUREMENT_VALUES,
  timestamp: '2026-08-21T07:32:00.000Z',
  weightKg: 82.4,
  bodyFatPercent: 20,
  fatMassKg: 16.48,
  fatFreeMassKg: 65.92,
  muscleMassKg: 60,
  musclePercent: 72.82,
  bodyWaterKg: 44.5,
  bodyWaterPercent: 54,
  source: 'fitdays_ai_image',
  confidence: Object.fromEntries(Object.keys(EMPTY_BODY_MEASUREMENT_CONFIDENCE).map((key) => [key, .96])) as BodyMeasurementDraft['confidence'],
  issues: [],
  ...changes,
});

describe('FitDays measurement validation', () => {
  it('normalizes decimal commas and strips units', () => {
    expect(parseMeasurementNumber('82,45 kg')).toBe(82.45);
    expect(parseMeasurementNumber(' 54,2 % ')).toBe(54.2);
  });

  it('removes impossible values instead of saving them', () => {
    const result = sanitizeFitDaysDraft({
      ...draft(),
      weightKg: -14,
      bodyWaterPercent: 140,
      confidence: draft().confidence,
    });
    expect(result.weightKg).toBeNull();
    expect(result.bodyWaterPercent).toBeNull();
  });

  it('flags low confidence and non-destructive consistency problems', () => {
    const measurement = draft({ fatMassKg: 35, confidence: { ...draft().confidence, bodyFatPercent: .52 } });
    const issues = validateFitDaysMeasurement(measurement, measurement.confidence);
    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'low_confidence', field: 'bodyFatPercent' }),
      expect.objectContaining({ code: 'inconsistent', field: 'fatMassKg' }),
    ]));
    expect(measurement.fatMassKg).toBe(35);
  });

  it('detects only entries with a similar timestamp and weight', () => {
    const existing: BodyMeasurement = { ...draft(), id: 'existing', createdAt: '2026-08-21T07:33:00.000Z' };
    expect(findSimilarBodyMeasurement([existing], draft({ timestamp: '2026-08-21T07:45:00.000Z', weightKg: 82.6 }))?.id).toBe('existing');
    expect(findSimilarBodyMeasurement([existing], draft({ timestamp: '2026-08-21T09:45:00.000Z', weightKg: 82.6 }))).toBeUndefined();
    expect(findSimilarBodyMeasurement([existing], draft({ timestamp: '2026-08-21T07:45:00.000Z', weightKg: 84 }))).toBeUndefined();
  });
});

