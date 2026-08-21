import { describe, expect, it } from 'vitest';
import { createSeedData } from '../data/seed';
import { migrateAppData } from './useAppData';

describe('app data migration', () => {
  it('installs the revised program while preserving every logged user-data collection', () => {
    const saved = createSeedData();
    saved.version = 3;
    saved.program = saved.program.slice(0, 3);
    const original = {
      foodLog: structuredClone(saved.foodLog), favorites: structuredClone(saved.favorites), recentFoodIds: structuredClone(saved.recentFoodIds),
      savedMeals: structuredClone(saved.savedMeals), weights: structuredClone(saved.weights), sessions: structuredClone(saved.sessions), habits: structuredClone(saved.habits),
    };

    const migrated = migrateAppData(saved);

    expect(migrated.version).toBe(4);
    expect(migrated.program).toHaveLength(7);
    expect(migrated.program.filter((day) => !day.isRestDay).map((day) => day.title)).toEqual(['Upper A', 'Lower A', 'Upper B', 'Lower B']);
    expect(migrated.profile).toMatchObject({ balanceLevel: 'beginner', trainingTemplate: 'four-day-upper-lower' });
    expect(migrated.foodLog).toEqual(original.foodLog);
    expect(migrated.favorites).toEqual(original.favorites);
    expect(migrated.recentFoodIds).toEqual(original.recentFoodIds);
    expect(migrated.savedMeals).toEqual(original.savedMeals);
    expect(migrated.weights).toEqual(original.weights);
    expect(migrated.sessions).toEqual(original.sessions);
    expect(migrated.habits).toEqual(original.habits);
  });

  it('does not rename or rewrite historical workout records during migration', () => {
    const saved = createSeedData();
    saved.version = 3;
    saved.sessions[0] = { ...saved.sessions[0], title: 'My customized session' };
    const history = structuredClone(saved.sessions);
    expect(migrateAppData(saved).sessions).toEqual(history);
  });

  it('preserves program-editor fields through a JSON storage round trip', () => {
    const saved = createSeedData();
    saved.program[0].exercises[0] = { ...saved.program[0].exercises[0], sets: 4, restSeconds: 210, rir: '3', notes: 'Custom note', warmupSets: 4 };
    const reloaded = migrateAppData(JSON.parse(JSON.stringify(saved)));
    expect(reloaded.program[0].exercises[0]).toMatchObject({ sets: 4, restSeconds: 210, rir: '3', notes: 'Custom note', warmupSets: 4 });
    expect(reloaded.foodLog).toEqual(saved.foodLog);
    expect(reloaded.weights).toEqual(saved.weights);
    expect(reloaded.sessions).toEqual(saved.sessions);
  });
});
