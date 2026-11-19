import type { BodyMeasurement } from '../../types/models';

export interface DailyWeight { date: string; weightKg: number; count: number }
export interface TrendPoint { date: string; weightKg: number; trendKg: number }

const DAY_MS = 86_400_000;

export function dayIndex(date: string) {
  return Math.round(Date.parse(`${date}T00:00:00Z`) / DAY_MS);
}

export function addDays(date: string, days: number) {
  return new Date((dayIndex(date) + days) * DAY_MS).toISOString().slice(0, 10);
}

/** Averages multiple weigh-ins on the same day and drops measurements excluded from the trend. */
export function dailyWeights(measurements: BodyMeasurement[]): DailyWeight[] {
  const byDate = new Map<string, { sum: number; count: number }>();
  for (const measurement of measurements) {
    if (measurement.weightKg == null || !measurement.measuredAt) continue;
    if (measurement.isDemo || measurement.excludedFromTrend?.includes('weightKg')) continue;
    const date = measurement.measuredAt.slice(0, 10);
    const current = byDate.get(date) ?? { sum: 0, count: 0 };
    byDate.set(date, { sum: current.sum + measurement.weightKg, count: current.count + 1 });
  }
  return [...byDate.entries()]
    .map(([date, value]) => ({ date, weightKg: value.sum / value.count, count: value.count }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Exponentially weighted moving average that respects gaps between weigh-ins: a weigh-in after
 * seven days moves the trend as much as seven daily weigh-ins would. This keeps normal day-to-day
 * water fluctuations from being read as fat gain or loss.
 */
export function smoothedTrend(weights: DailyWeight[], dailyAlpha = 0.1): TrendPoint[] {
  const points: TrendPoint[] = [];
  let trend: number | null = null;
  let previousDate: string | null = null;
  for (const entry of weights) {
    if (trend == null || previousDate == null) {
      trend = entry.weightKg;
    } else {
      const gap = Math.max(1, dayIndex(entry.date) - dayIndex(previousDate));
      const alpha = 1 - Math.pow(1 - dailyAlpha, Math.min(gap, 14));
      trend = trend + alpha * (entry.weightKg - trend);
    }
    previousDate = entry.date;
    points.push({ date: entry.date, weightKg: entry.weightKg, trendKg: trend });
  }
  return points;
}

export interface WeeklyAverage { weekStart: string; averageKg: number; count: number }

export function mondayOf(date: string) {
  const value = new Date(`${date}T12:00:00Z`);
  const weekday = (value.getUTCDay() + 6) % 7;
  return addDays(date, -weekday);
}

export function weeklyAverages(weights: DailyWeight[]): WeeklyAverage[] {
  const byWeek = new Map<string, number[]>();
  for (const entry of weights) {
    const week = mondayOf(entry.date);
    byWeek.set(week, [...(byWeek.get(week) ?? []), entry.weightKg]);
  }
  return [...byWeek.entries()]
    .map(([weekStart, values]) => ({ weekStart, averageKg: values.reduce((sum, value) => sum + value, 0) / values.length, count: values.length }))
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart));
}

export interface ObservedRate {
  /** Positive = losing weight. */
  kgPerWeek: number;
  spanDays: number;
  weighIns: number;
  reliable: boolean;
}

/** Least-squares slope of the trend line over the last `windowDays`. */
export function observedRate(points: TrendPoint[], windowDays = 28, referenceDate?: string): ObservedRate | null {
  if (points.length < 2) return null;
  const end = referenceDate ?? points[points.length - 1].date;
  const startIndex = dayIndex(end) - windowDays;
  const window = points.filter((point) => dayIndex(point.date) >= startIndex && dayIndex(point.date) <= dayIndex(end));
  if (window.length < 2) return null;
  const xs = window.map((point) => dayIndex(point.date));
  const ys = window.map((point) => point.trendKg);
  const meanX = xs.reduce((a, b) => a + b, 0) / xs.length;
  const meanY = ys.reduce((a, b) => a + b, 0) / ys.length;
  let numerator = 0;
  let denominator = 0;
  for (let index = 0; index < xs.length; index += 1) {
    numerator += (xs[index] - meanX) * (ys[index] - meanY);
    denominator += (xs[index] - meanX) ** 2;
  }
  if (denominator === 0) return null;
  const slopePerDay = numerator / denominator;
  const spanDays = xs[xs.length - 1] - xs[0];
  return { kgPerWeek: -slopePerDay * 7, spanDays, weighIns: window.length, reliable: window.length >= 4 && spanDays >= 14 };
}

export interface WeightProgress {
  startKg: number | null;
  currentKg: number | null;
  latestRawKg: number | null;
  targetKg: number;
  lostKg: number;
  remainingKg: number;
  percent: number;
  milestoneKg: number | null;
  milestoneReached: boolean;
}

export function weightProgress(points: TrendPoint[], startKg: number | null, targetKg: number, milestoneKg: number | null): WeightProgress {
  const latest = points.at(-1);
  const start = startKg ?? points[0]?.weightKg ?? null;
  const current = latest ? latest.trendKg : null;
  if (start == null || current == null) {
    return { startKg: start, currentKg: current, latestRawKg: latest?.weightKg ?? null, targetKg, lostKg: 0, remainingKg: start != null ? Math.max(0, start - targetKg) : 0, percent: 0, milestoneKg, milestoneReached: false };
  }
  const total = Math.max(0.0001, start - targetKg);
  const lost = start - current;
  return {
    startKg: start,
    currentKg: current,
    latestRawKg: latest?.weightKg ?? null,
    targetKg,
    lostKg: lost,
    remainingKg: Math.max(0, current - targetKg),
    percent: Math.max(0, Math.min(100, (lost / total) * 100)),
    milestoneKg,
    milestoneReached: milestoneKg != null && current <= milestoneKg,
  };
}

/** Planned weight on a date for a linear plan. */
export function expectedWeightOn(date: string, planStart: string, startKg: number, kgPerWeek: number, targetKg: number) {
  const weeks = Math.max(0, (dayIndex(date) - dayIndex(planStart)) / 7);
  return Math.max(targetKg, startKg - weeks * kgPerWeek);
}
