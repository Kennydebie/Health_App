import { describe, expect, it } from 'vitest';
import { defaultProgram, exercises } from '../data/exercises';
import { createSeedData } from '../data/seed';
import type { ProgramExercise, WorkoutSession } from '../types/models';
import { analyzeWeeklyProgram, buildProgramTemplate, isEquipmentCompatible, progressionGoal, progressionRecommendation, smartRepTargets, warmupTargets, weeklyCardioMinutes } from './workout';

describe('workout programming logic', () => {
  it('filters out exercises that require unavailable equipment', () => {
    const available = ['Adjustable dumbbells', 'Bench', 'Bodyweight'];
    expect(isEquipmentCompatible('bench-press', available)).toBe(false);
    expect(isEquipmentCompatible('db-bench-press', available)).toBe(true);
    const filtered = exercises.filter((exercise) => isEquipmentCompatible(exercise.id, available));
    expect(filtered.every((exercise) => exercise.requiredEquipment.every((item) => item === 'Bodyweight' || available.includes(item)))).toBe(true);
    expect(filtered.some((exercise) => exercise.requiredEquipment.some((item) => /cable|machine|pulldown/i.test(item)))).toBe(false);
  });

  it('defaults squat work to supported variations and never prescribes Bulgarian split squats for beginner balance', () => {
    const seed = createSeedData();
    expect(seed.squatProgression.currentLevel).toBe('assisted-squat');
    expect(defaultProgram[1].exercises[0].exerciseId).toBe('assisted-squat');
    expect(defaultProgram.flatMap((day) => day.exercises).some((item) => item.exerciseId === 'bulgarian-split-squat')).toBe(false);
  });

  it('calculates direct-set and movement-pattern summaries', () => {
    const analysis = analyzeWeeklyProgram(defaultProgram, createSeedData().profile);
    expect(Object.fromEntries(analysis.movementCoverage.map((item) => [item.pattern, item.sets]))).toMatchObject({
      'Horizontal push': 9, 'Horizontal pull': 8, 'Vertical push': 3, 'Vertical pull substitute': 3,
      Squat: 5, 'Hip hinge': 6, 'Single-leg': 5, 'Knee-flexion hamstrings': 3, Calves: 6, Core: 6, 'Lateral shoulder': 2,
    });
    expect(Object.fromEntries(analysis.muscleSets.map((item) => [item.muscle, item.sets]))).toMatchObject({ Chest: 9, Quads: 10, Hamstrings: 6, Core: 6 });
    expect(analysis.warnings).toEqual([]);
  });

  it('supports two-, three-, and four-day templates without auto-selecting one', () => {
    expect(buildProgramTemplate('two-day-full-body', 'assisted-squat').filter((day) => !day.isRestDay)).toHaveLength(2);
    expect(buildProgramTemplate('three-day-full-body', 'assisted-squat').filter((day) => !day.isRestDay)).toHaveLength(3);
    expect(buildProgramTemplate('four-day-upper-lower', 'assisted-squat').filter((day) => !day.isRestDay)).toHaveLength(4);
  });

  it('assigns a unique stable identity to every scheduled lifting slot', () => {
    for (const template of ['two-day-full-body', 'three-day-full-body', 'four-day-upper-lower'] as const) {
      const ids = buildProgramTemplate(template, 'assisted-squat').filter((day) => !day.isRestDay).map((day) => day.workoutId);
      expect(ids.every(Boolean)).toBe(true);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('recommends double progression without mutating workout history', () => {
    const prescription: ProgramExercise = { exerciseId: 'bench-press', sets: 3, repMin: 6, repMax: 10, restSeconds: 180, rir: '2' };
    const session = (id: string, date: string): WorkoutSession => ({ id, date, dayId: 'monday', workoutId: 'upper_a', title: 'Upper A', startedAt: `${date}T10:00:00Z`, completedAt: `${date}T11:00:00Z`, durationSeconds: 3600, sets: [1, 2, 3].map((setNumber) => ({ id: `${id}_${setNumber}`, exerciseId: 'bench-press', setNumber, weightKg: 50, reps: 10, rir: 2, completed: true, isWarmup: false })) });
    const sessions = [session('one', '2026-08-10'), session('two', '2026-08-17')];
    const before = structuredClone(sessions);
    const recommendation = progressionRecommendation(sessions, 'bench-press', prescription);
    expect(recommendation).toMatchObject({ type: 'increase', targetWeightKg: 52.5 });
    expect(sessions).toEqual(before);
  });

  it('predicts the next reps by adding two total reps to the lowest incomplete sets', () => {
    const prescription: ProgramExercise = { exerciseId: 'bench-press', sets: 3, repMin: 6, repMax: 10, restSeconds: 180, rir: '2' };
    const previous = [10, 9, 8].map((reps, index) => ({ id: `set-${index}`, exerciseId: 'bench-press', setNumber: index + 1, weightKg: 50, reps, completed: true }));
    expect(smartRepTargets(previous, prescription)).toEqual([10, 10, 9]);
    expect(progressionGoal(previous, [10, 10, 9], 50, prescription)).toBe("Today's goal: +2 total reps at 50 kg.");
  });

  it('generates rounded warm-up targets from the working load', () => {
    expect(warmupTargets(50, 3, 'bench-press')).toEqual([{ weightKg: 20, reps: 10 }, { weightKg: 30, reps: 6 }, { weightKg: 40, reps: 3 }]);
  });

  it('tracks only cardio entries inside the current Monday–Sunday week', () => {
    const reference = new Date('2026-08-21T12:00:00');
    expect(weeklyCardioMinutes([
      { id: 'old', date: '2026-08-16', minutes: 50, activity: 'Brisk walk' },
      { id: 'wed', date: '2026-08-19', minutes: 35, activity: 'Brisk walk' },
      { id: 'fri', date: '2026-08-21', minutes: 30, activity: 'Cycling' },
    ], reference)).toBe(65);
  });
});
