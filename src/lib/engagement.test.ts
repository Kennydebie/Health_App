import { describe, expect, it } from 'vitest';
import { createSeedData } from '../data/seed';
import { activePlanWeek, datesInWeek, displayWorkoutTitle, personalRecordEvents, trainingWeekStreak, weeklyConsistency } from './engagement';

describe('engagement helpers', () => {
  it('uses plain-language workout names without changing stored titles', () => {
    const data = createSeedData();
    expect(displayWorkoutTitle(data.program[0])).toBe('Upper Body · Chest Focus');
    expect(data.program[0].title).toBe('Upper A');
  });

  it('builds an honest Monday-to-Sunday week', () => {
    expect(datesInWeek('2026-08-21')).toEqual(['2026-08-17', '2026-08-18', '2026-08-19', '2026-08-20', '2026-08-21', '2026-08-22', '2026-08-23']);
  });

  it('derives plan week, streak and consistency from stored records', () => {
    const data = createSeedData();
    expect(activePlanWeek(data.weights, data.weights.at(-1)!.date)).toBeGreaterThan(1);
    expect(trainingWeekStreak(data.sessions, data.sessions.at(-1)!.date)).toBeGreaterThan(0);
    const consistency = weeklyConsistency(data, data.sessions.at(-1)!.date);
    expect(consistency.percent).toBeGreaterThanOrEqual(0);
    expect(consistency.percent).toBeLessThanOrEqual(100);
  });

  it('only emits personal records from completed real sets', () => {
    const records = personalRecordEvents(createSeedData().sessions);
    expect(records.length).toBeGreaterThan(0);
    expect(records.every((record) => record.weightKg > 0 && record.reps > 0)).toBe(true);
  });
});
