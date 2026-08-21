import type { BodyGoalSettings, BodyMeasurement, BodyMetricKey } from '../types/models';

export const DEFAULT_BODY_GOALS: BodyGoalSettings = {
  version: 1,
  bodyFatCheckpointPercent: 25,
  bodyFatTargetMinPercent: 18,
  bodyFatTargetMaxPercent: 20,
  bodyFatPersonalTargetPercent: 18,
  fatFreeMassTargetKg: null,
  muscleMassTargetKg: null,
  waistTargetCm: null,
};

export const BODY_METRIC_LABELS: Record<BodyMetricKey, string> = {
  weightKg: 'Weight',
  bmi: 'BMI',
  bodyFatPercent: 'Body fat',
  fatMassKg: 'Fat mass',
  fatFreeMassKg: 'Fat-free mass',
  muscleMassKg: 'Muscle mass',
  musclePercent: 'Muscle',
  skeletalMusclePercent: 'Skeletal muscle',
  boneMassKg: 'Bone mass',
  proteinMassKg: 'Protein mass',
  proteinPercent: 'Protein',
  waterMassKg: 'Water mass',
  bodyWaterPercent: 'Body water',
  subcutaneousFatPercent: 'Subcutaneous fat',
  visceralFatIndex: 'Visceral fat index',
  bmrKcal: 'BMR',
  bodyAge: 'Body age',
  waistCircumferenceCm: 'Waist circumference',
};

export const BODY_METRIC_UNITS: Record<BodyMetricKey, string> = {
  weightKg: 'kg', bmi: '', bodyFatPercent: '%', fatMassKg: 'kg', fatFreeMassKg: 'kg',
  muscleMassKg: 'kg', musclePercent: '%', skeletalMusclePercent: '%', boneMassKg: 'kg',
  proteinMassKg: 'kg', proteinPercent: '%', waterMassKg: 'kg', bodyWaterPercent: '%',
  subcutaneousFatPercent: '%', visceralFatIndex: 'index', bmrKcal: 'kcal', bodyAge: 'years',
  waistCircumferenceCm: 'cm',
};

export function sortedMeasurements(measurements: BodyMeasurement[], includeDemo = false) {
  return measurements
    .filter((measurement) => includeDemo || !measurement.isDemo)
    .filter((measurement) => Boolean(measurement.measuredAt))
    .sort((a, b) => (a.measuredAt ?? '').localeCompare(b.measuredAt ?? ''));
}

export function latestMeasurement(measurements: BodyMeasurement[]) {
  return sortedMeasurements(measurements).at(-1);
}

export function latestBodyComposition(measurements: BodyMeasurement[]) {
  return sortedMeasurements(measurements).filter(hasBodyComposition).at(-1);
}

export function hasBodyComposition(measurement: BodyMeasurement) {
  return measurement.bodyFatPercent != null || measurement.fatMassKg != null || measurement.fatFreeMassKg != null
    || measurement.muscleMassKg != null || measurement.bodyWaterPercent != null || measurement.visceralFatIndex != null;
}

export function currentWeight(measurements: BodyMeasurement[]) {
  return sortedMeasurements(measurements).filter((measurement) => measurement.weightKg != null).at(-1)?.weightKg ?? null;
}

export function startingWeight(measurements: BodyMeasurement[]) {
  return sortedMeasurements(measurements).find((measurement) => measurement.weightKg != null)?.weightKg ?? null;
}

export function weightHistory(measurements: BodyMeasurement[], includeDemo = false) {
  return sortedMeasurements(measurements, includeDemo)
    .filter((measurement): measurement is BodyMeasurement & { measuredAt: string; weightKg: number } => measurement.measuredAt != null && measurement.weightKg != null)
    .map((measurement) => ({
      id: measurement.id,
      measuredAt: measurement.measuredAt,
      date: measurement.measuredAt.slice(0, 10),
      weightKg: measurement.weightKg,
      source: measurement.source,
      isDemo: Boolean(measurement.isDemo),
      excluded: measurement.excludedFromTrend?.includes('weightKg') ?? false,
    }));
}

export function weightRemaining(measurements: BodyMeasurement[], goalWeightKg: number) {
  const current = currentWeight(measurements);
  return current == null ? null : Math.max(0, current - goalWeightKg);
}

export function goalProgressPercentage(measurements: BodyMeasurement[], goalWeightKg: number) {
  const start = startingWeight(measurements);
  const current = currentWeight(measurements);
  if (start == null || current == null || start === goalWeightKg) return 0;
  return Math.max(0, Math.min(100, (start - current) / (start - goalWeightKg) * 100));
}

export function rollingWeightSeries(measurements: BodyMeasurement[]) {
  const history = weightHistory(measurements).filter((entry) => !entry.excluded);
  return history.map((entry) => {
    const end = new Date(entry.measuredAt).getTime();
    const start = end - 6 * 86_400_000;
    const window = history.filter((candidate) => {
      const time = new Date(candidate.measuredAt).getTime();
      return time >= start && time <= end;
    });
    const average = window.reduce((sum, candidate) => sum + candidate.weightKg, 0) / window.length;
    return { ...entry, average: Math.round(average * 100) / 100 };
  });
}

export function metricSeries(measurements: BodyMeasurement[], metric: BodyMetricKey, includeExcluded = false) {
  return sortedMeasurements(measurements).flatMap((measurement) => {
    const value = measurement[metric];
    if (typeof value !== 'number') return [];
    const excluded = measurement.excludedFromTrend?.includes(metric) ?? false;
    if (excluded && !includeExcluded) return [];
    return [{ id: measurement.id, measuredAt: measurement.measuredAt!, date: measurement.measuredAt!.slice(0, 10), value, source: measurement.source, excluded }];
  });
}

