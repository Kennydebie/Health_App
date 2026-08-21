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
      savedMeals: structuredClone(saved.savedMeals), measurements: structuredClone(saved.measurements), sessions: structuredClone(saved.sessions), habits: structuredClone(saved.habits),
      nutritionTargetHistory: structuredClone(saved.nutritionTargetHistory), nutritionSettings: structuredClone(saved.nutritionSettings), nutritionDayRecords: structuredClone(saved.nutritionDayRecords),
    };

    const migrated = migrateAppData(saved);

    expect(migrated.version).toBe(9);
    expect(migrated.program).toHaveLength(7);
    expect(migrated.program.filter((day) => !day.isRestDay).map((day) => day.title)).toEqual(['Upper A', 'Lower A', 'Upper B', 'Lower B']);
    expect(migrated.profile).toMatchObject({ balanceLevel: 'beginner', trainingTemplate: 'four-day-upper-lower' });
    expect(migrated.foodLog).toEqual(original.foodLog);
    expect(migrated.favorites).toEqual(original.favorites);
    expect(migrated.recentFoodIds).toEqual(original.recentFoodIds);
    expect(migrated.savedMeals).toEqual(original.savedMeals);
    expect(migrated.nutritionTargetHistory).toEqual(original.nutritionTargetHistory);
    expect(migrated.nutritionSettings).toEqual(original.nutritionSettings);
    expect(migrated.nutritionDayRecords).toEqual(original.nutritionDayRecords);
    expect(migrated.measurements).toEqual(original.measurements);
    expect(withoutWorkoutIds(migrated.sessions)).toEqual(withoutWorkoutIds(original.sessions));
    expect(migrated.sessions.every((session) => Boolean(session.workoutId))).toBe(true);
    expect(migrated.habits).toEqual(original.habits);
    expect(migrated.trainingPlanner.dailyPlans).toHaveLength(7);
    expect(migrated.trainingPlanner.weeklyTargets).toMatchObject({ upperSessions: 2, lowerSessions: 2, strengthSessions: 4 });
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
    expect(reloaded.measurements).toEqual(saved.measurements);
    expect(reloaded.sessions).toEqual(saved.sessions);
  });

  it('reconciles legacy split collections without duplicating a FitDays weight', () => {
    const seed = createSeedData();
    const base = { ...seed };
    delete (base as Partial<typeof seed>).measurements;
    delete (base as Partial<typeof seed>).bodyGoals;
    const legacy = {
      ...base,
      version: 6,
      profile: { ...seed.profile, startWeightKg: 83.8, currentWeightKg: 82.6 },
      weights: [
        { id: 'demo_weight_0', date: '2026-08-01', weightKg: 82.6 },
        { id: 'linked_weight', date: '2026-08-21', recordedAt: '2026-08-21T07:32:00.000Z', weightKg: 87.1, source: 'fitdays_ai_image', sourceMeasurementId: 'fitdays_1' },
      ],
      bodyMeasurements: [{
        id: 'fitdays_1', timestamp: '2026-08-21T07:32:00.000Z', weightKg: 87.1, bodyFatPercent: 28.9,
        bodyWaterKg: 45.2, source: 'fitdays_ai_image', createdAt: '2026-08-21T08:00:00.000Z',
      }],
    };
    const migrated = migrateAppData(legacy as never);
    expect(migrated.measurements).toHaveLength(1);
    expect(migrated.measurements[0]).toMatchObject({ id: 'fitdays_1', measuredAt: '2026-08-21T07:32:00.000Z', weightKg: 87.1, waterMassKg: 45.2 });
    expect(migrated.profile).not.toHaveProperty('currentWeightKg');
    expect(migrated.profile).not.toHaveProperty('startWeightKg');
  });

  it('persists canonical measurements and body goals through a JSON round trip', () => {
    const saved = createSeedData();
    saved.measurements = [{ ...saved.measurements[0], id: 'real_1', isDemo: false, measuredAt: '2026-08-21T07:32:00.000Z', weightKg: 87.1, bodyFatPercent: 28.9 }];
    saved.bodyGoals.bodyFatPersonalTargetPercent = 18;
    const reloaded = migrateAppData(JSON.parse(JSON.stringify(saved)));
    expect(reloaded.measurements).toEqual(saved.measurements);
    expect(reloaded.bodyGoals.bodyFatPersonalTargetPercent).toBe(18);
  });

  it('persists explicit adaptive-planner selections and readiness through a JSON round trip', () => {
    const saved = migrateAppData(createSeedData());
    const plan = saved.trainingPlanner.dailyPlans[4];
    saved.trainingPlanner.dailyPlans[4] = {
      ...plan,
      selectedSessionTemplateId: 'upper_a',
      selectionSource: 'user_selected',
      status: 'selected',
      overrideWarningShown: true,
      readinessResponse: { energy: 3, muscleSoreness: 2, jointDiscomfort: 'mild', availableMinutes: 50, preferredIntensity: 'light', recordedAt: '2026-08-21T08:00:00.000Z' },
    };
    const reloaded = migrateAppData(JSON.parse(JSON.stringify(saved)));
    expect(reloaded.trainingPlanner.dailyPlans.find((item) => item.date === plan.date)).toMatchObject({
      selectedSessionTemplateId: 'upper_a', selectionSource: 'user_selected', overrideWarningShown: true,
      readinessResponse: { jointDiscomfort: 'mild', preferredIntensity: 'light' },
    });
  });
});
