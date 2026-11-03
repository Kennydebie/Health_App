import { describe, expect, it } from 'vitest';
import { createSeedData } from '../../data/seed';
import { createInitialData } from '../../data/initialData';
import { migrateAppData } from '../appDataMigration';
import { validateAppData, mergeAppData } from '../appDataIntegrity';
import type { AppData } from '../../types/models';

function project75Payload(): AppData {
  const seed = createSeedData();
  const legacy = structuredClone(seed) as Partial<AppData> & AppData;
  for (const key of ['upgradeNotice', 'metabolicSettings', 'planningPreferences', 'mealPlans', 'customRecipes', 'favoriteRecipeIds', 'pantry', 'shoppingStatus'] as const) delete legacy[key];
  legacy.version = 12;
  legacy.profile = { ...legacy.profile, age: 29, goalWeightKg: 75, calorieTarget: 2100, proteinTarget: 170, carbTarget: 205, fatTarget: 67 };
  legacy.activeGoal = { ...legacy.activeGoal, name: 'Project 75', targetWeightKg: 75, targetRangeKg: [74.5, 75.5] };
  return legacy;
}

describe('Project 75 → Project 73 upgrade', () => {
  it('moves the goal to 73 kg and keeps every history record', () => {
    const legacy = project75Payload();
    const upgraded = migrateAppData(legacy);
    expect(upgraded.version).toBe(13);
    expect(upgraded.profile.goalWeightKg).toBe(73);
    expect(upgraded.profile.age).toBe(30);
    expect(upgraded.activeGoal).toMatchObject({ name: 'Project 73', targetWeightKg: 73 });
    expect(upgraded.metabolicSettings.previousGoalWeightKg).toBe(75);
    expect(upgraded.measurements.map((item) => item.id)).toEqual(expect.arrayContaining(legacy.measurements.filter((item) => !item.isDemo).map((item) => item.id)));
    expect(upgraded.foodLog).toHaveLength(legacy.foodLog.length);
    expect(upgraded.sessions).toHaveLength(legacy.sessions.length);
    expect(upgraded.mealPlans).toEqual([]);
    expect(upgraded.upgradeNotice?.changes.join(' ')).toContain('75 kg naar 73 kg');
    expect(validateAppData(upgraded).valid).toBe(true);
  });

  it('replaces untouched Project 75 default targets with the new calculation', () => {
    const upgraded = migrateAppData(project75Payload());
    expect(upgraded.profile.calorieTarget).toBeLessThan(2100);
    expect(upgraded.profile.proteinTarget).toBeLessThan(170);
    expect(upgraded.upgradeNotice?.pendingTargets).toBeNull();
  });

  it('keeps targets the user edited and offers the suggestion for review', () => {
    const legacy = project75Payload();
    legacy.profile = { ...legacy.profile, calorieTarget: 1950, proteinTarget: 160 };
    const upgraded = migrateAppData(legacy);
    expect(upgraded.profile.calorieTarget).toBe(1950);
    expect(upgraded.profile.proteinTarget).toBe(160);
    expect(upgraded.upgradeNotice?.pendingTargets?.kcal).toBeGreaterThan(1500);
  });

  it('is idempotent and does not touch data that is already Project 73', () => {
    const once = migrateAppData(project75Payload());
    const twice = migrateAppData(structuredClone(once));
    expect(twice.profile).toEqual(once.profile);
    expect(twice.upgradeNotice).toEqual(once.upgradeNotice);
    const fresh = createInitialData();
    expect(fresh.version).toBe(13);
    expect(fresh.profile).toMatchObject({ age: 30, goalWeightKg: 73, calorieTarget: 1800, proteinTarget: 140 });
    expect(migrateAppData(fresh).upgradeNotice).toBeNull();
  });

  it('merges meal plans by last update and unions favourites', () => {
    const base = createInitialData();
    const plan = { id: 'p1', startDate: '2026-11-02', days: 3, createdAt: '2026-11-02T08:00:00Z', updatedAt: '2026-11-02T08:00:00Z', generator: 'deterministic' as const, seed: 1, targets: { kcal: 1800, protein: 140 }, status: 'active' as const, meals: [] };
    const remote = { ...base, mealPlans: [{ ...plan, updatedAt: '2026-11-02T09:00:00Z', days: 7 }], favoriteRecipeIds: ['a'] };
    const local = { ...base, mealPlans: [plan], favoriteRecipeIds: ['b'] };
    const merged = mergeAppData(remote, local).data;
    expect(merged.mealPlans[0].days).toBe(7);
    expect(merged.favoriteRecipeIds.sort()).toEqual(['a', 'b']);
  });
});
