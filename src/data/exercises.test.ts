import { describe, expect, it } from 'vitest';
import { defaultProgram, exercises } from './exercises';

describe('weekly training schedule', () => {
  it('contains four training days and three recovery days in calendar order', () => {
    expect(defaultProgram.map((day) => day.id)).toEqual(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']);
    expect(defaultProgram.filter((day) => !day.isRestDay)).toHaveLength(4);
    expect(defaultProgram.filter((day) => day.isRestDay)).toHaveLength(3);
    expect(defaultProgram.filter((day) => day.isRestDay).every((day) => day.exercises.length === 0)).toBe(true);
    expect(defaultProgram.filter((day) => !day.isRestDay).map((day) => day.title)).toEqual([
      'Chest + Back + Arms',
      'Legs + Glutes',
      'Chest + Back + Shoulders',
      'Legs + Glutes',
    ]);
  });

  it('provides a specific embeddable video for every editable exercise', () => {
    expect(exercises.every((exercise) => /^[\w-]{11}$/.test(exercise.videoId))).toBe(true);
  });
});
