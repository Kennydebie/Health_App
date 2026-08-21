import type { BodyMeasurement, BodyMetricKey, WeightLossPlan } from '../types/models';

export type PlanChartMetric = Extract<BodyMetricKey, 'weightKg' | 'bodyFatPercent' | 'fatMassKg' | 'fatFreeMassKg' | 'muscleMassKg'>;
export type PlanComparisonStatus = 'On track' | 'Slower than target' | 'Faster than target' | 'Not enough data';

export interface PlanProjectionPoint {
  weekNumber: number;
  date: string;
  weightKg: number;
  bodyFatPercent: number | null;
  fatMassKg: number | null;
  fatFreeMassKg: number | null;
  muscleMassKg: number | null;
}

export interface WeeklyActualPoint {
  weekStart: string;
  representativeDate: string;
  value: number;
  readingCount: number;
  measurementIds: string[];
}

export interface PlanChartPoint {
  weekNumber: number;
  date: string;
  actual: number | null;
  target: number | null;
  maintenanceTarget: number | null;
  readingCount: number;
  difference: number | null;
  status: PlanComparisonStatus;
}

const DAY_MS = 86_400_000;
const WEEK_MS = DAY_MS * 7;

function dateAtUtc(date: string) {
  return new Date(`${date.slice(0, 10)}T00:00:00Z`);
}

