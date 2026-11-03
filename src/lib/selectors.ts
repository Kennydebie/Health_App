import { addMacros, entryMacros } from './nutrition';
import { resolveFood } from './foodCatalog';
import { currentWeight, goalProgressPercentage, startingWeight, weightHistory } from './bodyMeasurements';
import { weightTrend } from './progress';
import { activePlanWeek, datesInWeek, getWeekSnapshot, mondayOf, personalRecordEvents } from './engagement';
import { shiftDate, toDateKey } from './date';
import { evaluateNutritionDay, targetSnapshotForDate } from './nutritionEvaluation';
import { isStrengthTemplate } from './adaptivePlanner';
import type { AppData, Macros } from '../types/models';

export function getNutritionTotals(data: AppData, date: string): Macros {
  return addMacros(data.foodLog.filter((entry) => entry.date === date).flatMap((entry) => {
    const food = resolveFood(data, entry.foodId);
    return [entryMacros(food, entry)];
  }));
}

export function getDailyNutritionStatus(data: AppData, date: string, today = toDateKey()) {
  return evaluateNutritionDay({
    date,
    today,
    totals: getNutritionTotals(data, date),
    target: targetSnapshotForDate(data.nutritionTargetHistory, data.profile, date),
    settings: data.nutritionSettings,
    record: data.nutritionDayRecords.find((item) => item.date === date),
  });
}

export function getCurrentWeight(data: AppData) {
  return currentWeight(data.measurements);
}

export function getStartingWeight(data: AppData) {
  return startingWeight(data.measurements);
}

export function getWeeklyTrainingProgress(data: AppData, date = toDateKey()) {
  return getWeekSnapshot(data, date);
}

export interface DailyGoal {
  id: 'nutrition' | 'workout' | 'recovery' | 'habits';
  label: string;
  complete: boolean;
  due: boolean;
  detail: string;
}

export function getDailyProgress(data: AppData, date = toDateKey()): { status: 'in_progress' | 'finished'; completed: number; due: number; percent: number; goals: DailyGoal[] } {
  const nutrition = getDailyNutritionStatus(data, date, date);
  const plan = data.trainingPlanner.dailyPlans.find((item) => item.date === date);
  const selected = plan?.selectedSessionTemplateId;
  const completedWorkout = data.sessions.some((session) => session.date === date && session.completedAt && session.sets.some((set) => set.completed && !set.isWarmup));
  const cardioMinutes = data.cardioLog.filter((entry) => entry.date === date).reduce((sum, entry) => sum + entry.minutes, 0);
  const workoutDue = Boolean(selected && isStrengthTemplate(selected));
  const recoveryDue = Boolean(selected && !isStrengthTemplate(selected) && selected !== 'full_rest');
  const habit = data.habits.find((entry) => entry.date === date);
  const habitCount = habit ? [habit.water, habit.walk, habit.sleep].filter(Boolean).length : 0;
  const goals: DailyGoal[] = [
    { id: 'nutrition', label: 'Nutrition', complete: nutrition.overall === 'on_target', due: true, detail: nutrition.overall === 'in_progress' ? 'Still in progress' : nutrition.overall === 'on_target' ? 'Target reached' : 'Not on target yet' },
    { id: 'workout', label: 'Planned workout', complete: completedWorkout, due: workoutDue, detail: workoutDue ? completedWorkout ? 'Completed' : 'Not completed yet' : 'Not scheduled today' },
    { id: 'recovery', label: 'Cardio or recovery', complete: cardioMinutes > 0, due: recoveryDue, detail: recoveryDue ? cardioMinutes > 0 ? `${cardioMinutes} minutes logged` : 'Not logged yet' : 'Not scheduled today' },
    { id: 'habits', label: 'Daily habits', complete: habitCount === 3, due: true, detail: `${habitCount} of 3 complete` },
  ];
  const dueGoals = goals.filter((goal) => goal.due);
  const completed = dueGoals.filter((goal) => goal.complete).length;
  const finished = Boolean(data.nutritionDayRecords.find((item) => item.date === date)?.finishedAt);
  return { status: finished ? 'finished' : 'in_progress', completed, due: dueGoals.length, percent: dueGoals.length ? Math.round(completed / dueGoals.length * 100) : 100, goals };
}

export interface WeeklyConsistencyResult {
  percent: number;
  completed: number;
  due: number;
  strength: number;
  plannedStrength: number;
  dueStrength: number;
  nutritionDays: number;
  cardioMinutes: number;
  skipped: number;
  missed: number;
  breakdown: Array<{ label: string; completed: number; due: number }>;
}

