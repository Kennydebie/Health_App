import { describe, expect, it } from 'vitest';
import { createInitialData } from '../data/initialData';
import { emptyMeasurementValues } from './appDataMigration';
import { mergeAppData, stripProductionFixtures } from './appDataIntegrity';

const food = (id: string, date = '2026-08-21') => ({ id, foodId: 'banana', date, meal: 'breakfast' as const, servingId: 'medium', quantity: 1, createdAt: `${date}T08:00:00Z` });

describe('data integrity', () => {
  it('merges local and cloud records idempotently without dropping either side', () => {
    const cloud = createInitialData();
    cloud.foodLog = [food('cloud-entry', '2026-08-20')];
    const local = createInitialData();
    local.foodLog = [food('local-entry')];

    const first = mergeAppData(cloud, local);
    const second = mergeAppData(first.data, local);
    expect(first.data.foodLog.map((entry) => entry.id).sort()).toEqual(['cloud-entry', 'local-entry']);
    expect(second.data.foodLog).toHaveLength(2);
    expect(second.duplicates).toBeGreaterThan(0);
  });

  it('flags same-ID conflicts and excludes known demonstration measurements', () => {
    const cloud = createInitialData();
    cloud.foodLog = [food('same')];
    const local = createInitialData();
    local.foodLog = [{ ...food('same'), quantity: 2 }];
    local.measurements = [{ ...emptyMeasurementValues, id: 'demo_weight_1', measuredAt: '2026-08-21T08:00:00Z', weightKg: 80, source: 'manual', createdAt: '2026-08-21T08:00:00Z', isDemo: true }];

    const merged = mergeAppData(cloud, local);
    expect(merged.conflicts).toBeGreaterThan(0);
    expect(merged.data.foodLog[0].quantity).toBe(2);
    expect(stripProductionFixtures(local).measurements).toEqual([]);
  });
});