function addDays(date: string, days: number) {
  const next = dateAtUtc(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

export function planWeeks(baselineWeightKg: number, goalWeightKg: number, weeklyRatePct: number) {
  if (baselineWeightKg <= goalWeightKg) return 0;
  const rate = Math.max(0.1, Math.min(2, weeklyRatePct)) / 100;
  return Math.max(1, Math.ceil(Math.log(goalWeightKg / baselineWeightKg) / Math.log(1 - rate)));
}

export function targetWeightForWeek(plan: Pick<WeightLossPlan, 'baselineWeightKg' | 'goalWeightKg' | 'weeklyRatePct'>, weekNumber: number) {
  return Math.max(plan.goalWeightKg, plan.baselineWeightKg * Math.pow(1 - plan.weeklyRatePct / 100, weekNumber));
}

export function createWeightLossPlan({
  id,
  measurement,
  goalWeightKg,
  weeklyRatePct = 0.8,
  planStartDate,
  version,
  now,
}: {
  id: string;
  measurement: BodyMeasurement;
  goalWeightKg: number;
  weeklyRatePct?: number;
  planStartDate: string;
  version: number;
  now: string;
}): WeightLossPlan {
  if (measurement.weightKg == null) throw new Error('A confirmed baseline weight is required.');
  const rate = Math.max(0.1, Math.min(2, weeklyRatePct));
  const weeks = planWeeks(measurement.weightKg, goalWeightKg, rate);
  return {
    id,
    baselineMeasurementId: measurement.id,
    baselineWeightKg: measurement.weightKg,
    baselineBodyFatPercent: measurement.bodyFatPercent,
    baselineFatMassKg: measurement.fatMassKg,
    baselineFatFreeMassKg: measurement.fatFreeMassKg,
    baselineMuscleMassKg: measurement.muscleMassKg,
    goalWeightKg,
    weeklyRatePct: rate,
    planStartDate: planStartDate.slice(0, 10),
    estimatedTargetDate: addDays(planStartDate, weeks * 7),
    version,
    createdAt: now,
    updatedAt: now,
  };
}

export function projectionPoints(plan: WeightLossPlan): PlanProjectionPoint[] {
  const weeks = planWeeks(plan.baselineWeightKg, plan.goalWeightKg, plan.weeklyRatePct);
  return Array.from({ length: weeks + 1 }, (_, weekNumber) => {
    const weightKg = targetWeightForWeek(plan, weekNumber);
    const fatMassKg = plan.baselineFatFreeMassKg == null ? null : Math.max(0, weightKg - plan.baselineFatFreeMassKg);
    const bodyFatPercent = fatMassKg == null || weightKg <= 0 ? null : fatMassKg / weightKg * 100;
    return {
      weekNumber,
      date: addDays(plan.planStartDate, weekNumber * 7),
      weightKg,
      bodyFatPercent,
      fatMassKg,
      fatFreeMassKg: plan.baselineFatFreeMassKg,
      muscleMassKg: plan.baselineMuscleMassKg,
    };
  });
}

function calendarWeekStart(measuredAt: string) {
  const date = dateAtUtc(measuredAt);
  const offset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - offset);
  return date.toISOString().slice(0, 10);
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function weeklyActuals(measurements: BodyMeasurement[], metric: PlanChartMetric): WeeklyActualPoint[] {
  const groups = new Map<string, Array<{ id: string; measuredAt: string; value: number }>>();
  for (const measurement of measurements) {
    const value = measurement[metric];
    if (measurement.isDemo || !measurement.measuredAt || typeof value !== 'number' || measurement.excludedFromTrend?.includes(metric)) continue;
    const weekStart = calendarWeekStart(measurement.measuredAt);
    const group = groups.get(weekStart) ?? [];
    group.push({ id: measurement.id, measuredAt: measurement.measuredAt, value });
    groups.set(weekStart, group);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([weekStart, readings]) => {
    const byDate = [...readings].sort((a, b) => a.measuredAt.localeCompare(b.measuredAt));
    return {
      weekStart,
      representativeDate: byDate[Math.floor((byDate.length - 1) / 2)].measuredAt.slice(0, 10),
      value: median(readings.map((reading) => reading.value)),
      readingCount: readings.length,
      measurementIds: readings.map((reading) => reading.id),
    };
  });
}

export function comparisonStatus(actual: number | null, target: number | null, metric: PlanChartMetric, actualWeeklyCount: number, tolerance = 0.5): PlanComparisonStatus {
  if (actual == null || target == null || actualWeeklyCount < 2) return 'Not enough data';
  const difference = actual - target;
  if (Math.abs(difference) <= tolerance) return 'On track';
  if (metric === 'fatFreeMassKg' || metric === 'muscleMassKg') return 'Not enough data';
  return difference > 0 ? 'Slower than target' : 'Faster than target';
}

function targetForMetric(point: PlanProjectionPoint, metric: PlanChartMetric) {
  return point[metric];
}

export function planChartSeries(plan: WeightLossPlan, measurements: BodyMeasurement[], metric: PlanChartMetric): PlanChartPoint[] {
  const projection = projectionPoints(plan);
  const actuals = weeklyActuals(measurements, metric);
  const baselineActual = actuals.find((point) => point.measurementIds.includes(plan.baselineMeasurementId));
  const byWeek = new Map<number, WeeklyActualPoint>();
  for (const actual of actuals) {
    const weekNumber = actual === baselineActual
      ? 0
      : Math.max(0, Math.round((dateAtUtc(actual.representativeDate).getTime() - dateAtUtc(plan.planStartDate).getTime()) / WEEK_MS));
    byWeek.set(weekNumber, actual);
  }
  return projection.map((point) => {
    const actual = byWeek.get(point.weekNumber);
    const projected = targetForMetric(point, metric);
    const maintenance = metric === 'fatFreeMassKg' || metric === 'muscleMassKg' ? projected : null;
    const target = maintenance == null ? projected : null;
    const actualValue = actual?.value ?? null;
    const comparisonTarget = target ?? maintenance;
    return {
      weekNumber: point.weekNumber,
      date: point.date,
      actual: actualValue,
      target,
      maintenanceTarget: maintenance,
      readingCount: actual?.readingCount ?? 0,
      difference: actualValue == null || comparisonTarget == null ? null : actualValue - comparisonTarget,
      status: comparisonStatus(actualValue, comparisonTarget, metric, actuals.length),
    };
  });
}

export function latestPlanComparison(series: PlanChartPoint[], today: string) {
  return series.filter((point) => point.date <= today && point.actual != null).at(-1) ?? null;
}

export function countConfirmedWeeks(measurements: BodyMeasurement[], metric: PlanChartMetric = 'weightKg') {
  return weeklyActuals(measurements, metric).length;
}
