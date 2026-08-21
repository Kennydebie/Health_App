import { describe, expect, it } from 'vitest';
import { createSeedData } from '../data/seed';
import { migrateAppData } from './useAppData';

describe('app data migration', () => {
  it('upgrades the old program while preserving logged user data', () => {
    const saved = createSeedData();
    saved.version = 1;
    saved.program = saved.program.slice(0, 3);
    const originalFoodLog = structuredClone(saved.foodLog);
    const originalSessions = structuredClone(saved.sessions);

    const migrated = migrateAppData(saved);

    expect(migrated.version).toBe(2);
    expect(migrated.program).toHaveLength(7);
    expect(migrated.profile.trainingDays).toEqual(['Monday', 'Tuesday', 'Thursday', 'Saturday']);
    expect(migrated.foodLog).toEqual(originalFoodLog);
    expect(migrated.sessions).toEqual(originalSessions);
  });
});
