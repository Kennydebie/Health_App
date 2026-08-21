import { exerciseMap } from '../data/exercises';
import { shiftDate, toDateKey } from './date';
import { workoutVolume } from './progress';
import { isStrengthTemplate, workoutDayForSession } from './adaptivePlanner';
import type { AppData, BodyMeasurement, WorkoutDay, WorkoutId, WorkoutSession } from '../types/models';

const workoutDisplayNames: Partial<Record<WorkoutId, string>> = {
  upper_a: 'Upper Body · Chest & Back',
  lower_a: 'Legs · Squat & Hamstrings',
  upper_b: 'Upper Body · Shoulders & Back',
  lower_b: 'Legs · Glutes & Hamstrings',
  full_body_a: 'Full Body · Session A',
  full_body_b: 'Full Body · Session B',
  full_body_c: 'Full Body · Session C',
};

const legacyDayDisplayNames: Partial<Record<WorkoutDay['id'], string>> = {
  monday: 'Upper Body · Chest & Back',
  tuesday: 'Legs · Squat & Hamstrings',
  thursday: 'Upper Body · Shoulders & Back',
  saturday: 'Legs · Glutes & Hamstrings',
};

export function displayWorkoutTitle(day: Pick<WorkoutDay, 'id' | 'title'> & { workoutId?: WorkoutId }): string {
  return (day.workoutId ? workoutDisplayNames[day.workoutId] : undefined) ?? legacyDayDisplayNames[day.id] ?? day.title;
}

export function mondayOf(dateKey = toDateKey()): string {
  const date = new Date(`${dateKey}T12:00:00`);
  const day = date.getDay();
  return shiftDate(dateKey, -(day === 0 ? 6 : day - 1));
}

export function datesInWeek(dateKey = toDateKey()): string[] {
  const start = mondayOf(dateKey);
  return Array.from({ length: 7 }, (_, index) => shiftDate(start, index));
}

export function datesInCalendarMonth(monthKey: string): string[] {
  const first = `${monthKey}-01`;
  const weekday = new Date(`${first}T12:00:00`).getDay();
  const gridStart = shiftDate(first, -((weekday + 6) % 7));
  return Array.from({ length: 42 }, (_, index) => shiftDate(gridStart, index));
}

export type PlanDayStatus = 'completed' | 'today' | 'upcoming' | 'skipped' | 'missed' | 'not-scheduled';

export interface WeekPlanDay {
  date: string;
  day?: WorkoutDay;
  plan?: AppData['trainingPlanner']['dailyPlans'][number];
  status: PlanDayStatus;
  completedSession?: WorkoutSession;
  cardioMinutes: number;
}

export interface WeekSnapshot {
  days: WeekPlanDay[];
  completedStrength: number;
  plannedStrength: number;
  dueStrength: number;
  cardioMinutes: number;
  nutritionDays: number;
  elapsedDays: number;
}

/** One source of truth for schedule cards, summaries, CTAs and progress metrics. */
export function getWeekSnapshot(data: AppData, reference = toDateKey()): WeekSnapshot {
  const dates = datesInWeek(reference);
  const sessions = data.sessions.filter((session) => session.completedAt && dates.includes(session.date) && session.date <= reference && session.sets.some((set) => set.completed && !set.isWarmup));
  const cardioByDate = new Map<string, number>();
  for (const entry of data.cardioLog.filter((item) => dates.includes(item.date) && item.date <= reference)) {
    cardioByDate.set(entry.date, (cardioByDate.get(entry.date) ?? 0) + entry.minutes);
  }
  const days = dates.map((date, index): WeekPlanDay => {
    const plan = data.trainingPlanner.dailyPlans.find((item) => item.date === date);
    const completedSession = sessions.filter((session) => session.date === date).at(-1);
    const templateId = completedSession?.workoutId ?? plan?.selectedSessionTemplateId;
    const fallbackDay = data.program[index];
    const day = templateId ? workoutDayForSession(data.program, templateId, date) : fallbackDay;
    if (!day) return { date, status: 'not-scheduled', cardioMinutes: cardioByDate.get(date) ?? 0, plan };
    const cardioMinutes = cardioByDate.get(date) ?? 0;
    const completed = Boolean(completedSession) || day.isRestDay && cardioMinutes > 0;
    const status: PlanDayStatus = completed
      ? 'completed'
      : plan?.status === 'skipped'
        ? 'skipped'
      : date === reference
        ? 'today'
        : date > reference
          ? 'upcoming'
          : day.isRestDay
            ? 'skipped'
            : 'missed';
    return { date, day, plan, status, completedSession, cardioMinutes };
  });
  const elapsedDates = dates.filter((date) => date <= reference);
  return {
    days,
    completedStrength: sessions.length,
    dueStrength: days.filter((item) => item.plan && isStrengthTemplate(item.plan.selectedSessionTemplateId) && item.date <= reference).length,
    plannedStrength: data.trainingPlanner.weeklyTargets.strengthSessions,
    cardioMinutes: [...cardioByDate.values()].reduce((sum, minutes) => sum + minutes, 0),
    nutritionDays: new Set(data.foodLog.filter((entry) => elapsedDates.includes(entry.date)).map((entry) => entry.date)).size,
    elapsedDays: elapsedDates.length,
  };
}

export function activePlanWeek(measurements: BodyMeasurement[], reference = toDateKey()): number {
  const first = measurements.filter((measurement) => !measurement.isDemo && measurement.measuredAt).sort((a, b) => a.measuredAt!.localeCompare(b.measuredAt!))[0]?.measuredAt?.slice(0, 10);
  if (!first) return 1;
  const elapsed = Math.max(0, new Date(`${reference}T12:00:00`).getTime() - new Date(`${first}T12:00:00`).getTime());
  return Math.floor(elapsed / 604_800_000) + 1;
}

