import { describe, expect, it } from 'vitest';
import { defaultProgram, exercises } from './exercises';

describe('revised weekly training schedule', () => {
  it('contains all seven days in calendar order with four lifting sessions', () => {
    expect(defaultProgram.map((day) => day.id)).toEqual(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']);
    expect(defaultProgram.filter((day) => !day.isRestDay).map((day) => day.title)).toEqual(['Upper A', 'Lower A', 'Upper B', 'Lower B']);
    expect(defaultProgram.filter((day) => day.isRestDay)).toHaveLength(3);
  });

  it('matches the intended exercises, sets, and rep ranges', () => {
    const sessions = Object.fromEntries(defaultProgram.filter((day) => !day.isRestDay).map((day) => [day.id, day.exercises]));
    expect(sessions.monday.map((item) => [item.exerciseId, item.sets, item.repMin, item.repMax])).toEqual([
      ['bench-press', 3, 6, 10], ['one-arm-row', 3, 8, 12], ['incline-db-press', 3, 8, 12], ['lateral-raise', 2, 12, 20], ['db-curl', 2, 10, 15], ['triceps-extension', 2, 10, 15],
    ]);
    expect(sessions.tuesday.map((item) => [item.exerciseId, item.sets, item.repMin, item.repMax])).toEqual([
      ['assisted-squat', 3, 8, 12], ['romanian-deadlift', 3, 6, 10], ['supported-reverse-lunge', 2, 8, 12], ['calf-raise', 3, 10, 15], ['dead-bug', 3, 6, 10],
    ]);
    expect(sessions.thursday.map((item) => [item.exerciseId, item.sets, item.repMin, item.repMax])).toEqual([
      ['overhead-press', 3, 6, 10], ['barbell-row', 3, 8, 12], ['db-bench-press', 3, 8, 12], ['db-pullover', 3, 10, 15], ['rear-delt-fly', 2, 12, 20], ['hammer-curl', 2, 10, 15], ['triceps-extension', 2, 10, 15],
    ]);
    expect(sessions.saturday.map((item) => [item.exerciseId, item.sets, item.repMin, item.repMax])).toEqual([
      ['hip-thrust', 3, 8, 12], ['supported-split-squat', 3, 8, 12], ['sliding-hamstring-curl', 3, 8, 15], ['box-squat', 2, 10, 15], ['calf-raise', 3, 12, 20], ['side-plank', 3, 20, 45],
    ]);
  });

  it('programs cardio and recovery guidance on every non-lifting day', () => {
    const recoveryDays = defaultProgram.filter((day) => day.isRestDay);
    expect(recoveryDays.every((day) => (day.cardioTargetMinutes ?? 0) >= 30)).toBe(true);
    expect(recoveryDays.every((day) => Boolean(day.cardioSuggestion) && (day.recovery?.length ?? 0) >= 4)).toBe(true);
  });

  it('provides complete metadata and a graceful video fallback for every exercise', () => {
    expect(exercises.every((exercise) => exercise.movementPatterns && exercise.requiredEquipment.length && exercise.defaultPrescription.sets > 0)).toBe(true);
    expect(exercises.every((exercise) => exercise.videoId === undefined || /^[\w-]{11}$/.test(exercise.videoId))).toBe(true);
    expect(exercises.every((exercise) => exercise.videoFallback.length > 30 && exercise.setup.length && exercise.execution.length && exercise.safety.length)).toBe(true);
    expect(exercises.every((exercise) => exercise.muscleMap.primary.length > 0 && exercise.muscleMap.preferredView)).toBe(true);
  });
});
