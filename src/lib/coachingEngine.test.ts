import { describe, expect, it } from 'vitest';
import { createInitialData } from '../data/initialData';
import type { AppData, BodyMeasurement, FoodLogEntry, WorkoutSession } from '../types/models';
import { emptyMeasurementValues } from './appDataMigration';
import { buildDailyCoach, decideWeeklyCoach } from './coachingEngine';
import { shiftDate } from './date';

const reference = '2026-08-21';

function addWeights(data: AppData, dailyWeights: number[]) {
  data.measurements = dailyWeights.map((weightKg, index): BodyMeasurement => ({
    ...emptyMeasurementValues,
    id: `weight-${index}`,
    measuredAt: `${shiftDate(reference, index - dailyWeights.length + 1)}T08:00:00Z`,
    weightKg,
    source: 'manual',
    createdAt: `${shiftDate(reference, index - dailyWeights.length + 1)}T08:00:00Z`,
  }));
}

function addNutrition(data: AppData, days: number, calories: number, protein: number, completeDays = days) {
  const entries: FoodLogEntry[] = [];
  data.nutritionDayRecords = [];
  for (let index = 0; index < days; index += 1) {
    const date = shiftDate(reference, index - days + 1);
    entries.push({
      id: `food-${date}`, foodId: 'fixture', date, meal: 'dinner', servingId: 'serving', quantity: 1, createdAt: `${date}T19:00:00Z`,
      snapshot: {
        foodName: 'Fixture meal', image: '', unit: 'g', amount: 100, servingLabel: '1 serving',
        per100: { calories, protein, carbs: 150, fat: 60 }, calculated: { calories, protein, carbs: 150, fat: 60 },
      },
    });
    const isComplete = index >= days - completeDays;
    data.nutritionDayRecords.push({ date, completeness: isComplete ? 'fully_logged' : 'partially_logged', ...(isComplete ? { finishedAt: `${date}T22:00:00Z` } : {}) });
  }
  data.foodLog = entries;
}

function addTraining(data: AppData, loads: number[] = [50, 50, 50]) {
  data.sessions = loads.map((weightKg, index): WorkoutSession => {
    const date = shiftDate(reference, index * 3 - 8);
    return {
      id: `session-${index}`, date, dayId: 'monday', workoutId: 'full_body_a', title: 'Full body A',
      startedAt: `${date}T17:00:00Z`, completedAt: `${date}T18:00:00Z`, durationSeconds: 3600,
      sets: [
        { id: `set-${index}-1`, exerciseId: 'bench-press', setNumber: 1, weightKg, reps: 8, completed: true },
        { id: `set-${index}-2`, exerciseId: 'bench-press', setNumber: 2, weightKg, reps: 8, completed: true },
      ],
    };
  });
}

function fixture() {
  const data = createInitialData();
  data.onboardingCompleted = true;
  data.activeGoal.startDate = shiftDate(reference, -30);
  data.trainingPlanner.dailyPlans = [];
  return data;
}

describe('adaptive cut coaching engine', () => {
  it('keeps the plan after a successful week with stable strength', () => {
    const data = fixture();
    addWeights(data, [...Array(7).fill(87), ...Array(7).fill(86.6)]);
    addNutrition(data, 7, 2080, 168, 7);
    addTraining(data);
    const decision = decideWeeklyCoach(data, reference);
    expect(decision.conclusion).toBe('keep_plan');
    expect(decision.proposedChange).toBeUndefined();
    expect(decision.explanation).toContain('inside your coaching range');
  });

  it('identifies a genuine plateau and proposes only one selectable change at a time', () => {
    const data = fixture();
    addWeights(data, Array(21).fill(87));
    addNutrition(data, 7, 2090, 171, 7);
    addTraining(data);
    const decision = decideWeeklyCoach(data, reference);
    expect(decision.conclusion).toBe('reduce_calories');
    expect(decision.proposedChange).toMatchObject({ variable: 'calorie_target', proposedValue: 2000 });
    expect(decision.alternativeChange?.variable).toBe('daily_steps');
    expect(decision.primaryAction).toContain('one small adjustment');
  });

  it('does not lower calories when logging is incomplete', () => {
    const data = fixture();
    addWeights(data, Array(14).fill(87));
    addNutrition(data, 7, 1800, 120, 4);
    addTraining(data);
    const decision = decideWeeklyCoach(data, reference);
    expect(decision.conclusion).toBe('improve_logging');
    expect(decision.proposedChange).toBeUndefined();
    expect(decision.explanation).toContain('data-quality problem');
  });

  it('responds to rapid two-week loss without reducing calories further', () => {
    const data = fixture();
    addWeights(data, [...Array(7).fill(89.2), ...Array(7).fill(88.1), ...Array(7).fill(87)]);
    addNutrition(data, 7, 1750, 150, 7);
    addTraining(data, [52.5, 50, 47.5]);
    data.recoveryFeedback = [{ id: 'recovery', date: reference, energy: 'low', sleep: 'poor', soreness: 'high', hunger: 'high', motivation: 'low', createdAt: `${reference}T20:00:00Z` }];
    const decision = decideWeeklyCoach(data, reference);
    expect(decision.conclusion).toBe('increase_calories');
    expect(decision.proposedChange?.proposedValue).toBeGreaterThan(data.profile.calorieTarget);
    expect(decision.warnings.join(' ')).toContain('Do not reduce calories');
  });

  it('treats above-target intake as an adherence problem instead of plan failure', () => {
    const data = fixture();
    addWeights(data, Array(14).fill(87));
    addNutrition(data, 7, 2440, 172, 7);
    addTraining(data);
    const decision = decideWeeklyCoach(data, reference);
    expect(decision.conclusion).toBe('improve_adherence');
    expect(decision.proposedChange).toBeUndefined();
    expect(decision.explanation).toContain('above target');
  });

  it('prioritizes a calorie-aware protein gap late in the day', () => {
    const data = fixture();
    addNutrition(data, 1, 1900, 105, 0);
    const priority = buildDailyCoach(data, reference, 18);
    expect(priority.title).toBe('Close the protein gap');
    expect(priority.instruction).toContain('200 kcal left');
    expect(priority.instruction).toContain('65 g protein');
  });

  it('suspends harsh adjustments during a pause period', () => {
    const data = fixture();
    addWeights(data, Array(14).fill(87));
    addNutrition(data, 7, 2100, 170, 7);
    data.pausePeriods = [{ id: 'travel', type: 'traveling', startDate: shiftDate(reference, -2), createdAt: `${reference}T08:00:00Z` }];
    const decision = decideWeeklyCoach(data, reference);
    expect(decision.conclusion).toBe('paused');
    expect(decision.proposedChange).toBeUndefined();
  });
});
