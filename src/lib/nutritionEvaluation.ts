import { shiftDate } from './date';
import type { DailyNutritionTargetSnapshot, Macros, NutritionDayRecord, NutritionEvaluationSettings, UserProfile } from '../types/models';

export type NutritionMetricStatus = 'on_target' | 'close' | 'under' | 'over' | 'in_progress' | 'no_data';

export interface DailyNutritionStatus {
  overall: NutritionMetricStatus;
  calories: NutritionMetricStatus;
  protein: NutritionMetricStatus;
  carbohydrates: NutritionMetricStatus;
  fat: NutritionMetricStatus;
  complete: boolean;
  counted: boolean;
  hasData: boolean;
}

export interface NutritionDayEvaluation extends DailyNutritionStatus {
  date: string;
  totals: Macros;
  target: DailyNutritionTargetSnapshot;
  record?: NutritionDayRecord;
}

export const DEFAULT_NUTRITION_SETTINGS: NutritionEvaluationSettings = {
  version: 1,
  calories: { onTargetMin: 0.9, onTargetMax: 1.05, closeMin: 0.8, closeMax: 1.15 },
  protein: { onTargetMin: 0.9, closeMin: 0.75 },
  macros: { onTargetMin: 0.85, onTargetMax: 1.15, closeMin: 0.75, closeMax: 1.25 },
  untrackedDayDefault: 'excluded',
};

export const EMPTY_NUTRITION_TOTALS: Macros = { calories: 0, protein: 0, carbs: 0, fat: 0 };

export function detectedTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

