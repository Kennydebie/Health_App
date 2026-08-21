import { describe, expect, it } from 'vitest';
import { createSeedData } from '../data/seed';
import { recalculateTrainingWeek } from './adaptivePlanner';
import { activePlanWeek, dailyScore, datesInCalendarMonth, datesInWeek, displayWorkoutTitle, getWeekSnapshot, personalRecordEvents, trainingWeekStreak, weeklyConsistency } from './engagement';

describe('engagement helpers', () => {
  it('uses plain-language workout names without changing stored titles', () => {
    const data = createSeedData();
    expect(displayWorkoutTitle(data.program[0])).toBe('Chest, back & arms');
    expect(data.program[0].title).toBe('Upper A');
  });

  it('builds an honest Monday-to-Sunday week', () => {
    expect(datesInWeek('2026-08-21')).toEqual(['2026-08-17', '2026-08-18', '2026-08-19', '2026-08-20', '2026-08-21', '2026-08-22', '2026-08-23']);
  });

  it('builds a stable Monday-first six-week calendar grid', () => {
    const dates = datesInCalendarMonth('2026-08');
    expect(dates).toHaveLength(42);
    expect(dates[0]).toBe('2026-07-27');
    expect(dates.at(-1)).toBe('2026-09-06');
  });

  it('derives plan week, streak and consistency from stored records', () => {
    const data = createSeedData();
    const lastDemoDate = data.measurements.at(-1)!.measuredAt!.slice(0, 10);
    expect(activePlanWeek(data.measurements, lastDemoDate)).toBe(1);
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

  it('recognizes a renamed and rescheduled session by permanent workout identity everywhere', () => {
    const data = createSeedData();
    const session = { ...data.sessions[0], id: 'renamed', date: '2026-08-21', dayId: 'friday' as const, workoutId: 'upper_a' as const, title: 'My custom press day', completedAt: '2026-08-21T12:00:00Z' };
    data.sessions = [session];
    data.foodLog = [];
    data.cardioLog = [];
    const week = getWeekSnapshot(data, '2026-08-21');
    expect(week.days[4]).toMatchObject({ date: '2026-08-21', status: 'completed' });
    expect(week.days[4].completedSession?.id).toBe('renamed');
    expect(week.completedStrength).toBe(1);
    expect(weeklyConsistency(data, '2026-08-21').strength).toBe(1);
  });

  it('does not complete a session card for an active or unfinished workout', () => {
    const data = createSeedData();
    data.sessions = [{ ...data.sessions[0], date: '2026-08-17', completedAt: undefined }];
    expect(getWeekSnapshot(data, '2026-08-21').days[0].status).toBe('missed');
  });

  it('never labels future training or recovery days as missed', () => {
    const data = createSeedData();
    data.sessions = [];
    data.cardioLog = [];
    data.trainingPlanner = recalculateTrainingWeek(data, '2026-08-18', new Date('2026-08-18T12:00:00'));
    const week = getWeekSnapshot(data, '2026-08-18');
    expect(week.days[0].status).toBe('missed');
    expect(week.days[1].status).toBe('today');
    expect(week.days.slice(2).every((day) => day.status === 'upcoming')).toBe(true);
    expect(week.dueStrength).toBe(2);
  });

  it('keeps skipped recovery separate from missed strength work', () => {
    const data = createSeedData();
    data.sessions = [];
    data.cardioLog = [];
    const week = getWeekSnapshot(data, '2026-08-21');
    expect(week.days[2].status).toBe('skipped');
    expect(week.days[3].status).toBe('missed');
  });

  it('calculates the daily score from an explicit 20/25/15/30/10 breakdown', () => {
    const data = createSeedData();
    const date = '2026-08-17';
    data.foodLog = [{ ...data.foodLog[0], date }];
    data.sessions = [{ ...data.sessions[0], date, completedAt: '2026-08-17T12:00:00Z' }];
    data.habits = [{ date, water: true, walk: true, sleep: true }];
    const score = dailyScore(data, date, { calories: 2000, protein: 170 });
    expect(score.items.map((item) => item.max)).toEqual([20, 25, 15, 30, 10]);
    expect(score.total).toBe(100);
  });
});