/** Completed objectives divided by objectives due before now. Future work is excluded. */
export function getWeeklyConsistency(data: AppData, reference = toDateKey()): WeeklyConsistencyResult {
  const snapshot = getWeekSnapshot(data, reference);
  const categories = new Map<string, { completed: number; due: number }>([
    ['Nutrition', { completed: 0, due: 0 }],
    ['Training', { completed: 0, due: 0 }],
    ['Recovery', { completed: 0, due: 0 }],
    ['Habits', { completed: 0, due: 0 }],
  ]);
  let skipped = 0;
  let missed = 0;
  for (const day of snapshot.days) {
    const isPast = day.date < reference;
    const nutrition = getDailyNutritionStatus(data, day.date, reference);
    const nutritionFinishedToday = Boolean(data.nutritionDayRecords.find((item) => item.date === day.date)?.finishedAt);
    if (isPast || nutritionFinishedToday) {
      const item = categories.get('Nutrition')!;
      item.due += 1;
      if (nutrition.overall === 'on_target') item.completed += 1;
    }
    const planId = day.plan?.selectedSessionTemplateId;
    const trainingCompletedToday = day.status === 'completed';
    if (planId && isStrengthTemplate(planId) && (isPast || trainingCompletedToday || day.status === 'skipped')) {
      const item = categories.get('Training')!;
      item.due += 1;
      if (day.status === 'completed') item.completed += 1;
      if (day.status === 'skipped') skipped += 1;
      if (day.status === 'missed') missed += 1;
    } else if (planId && planId !== 'full_rest' && !isStrengthTemplate(planId) && (isPast || day.cardioMinutes > 0 || day.status === 'skipped')) {
      const item = categories.get('Recovery')!;
      item.due += 1;
      if (day.cardioMinutes > 0) item.completed += 1;
      if (day.status === 'skipped') skipped += 1;
    }
    const habit = data.habits.find((entry) => entry.date === day.date);
    const habitComplete = Boolean(habit && habit.water && habit.walk && habit.sleep);
    if (isPast || habitComplete) {
      const item = categories.get('Habits')!;
      item.due += 1;
      if (habitComplete) item.completed += 1;
    }
  }
  const breakdown = [...categories].map(([label, value]) => ({ label, ...value })).filter((item) => item.due > 0);
  const completed = breakdown.reduce((sum, item) => sum + item.completed, 0);
  const due = breakdown.reduce((sum, item) => sum + item.due, 0);
  return {
    percent: due ? Math.round(completed / due * 100) : 100,
    completed,
    due,
    strength: snapshot.completedStrength,
    plannedStrength: snapshot.plannedStrength,
    dueStrength: snapshot.dueStrength,
    nutritionDays: snapshot.nutritionDays,
    cardioMinutes: snapshot.cardioMinutes,
    skipped,
    missed,
    breakdown,
  };
}

export function getCurrentStreak(data: AppData, reference = toDateKey(), minimumConsistency = 60) {
  let weekStart = shiftDate(mondayOf(reference), -7);
  let weeks = 0;
  while (weeks < 260) {
    const result = getWeeklyConsistency(data, shiftDate(weekStart, 6));
    if (!result.due || result.percent < minimumConsistency) break;
    weeks += 1;
    weekStart = shiftDate(weekStart, -7);
  }
  return { weeks, minimumConsistency, explanation: `A successful week is a completed calendar week with at least ${minimumConsistency}% of due goals completed.` };
}

export function getPersonalRecords(data: AppData) {
  return personalRecordEvents(data.sessions);
}

export function getBodyProgress(data: AppData) {
  return {
    currentWeight: getCurrentWeight(data),
    startingWeight: getStartingWeight(data),
    goalWeight: data.profile.goalWeightKg,
    goalProgress: goalProgressPercentage(data.measurements, data.profile.goalWeightKg),
    trend: weightTrend(data.measurements),
    measurementCount: weightHistory(data.measurements).length,
  };
}

export function getDashboardSummary(data: AppData, date = toDateKey()) {
  return {
    body: getBodyProgress(data),
    daily: getDailyProgress(data, date),
    weekly: getWeeklyConsistency(data, date),
    training: getWeeklyTrainingProgress(data, date),
    streak: getCurrentStreak(data, date),
    personalRecords: getPersonalRecords(data),
    planWeek: activePlanWeek(data.measurements, date),
    totals: getNutritionTotals(data, date),
    weekDates: datesInWeek(date),
  };
}