export function metricChange(measurements: BodyMeasurement[], metric: BodyMetricKey, days?: number) {
  const series = metricSeries(measurements, metric);
  if (series.length < 2) return null;
  const latest = series.at(-1)!;
  let comparison = series.at(-2)!;
  if (days) {
    const cutoff = new Date(latest.measuredAt).getTime() - days * 86_400_000;
    const periodComparison = series.filter((point) => new Date(point.measuredAt).getTime() <= cutoff).at(-1);
    if (!periodComparison) return null;
    comparison = periodComparison;
    if (comparison.id === latest.id) return null;
  }
  return Math.round((latest.value - comparison.value) * 100) / 100;
}

const OUTLIER_RULES: Partial<Record<BodyMetricKey, { delta: number; days: number }>> = {
  weightKg: { delta: 8, days: 7 },
  bodyFatPercent: { delta: 5, days: 7 },
  fatMassKg: { delta: 4, days: 7 },
  fatFreeMassKg: { delta: 4, days: 7 },
  muscleMassKg: { delta: 4, days: 7 },
  bodyWaterPercent: { delta: 6, days: 7 },
  visceralFatIndex: { delta: 4, days: 7 },
  waistCircumferenceCm: { delta: 10, days: 7 },
};

export function withDetectedOutliers(measurements: BodyMeasurement[]) {
  const sorted = [...measurements].sort((a, b) => (a.measuredAt ?? '').localeCompare(b.measuredAt ?? ''));
  return sorted.map((measurement, index) => {
    if (measurement.isDemo || !measurement.measuredAt) return measurement;
    const confirmed = new Set(measurement.confirmedOutlierMetrics ?? []);
    const excluded = new Set(measurement.excludedFromTrend ?? []);
    for (const [metric, rule] of Object.entries(OUTLIER_RULES) as Array<[BodyMetricKey, { delta: number; days: number }]>) {
      if (confirmed.has(metric) || typeof measurement[metric] !== 'number') continue;
      const prior = sorted.slice(0, index).reverse().find((candidate) => !candidate.isDemo && candidate.measuredAt && typeof candidate[metric] === 'number');
      if (!prior?.measuredAt) continue;
      const daysApart = (new Date(measurement.measuredAt).getTime() - new Date(prior.measuredAt).getTime()) / 86_400_000;
      if (daysApart >= 0 && daysApart <= rule.days && Math.abs((measurement[metric] as number) - (prior[metric] as number)) > rule.delta) excluded.add(metric);
    }
    if (excluded.size) return { ...measurement, excludedFromTrend: [...excluded] };
    const withoutEmptyExclusion = { ...measurement };
    delete withoutEmptyExclusion.excludedFromTrend;
    return withoutEmptyExclusion;
  });
}

export function bodyFatReferenceRange(age: number, sex: 'male' | 'female') {
  const bracket = age < 40 ? 0 : age < 60 ? 1 : 2;
  const ranges = sex === 'male' ? [[8, 20], [11, 22], [13, 25]] : [[21, 33], [23, 34], [24, 36]];
  const [min, max] = ranges[bracket];
  return {
    metric: 'bodyFatPercent' as const,
    min,
    max,
    ageBracket: bracket === 0 ? '20–39' : bracket === 1 ? '40–59' : '60–79',
    sex,
    unit: '%',
    source: 'Gallagher et al., American Journal of Clinical Nutrition (2000)',
    url: 'https://pubmed.ncbi.nlm.nih.gov/10966886/',
    version: 'Project 75 reference engine v1',
    limitations: 'Population reference only. Consumer BIA estimates vary with device, hydration and measurement conditions.',
  };
}

export const BMI_REFERENCE = {
  metric: 'bmi',
  ranges: [
    { min: 0, max: 18.5, label: 'Below reference range' },
    { min: 18.5, max: 25, label: 'Healthy-weight screening range' },
    { min: 25, max: 30, label: 'Above healthy-weight screening range' },
    { min: 30, max: Number.POSITIVE_INFINITY, label: 'High screening range' },
  ],
  source: 'US Centers for Disease Control and Prevention',
  url: 'https://www.cdc.gov/bmi/adult-calculator/bmi-categories.html',
  version: 'CDC adult BMI categories accessed 2026',
  limitations: 'BMI is a screening measure, not a diagnosis, and does not directly measure body fat.',
};

export function targetWeightAtBodyFat(fatFreeMassKg: number, bodyFatPercent: number) {
  if (bodyFatPercent <= 0 || bodyFatPercent >= 100) return null;
  return Math.round(fatFreeMassKg / (1 - bodyFatPercent / 100) * 10) / 10;
}

export function projectedBodyFatAtWeight(fatFreeMassKg: number, weightKg: number) {
  if (weightKg <= 0 || fatFreeMassKg > weightKg) return null;
  return Math.round((1 - fatFreeMassKg / weightKg) * 1000) / 10;
}

export function formatMeasurementDate(measuredAt: string | null, withTime = true) {
  if (!measuredAt) return 'Date not recorded';
  const date = new Date(measuredAt);
  if (Number.isNaN(date.getTime())) return 'Date not recorded';
  return new Intl.DateTimeFormat(undefined, withTime ? { dateStyle: 'long', timeStyle: 'short' } : { dateStyle: 'long' }).format(date);
}
