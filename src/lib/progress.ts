import { rollingWeightSeries, weightHistory } from './bodyMeasurements';
import type { BodyMeasurement, WorkoutSession } from '../types/models';

export function average(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

export function weightTrend(measurements: BodyMeasurement[]) {
  const sorted = weightHistory(measurements);
  const rolling = rollingWeightSeries(measurements);
  const latest = rolling.at(-1);
  const cutoff = latest ? new Date(latest.measuredAt).getTime() - 7 * 86_400_000 : 0;
  const previousAverage = rolling.filter((entry) => new Date(entry.measuredAt).getTime() <= cutoff).at(-1)?.average ?? 0;
  const currentAverage = latest?.average ?? 0;
  return {
    current: sorted.at(-1)?.weightKg ?? 0,
    currentAverage,
    previousAverage,
    weeklyChange: currentAverage && previousAverage ? currentAverage - previousAverage : 0,
    series: rolling,
  };
}

export function workoutVolume(session: WorkoutSession): number {
  return session.sets.filter((set) => set.completed && !set.isWarmup).reduce((sum, set) => sum + set.weightKg * set.reps, 0);
}

export function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}
