import { describe, expect, it } from 'vitest';
import { createInitialData } from '../data/initialData';
import { recalculateTrainingWeek } from './adaptivePlanner';
import { getDailyProgress, getWeeklyConsistency } from './selectors';

describe('central progress selectors', () => {
  it('keeps today in progress and excludes unfinished future goals from consistency', () => {
    const data = createInitialData();
    data.trainingPlanner = recalculateTrainingWeek(data, '2026-08-21', new Date('2026-08-21T12:00:00Z'));
    const daily = getDailyProgress(data, '2026-08-21');
    const weekly = getWeeklyConsistency(data, '2026-08-21');

    expect(daily.status).toBe('in_progress');
    expect(daily.completed).toBe(0);
    expect(daily.goals.some((goal) => goal.detail === 'Not scheduled today')).toBe(true);
    expect(weekly.due).toBeLessThan(7 * 4);
    expect(weekly.percent).toBeGreaterThanOrEqual(0);
    expect(weekly.percent).toBeLessThanOrEqual(100);
  });

  it('counts only explicitly finished work for today', () => {
    const data = createInitialData();
    data.nutritionDayRecords = [{ date: '2026-08-21', finishedAt: '2026-08-21T20:00:00Z' }];
    data.habits = [{ date: '2026-08-21', water: true, walk: true, sleep: true }];
    const daily = getDailyProgress(data, '2026-08-21');
    const weekly = getWeeklyConsistency(data, '2026-08-21');

    expect(daily.status).toBe('finished');
    expect(daily.completed).toBe(1);
    expect(weekly.breakdown.find((item) => item.label === 'Habits')).toEqual({ label: 'Habits', completed: 1, due: 5 });
  });
});
