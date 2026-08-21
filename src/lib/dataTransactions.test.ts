import { describe, expect, it } from 'vitest';
import { createInitialData } from '../data/initialData';
import { applyBodyMeasurement } from './dataTransactions';
import { emptyMeasurementValues } from './appDataMigration';
import { getDashboardSummary } from './selectors';

describe('body measurement transaction', () => {
  it('propagates a reviewed FitDays measurement to body KPIs while preserving goals', () => {
    const data = createInitialData();
    data.bodyGoals = { ...data.bodyGoals, waistTargetCm: 82, muscleMassTargetKg: 61 };
    const next = applyBodyMeasurement(data, {
      ...emptyMeasurementValues,
      measuredAt: '2026-08-21T07:30:00+02:00',
      weightKg: 81.4,
      bodyFatPercent: 19.2,
      fatFreeMassKg: 65.8,
      muscleMassKg: 59.6,
      source: 'fitdays_ai_image',
    }, { id: 'fitdays-1', now: '2026-08-21T07:31:00Z' });
    const dashboard = getDashboardSummary(next, '2026-08-21');

    expect(next.measurements).toHaveLength(1);
    expect(dashboard.body.currentWeight).toBe(81.4);
    expect(dashboard.body.startingWeight).toBe(81.4);
    expect(next.bodyGoals).toMatchObject({ waistTargetCm: 82, muscleMassTargetKg: 61, fatFreeMassTargetKg: 65.8 });
  });
});
