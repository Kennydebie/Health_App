import type { WeightEntry, WorkoutSession } from '../types/models';

export function average(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

export function weightTrend(weights: WeightEntry[]) {
  const sorted = [...weights].sort((a, b) => a.date.localeCompare(b.date));
  const latest14 = sorted.slice(-14);
  const currentWeek = latest14.slice(-7);
  const previousWeek = latest14.slice(-14, -7);
  const currentAverage = average(currentWeek.map((entry) => entry.weightKg));
  const previousAverage = average(previousWeek.map((entry) => entry.weightKg));
  return {
    current: sorted.at(-1)?.weightKg ?? 0,
    currentAverage,
    previousAverage,
    weeklyChange: currentAverage && previousAverage ? currentAverage - previousAverage : 0,
    series: sorted,
  };
}

export function workoutVolume(session: WorkoutSession): number {
  return session.sets.filter((set) => set.completed).reduce((sum, set) => sum + set.weightKg * set.reps, 0);
}

export function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}
