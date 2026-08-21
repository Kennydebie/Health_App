import { describe, expect, it } from 'vitest';
import { createSeedData } from '../data/seed';
import { migrateAppData } from './useAppData';

describe('app data migration', () => {
  const withoutWorkoutIds = (sessions: ReturnType<typeof createSeedData>['sessions']) => sessions.map((session) => ({
    id: session.id, date: session.date, dayId: session.dayId, title: session.title, startedAt: session.startedAt,
    completedAt: session.completedAt, durationSeconds: session.durationSeconds, sets: session.sets,
  }));

  it('installs the revised program while preserving every logged user-data collection', () => {
    const saved = createSeedData();
    saved.version = 3;
    saved.program = saved.program.slice(0, 3);
    const original = {
      foodLog: structuredClone(saved.foodLog), favorites: structuredClone(saved.favorites), recentFoodIds: structuredClone(saved.recentFoodIds),
      savedMeals: structuredClone(saved.savedMeals), weights: structuredClone(saved.weights), sessions: structuredClone(saved.sessions), habits: structuredClone(saved.habits),
    };

    const migrated = migrateAppData(saved);

    expect(migrated.version).toBe(6);
    expect(migrated.bodyMeasurements).toEqual([]);
    expect(migrated.program).toHaveLength(7);
    expect(migrated.program.filter((day) => !day.isRestDay).map((day) => day.title)).toEqual(['Upper A', 'Lower A', 'Upper B', 'Lower B']);
    expect(migrated.profile).toMatchObject({ balanceLevel: 'beginner', trainingTemplate: 'four-day-upper-lower' });
    expect(migrated.foodLog).toEqual(original.foodLog);
    expect(migrated.favorites).toEqual(original.favorites);
    expect(migrated.recentFoodIds).toEqual(original.recentFoodIds);
    expect(migrated.savedMeals).toEqual(original.savedMeals);
    expect(migrated.weights).toEqual(original.weights);
    expect(withoutWorkoutIds(migrated.sessions)).toEqual(withoutWorkoutIds(original.sessions));
    expect(migrated.sessions.every((session) => Boolean(session.workoutId))).toBe(true);
    expect(migrated.habits).toEqual(original.habits);
  });

  it('does not rename or rewrite historical workout records during migration', () => {
    const saved = createSeedData();
    saved.version = 3;
    saved.sessions[0] = { ...saved.sessions[0], title: 'My customized session' };
    const history = structuredClone(saved.sessions);
    const migrated = migrateAppData(saved);
    expect(migrated.sessions[0].title).toBe('My customized session');
    expect(withoutWorkoutIds(migrated.sessions)).toEqual(withoutWorkoutIds(history));
  });

  it('adds stable identities without overwriting a customized version-4 program', () => {
    const saved = createSeedData();
    saved.version = 4;
    saved.program[0] = { ...saved.program[0], workoutId: undefined, title: 'My Monday press session', focus: 'Custom focus' };
    saved.sessions[0] = { ...saved.sessions[0], workoutId: undefined as never, title: 'Old custom name' };
    const migrated = migrateAppData(saved);
    expect(migrated.program[0]).toMatchObject({ title: 'My Monday press session', focus: 'Custom focus', workoutId: 'upper_a' });
    expect(migrated.sessions[0]).toMatchObject({ title: 'Old custom name', workoutId: 'upper_a' });
  });

  it('uses a historical session name before a newer template occupying the same weekday', () => {
    const saved = createSeedData();
    saved.version = 4;
    saved.profile.trainingTemplate = 'two-day-full-body';
    saved.program[0] = { ...saved.program[0], workoutId: 'full_body_a', title: 'Full body A' };
    saved.sessions[0] = { ...saved.sessions[0], workoutId: undefined as never, title: 'Upper A', dayId: 'monday' };
    expect(migrateAppData(saved).sessions[0].workoutId).toBe('upper_a');
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
