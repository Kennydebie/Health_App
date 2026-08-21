import { describe, expect, it } from 'vitest';
import { exercises } from '../data/exercises';
import { combinedMuscleExposure, exerciseMuscleMap, MUSCLE_LABELS } from './muscles';

describe('anatomical exercise muscle maps', () => {
  it('provides structured, labelled anatomy for every reusable exercise', () => {
    for (const exercise of exercises) {
      expect(exercise.muscleMap.primary.length, exercise.name).toBeGreaterThan(0);
      expect(['front', 'back', 'both']).toContain(exercise.muscleMap.preferredView);
      expect([...exercise.muscleMap.primary, ...exercise.muscleMap.secondary, ...(exercise.muscleMap.stabilizers ?? [])].every((muscle) => Boolean(MUSCLE_LABELS[muscle]))).toBe(true);
    }
  });

  it('uses specific anterior and posterior mappings for the chest-and-back workout', () => {
    expect(exerciseMuscleMap('bench-press')).toMatchObject({ primary: ['mid_chest'], secondary: ['triceps', 'front_deltoid'], preferredView: 'front' });
    expect(exerciseMuscleMap('one-arm-row')).toMatchObject({ primary: ['latissimus_dorsi', 'rhomboids'], preferredView: 'back', laterality: 'alternating' });
    expect(exerciseMuscleMap('incline-db-press')?.primary).toEqual(['upper_chest']);
    expect(exerciseMuscleMap('lateral-raise')).toMatchObject({ primary: ['side_deltoid'], preferredView: 'both' });
  });

  it('combines programmed set exposure without doubling unilateral sets', () => {
    const exposure = combinedMuscleExposure([
      { exerciseId: 'one-arm-row', sets: 3, repMin: 8, repMax: 12, restSeconds: 120, rir: '2' },
      { exerciseId: 'db-curl', sets: 2, repMin: 10, repMax: 15, restSeconds: 75, rir: '2' },
    ], exerciseMuscleMap);
    expect(exposure.find((item) => item.muscle === 'latissimus_dorsi')).toMatchObject({ exerciseCount: 1, workingSets: 3, primarySets: 3 });
    expect(exposure.find((item) => item.muscle === 'biceps')).toMatchObject({ exerciseCount: 2, workingSets: 5, secondarySets: 3, primarySets: 2 });
  });
});