export function dateKeyInTimezone(now: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function nutritionTargetFromProfile(profile: UserProfile, date: string, timezone = detectedTimezone()): DailyNutritionTargetSnapshot {
  return {
    date,
    caloriesKcal: profile.calorieTarget,
    proteinGrams: profile.proteinTarget,
    carbohydrateGrams: profile.carbTarget,
    fatGrams: profile.fatTarget,
    timezone,
  };
}

export function targetSnapshotForDate(history: DailyNutritionTargetSnapshot[], profile: UserProfile, date: string) {
  const applicable = history.filter((item) => item.date <= date).sort((a, b) => a.date.localeCompare(b.date)).at(-1);
  return applicable ? { ...applicable, date } : nutritionTargetFromProfile(profile, date);
}

export function upsertTargetSnapshot(history: DailyNutritionTargetSnapshot[], snapshot: DailyNutritionTargetSnapshot) {
  return [...history.filter((item) => item.date !== snapshot.date), snapshot].sort((a, b) => a.date.localeCompare(b.date));
}

function rangedStatus(value: number, target: number, range: { onTargetMin: number; onTargetMax: number; closeMin: number; closeMax: number }) {
  const ratio = target > 0 ? value / target : 0;
  if (ratio >= range.onTargetMin && ratio <= range.onTargetMax) return 'on_target' as const;
  if (ratio >= range.closeMin && ratio <= range.closeMax) return 'close' as const;
  return ratio < range.closeMin ? 'under' as const : 'over' as const;
}

function proteinStatus(value: number, target: number, settings: NutritionEvaluationSettings['protein']) {
  const ratio = target > 0 ? value / target : 0;
  if (ratio >= settings.onTargetMin) return 'on_target' as const;
  if (ratio >= settings.closeMin) return 'close' as const;
  return 'under' as const;
}

export function evaluateNutritionDay(input: {
  date: string;
  today: string;
  totals: Macros;
  target: DailyNutritionTargetSnapshot;
  settings?: NutritionEvaluationSettings;
  record?: NutritionDayRecord;
}): NutritionDayEvaluation {
  const { date, today, totals, target, record } = input;
  const settings = input.settings ?? DEFAULT_NUTRITION_SETTINGS;
  const hasData = totals.calories > 0 || totals.protein > 0 || totals.carbs > 0 || totals.fat > 0;
  const isFuture = date > today;
  const complete = !isFuture && (date < today || Boolean(record?.finishedAt));
  const intentionallyUntracked = Boolean(record?.untrackedTreatment);
  if (intentionallyUntracked || isFuture || (!hasData && complete)) {
    return { date, totals, target, record, overall: 'no_data', calories: 'no_data', protein: 'no_data', carbohydrates: 'no_data', fat: 'no_data', complete, counted: false, hasData };
  }

  if (!complete) {
    const caloriesOver = totals.calories > target.caloriesKcal * settings.calories.closeMax;
    const carbsOver = totals.carbs > target.carbohydrateGrams * settings.macros.closeMax;
    const fatOver = totals.fat > target.fatGrams * settings.macros.closeMax;
    return {
      date, totals, target, record, complete: false, counted: false, hasData,
      overall: caloriesOver || carbsOver || fatOver ? 'over' : 'in_progress',
      calories: caloriesOver ? 'over' : 'in_progress',
      protein: 'in_progress',
      carbohydrates: carbsOver ? 'over' : 'in_progress',
      fat: fatOver ? 'over' : 'in_progress',
    };
  }

  const calories = rangedStatus(totals.calories, target.caloriesKcal, settings.calories);
  const protein = proteinStatus(totals.protein, target.proteinGrams, settings.protein);
  const carbohydrates = rangedStatus(totals.carbs, target.carbohydrateGrams, settings.macros);
  const fat = rangedStatus(totals.fat, target.fatGrams, settings.macros);
  const statuses = [calories, protein, carbohydrates, fat];
  const overall = statuses.includes('over') ? 'over' : statuses.includes('under') ? 'under' : statuses.includes('close') ? 'close' : 'on_target';
  return { date, totals, target, record, overall, calories, protein, carbohydrates, fat, complete: true, counted: hasData, hasData };
}

export function statusLabel(status: NutritionMetricStatus, overall = false) {
  if (status === 'on_target') return 'On target';
  if (status === 'close') return 'Close to target';
  if (status === 'under') return overall ? 'Outside target range' : 'Below target';
  if (status === 'over') return overall ? 'Outside target range' : 'Above target';
  if (status === 'in_progress') return 'In progress';
  return 'No data';
}

export function metricDifference(value: number, target: number, unit: string) {
  const difference = Math.round(value - target);
  if (difference === 0) return `At target`;
  return `${Math.abs(difference).toLocaleString()} ${unit} ${difference > 0 ? 'over' : 'below'} target`;
}

export function startOfCalendarWeek(date: string) {
  const parsed = new Date(`${date}T12:00:00`);
  const mondayOffset = (parsed.getDay() + 6) % 7;
  return shiftDate(date, -mondayOffset);
}

export function calendarWeekDates(date: string) {
  const start = startOfCalendarWeek(date);
  return Array.from({ length: 7 }, (_, index) => shiftDate(start, index));
}

export function calendarMonthDates(monthDate: string) {
  const monthStart = `${monthDate.slice(0, 7)}-01`;
  const start = startOfCalendarWeek(monthStart);
  return Array.from({ length: 42 }, (_, index) => shiftDate(start, index));
}

export function explanationForDay(evaluation: NutritionDayEvaluation) {
  if (evaluation.record?.untrackedTreatment === 'excluded') return ['This intentionally untracked day is excluded from adherence summaries.'];
  if (evaluation.overall === 'no_data') return ['No food was logged for this day.'];
  if (evaluation.overall === 'in_progress') return ['Today is still in progress. Under-target amounts are not judged until you finish the day.'];
  const metrics: Array<[string, NutritionMetricStatus, number, number, string]> = [
    ['Calories', evaluation.calories, evaluation.totals.calories, evaluation.target.caloriesKcal, 'kcal'],
    ['Protein', evaluation.protein, evaluation.totals.protein, evaluation.target.proteinGrams, 'g'],
    ['Carbohydrates', evaluation.carbohydrates, evaluation.totals.carbs, evaluation.target.carbohydrateGrams, 'g'],
    ['Fat', evaluation.fat, evaluation.totals.fat, evaluation.target.fatGrams, 'g'],
  ];
  return metrics.map(([label, status, value, target, unit]) => {
    const verb = label === 'Calories' || label === 'Carbohydrates' ? 'were' : 'was';
    return status === 'on_target'
      ? `${label} ${verb} within range.`
      : `${label} ${verb} ${metricDifference(value, target, unit).toLowerCase()}.`;
  });
}
