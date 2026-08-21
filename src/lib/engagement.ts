import { exerciseMap } from '../data/exercises';
import { shiftDate, toDateKey } from './date';
import { workoutVolume } from './progress';
import type { AppData, WeightEntry, WorkoutDay, WorkoutSession } from '../types/models';

const strengthDisplayNames: Partial<Record<WorkoutDay['id'], string>> = {
  monday: 'Upper Body · Chest Focus',
  tuesday: 'Lower Body · Squat & Control',
  thursday: 'Upper Body · Shoulders & Back',
  saturday: 'Lower Body · Hamstrings & Glutes',
};

export function displayWorkoutTitle(day: Pick<WorkoutDay, 'id' | 'title'>): string {
  return strengthDisplayNames[day.id] ?? day.title;
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

export function activePlanWeek(weights: WeightEntry[], reference = toDateKey()): number {
  const first = [...weights].sort((a, b) => a.date.localeCompare(b.date))[0]?.date;
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
  const dates = datesInWeek(reference);
  const plannedStrength = data.program.filter((day) => !day.isRestDay).length;
  const strength = new Set(data.sessions.filter((session) => session.completedAt && dates.includes(session.date)).map((session) => session.dayId)).size;
  const nutrition = new Set(data.foodLog.filter((entry) => dates.includes(entry.date)).map((entry) => entry.date)).size;
  const cardio = data.cardioLog.filter((entry) => dates.includes(entry.date)).reduce((sum, entry) => sum + entry.minutes, 0);
  const strengthScore = plannedStrength ? Math.min(1, strength / plannedStrength) : 1;
  const nutritionScore = nutrition / 7;
  const cardioScore = Math.min(1, cardio / Math.max(1, data.weeklyCardioTarget));
  return {
    percent: Math.round((strengthScore * .6 + nutritionScore * .2 + cardioScore * .2) * 100),
    strength,
    plannedStrength,
    nutritionDays: nutrition,
    cardioMinutes: cardio,
  };
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
        records.push({
          date: session.date,
          exerciseId: set.exerciseId,
          exerciseName: exerciseMap.get(set.exerciseId)?.name ?? 'Saved exercise',
          weightKg: set.weightKg,
          reps: set.reps,
          estimatedOneRepMax: estimate,
        });
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
    return {
      week: start.slice(5),
      startDate: start,
      volume: Math.round(relevant.reduce((sum, session) => sum + workoutVolume(session), 0)),
      sessions: relevant.length,
    };
  });
}