export function trainingWeekStreak(sessions: WorkoutSession[], reference = toDateKey()): number {
  const completedWeeks = new Set(sessions.filter((session) => session.completedAt).map((session) => mondayOf(session.date)));
  let cursor = mondayOf(reference);
  if (!completedWeeks.has(cursor)) cursor = shiftDate(cursor, -7);
  let streak = 0;
  while (completedWeeks.has(cursor)) {
    streak += 1;
    cursor = shiftDate(cursor, -7);
  }
  return streak;
}

export function weeklyConsistency(data: AppData, reference = toDateKey()) {
  const snapshot = getWeekSnapshot(data, reference);
  const strengthScore = snapshot.dueStrength ? Math.min(1, snapshot.completedStrength / snapshot.dueStrength) : 1;
  const nutritionScore = snapshot.elapsedDays ? snapshot.nutritionDays / snapshot.elapsedDays : 1;
  const expectedCardio = data.weeklyCardioTarget * snapshot.elapsedDays / 7;
  const cardioScore = expectedCardio ? Math.min(1, snapshot.cardioMinutes / expectedCardio) : 1;
  return {
    percent: Math.round((strengthScore * .6 + nutritionScore * .2 + cardioScore * .2) * 100),
    strength: snapshot.completedStrength,
    plannedStrength: snapshot.plannedStrength,
    dueStrength: snapshot.dueStrength,
    nutritionDays: snapshot.nutritionDays,
    cardioMinutes: snapshot.cardioMinutes,
    breakdown: {
      strength: Math.round(strengthScore * 60),
      nutrition: Math.round(nutritionScore * 20),
      cardio: Math.round(cardioScore * 20),
    },
  };
}

export interface DailyScoreBreakdown {
  total: number;
  items: Array<{ id: 'logging' | 'protein' | 'energy' | 'movement' | 'habits'; label: string; points: number; max: number }>;
}

export function dailyScore(data: AppData, date: string, totals: { calories: number; protein: number }): DailyScoreBreakdown {
  const dayIndex = datesInWeek(date).indexOf(date);
  const day = data.program[dayIndex];
  const logged = data.foodLog.some((entry) => entry.date === date);
  const logging = logged ? 20 : 0;
  const protein = logged ? Math.round(Math.min(25, totals.protein / Math.max(1, data.profile.proteinTarget) * 25)) : 0;
  const energy = logged && totals.calories >= data.profile.calorieTarget * .65 && totals.calories <= data.profile.calorieTarget * 1.05 ? 15 : 0;
  const completedOnDate = data.sessions.some((session) => session.completedAt && session.date === date);
  const activeForDay = data.sessions.some((session) => !session.completedAt && session.date === date && (!day?.workoutId || session.workoutId === day.workoutId));
  const cardio = data.cardioLog.filter((entry) => entry.date === date).reduce((sum, entry) => sum + entry.minutes, 0);
  const movement = day?.isRestDay
    ? Math.round(Math.min(30, cardio / Math.max(1, day.cardioTargetMinutes ?? 30) * 30))
    : completedOnDate
      ? 30
      : activeForDay
        ? 10
        : 0;
  const habit = data.habits.find((entry) => entry.date === date);
  const habits = habit ? Math.round(([habit.water, habit.walk, habit.sleep].filter(Boolean).length / 3) * 10) : 0;
  const items: DailyScoreBreakdown['items'] = [
    { id: 'logging', label: 'Food logged', points: logging, max: 20 },
    { id: 'protein', label: 'Protein progress', points: protein, max: 25 },
    { id: 'energy', label: 'Energy target range', points: energy, max: 15 },
    { id: 'movement', label: day?.isRestDay ? 'Cardio / recovery' : 'Strength session', points: movement, max: 30 },
    { id: 'habits', label: 'Support habits', points: habits, max: 10 },
  ];
  return { total: items.reduce((sum, item) => sum + item.points, 0), items };
}

export interface PersonalRecordEvent {
  date: string;
  exerciseId: string;
  exerciseName: string;
  weightKg: number;
  reps: number;
  estimatedOneRepMax: number;
}

export function personalRecordEvents(sessions: WorkoutSession[]): PersonalRecordEvent[] {
  const bestByExercise = new Map<string, number>();
  const records: PersonalRecordEvent[] = [];
  const completed = [...sessions].filter((session) => session.completedAt).sort((a, b) => a.date.localeCompare(b.date));
  for (const session of completed) {
    for (const set of session.sets.filter((item) => item.completed && !item.isWarmup && item.weightKg > 0 && item.reps > 0)) {
      const estimate = set.weightKg * (1 + set.reps / 30);
      const previous = bestByExercise.get(set.exerciseId) ?? 0;
      if (estimate > previous + .01) {
        bestByExercise.set(set.exerciseId, estimate);
        records.push({ date: session.date, exerciseId: set.exerciseId, exerciseName: exerciseMap.get(set.exerciseId)?.name ?? 'Saved exercise', weightKg: set.weightKg, reps: set.reps, estimatedOneRepMax: estimate });
      }
    }
  }
  return records;
}

export function weeklyVolumeSeries(sessions: WorkoutSession[], reference = toDateKey(), weeks = 6) {
  const currentMonday = mondayOf(reference);
  return Array.from({ length: weeks }, (_, index) => {
    const start = shiftDate(currentMonday, (index - weeks + 1) * 7);
    const end = shiftDate(start, 6);
    const relevant = sessions.filter((session) => session.completedAt && session.date >= start && session.date <= end);
    return { week: start.slice(5), startDate: start, volume: Math.round(relevant.reduce((sum, session) => sum + workoutVolume(session), 0)), sessions: relevant.length };
  });
}
