import type { BodyMeasurement, BodyMeasurementConfidence, BodyMeasurementDraft, BodyMeasurementValues, BodyMetricKey, MeasurementIssue } from '../types/models';

export interface FitDaysFieldDefinition {
  key: BodyMetricKey;
  label: string;
  unit: string;
  group: 'Core' | 'Composition' | 'Hydration' | 'Metabolism';
  min: number;
  max: number;
  step: string;
}

export const FITDAYS_FIELDS: FitDaysFieldDefinition[] = [
  { key: 'weightKg', label: 'Weight', unit: 'kg', group: 'Core', min: 20, max: 350, step: '0.01' },
  { key: 'bmi', label: 'BMI', unit: '', group: 'Core', min: 8, max: 80, step: '0.01' },
  { key: 'bodyFatPercent', label: 'Body fat', unit: '%', group: 'Core', min: 0, max: 100, step: '0.01' },
  { key: 'fatMassKg', label: 'Fat mass', unit: 'kg', group: 'Composition', min: .1, max: 250, step: '0.01' },
  { key: 'fatFreeMassKg', label: 'Fat-free mass', unit: 'kg', group: 'Composition', min: 3, max: 300, step: '0.01' },
  { key: 'muscleMassKg', label: 'Muscle mass', unit: 'kg', group: 'Composition', min: 2, max: 250, step: '0.01' },
  { key: 'musclePercent', label: 'Muscle', unit: '%', group: 'Composition', min: 0, max: 100, step: '0.01' },
  { key: 'skeletalMusclePercent', label: 'Skeletal muscle', unit: '%', group: 'Composition', min: 0, max: 100, step: '0.01' },
  { key: 'boneMassKg', label: 'Bone mass', unit: 'kg', group: 'Composition', min: .2, max: 20, step: '0.01' },
  { key: 'proteinMassKg', label: 'Protein mass', unit: 'kg', group: 'Composition', min: .1, max: 60, step: '0.01' },
  { key: 'proteinPercent', label: 'Protein', unit: '%', group: 'Composition', min: 0, max: 100, step: '0.01' },
  { key: 'waterMassKg', label: 'Total body water', unit: 'kg', group: 'Hydration', min: 2, max: 250, step: '0.01' },
  { key: 'bodyWaterPercent', label: 'Body water', unit: '%', group: 'Hydration', min: 0, max: 100, step: '0.01' },
  { key: 'subcutaneousFatPercent', label: 'Subcutaneous fat', unit: '%', group: 'Hydration', min: 0, max: 100, step: '0.01' },
  { key: 'visceralFatIndex', label: 'Visceral fat index', unit: '', group: 'Metabolism', min: 0, max: 60, step: '0.01' },
  { key: 'bmrKcal', label: 'BMR', unit: 'kcal', group: 'Metabolism', min: 500, max: 6000, step: '1' },
  { key: 'bodyAge', label: 'Body age', unit: 'years', group: 'Metabolism', min: 5, max: 120, step: '1' },
];

export const EMPTY_BODY_MEASUREMENT_VALUES: BodyMeasurementValues = {
  measuredAt: null,
  weightKg: null,
  bmi: null,
  bodyFatPercent: null,
  fatMassKg: null,
  fatFreeMassKg: null,
  muscleMassKg: null,
  musclePercent: null,
  skeletalMusclePercent: null,
  boneMassKg: null,
  proteinMassKg: null,
  proteinPercent: null,
  waterMassKg: null,
  bodyWaterPercent: null,
  subcutaneousFatPercent: null,
  visceralFatIndex: null,
  bmrKcal: null,
  bodyAge: null,
  waistCircumferenceCm: null,
};

export const EMPTY_BODY_MEASUREMENT_CONFIDENCE: BodyMeasurementConfidence = {
  measuredAt: null,
  weightKg: null,
  bmi: null,
  bodyFatPercent: null,
  fatMassKg: null,
  fatFreeMassKg: null,
  muscleMassKg: null,
  musclePercent: null,
  skeletalMusclePercent: null,
  boneMassKg: null,
  proteinMassKg: null,
  proteinPercent: null,
  waterMassKg: null,
  bodyWaterPercent: null,
  subcutaneousFatPercent: null,
  visceralFatIndex: null,
  bmrKcal: null,
  bodyAge: null,
  waistCircumferenceCm: null,
};

export function parseMeasurementNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const normalized = String(value)
    .trim()
    .replace(/\s/g, '')
    .replace(',', '.')
    .replace(/[^0-9.+-]/g, '');
  if (!normalized) return null;
  const result = Number(normalized);
  return Number.isFinite(result) ? result : null;
}

export function normalizeTimestamp(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const normalized = value.trim().replace(' ', 'T');
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return null;
  const year = parsed.getUTCFullYear();
  const tomorrow = Date.now() + 86_400_000;
  if (year < 2010 || parsed.getTime() > tomorrow) return null;
  return parsed.toISOString();
}

function near(actual: number, expected: number, absoluteTolerance: number, proportionalTolerance = .06) {
  return Math.abs(actual - expected) <= Math.max(absoluteTolerance, Math.abs(expected) * proportionalTolerance);
}

export function validateFitDaysMeasurement(values: BodyMeasurementValues, confidence: BodyMeasurementConfidence): MeasurementIssue[] {
  const issues: MeasurementIssue[] = [];

  if (!values.measuredAt) issues.push({ code: 'missing', field: 'measuredAt', message: 'Measurement date and time could not be read.', severity: 'notice' });
  else if (!normalizeTimestamp(values.measuredAt)) issues.push({ code: 'out_of_range', field: 'measuredAt', message: 'Measurement date and time is not valid.', severity: 'warning' });
  else if (confidence.measuredAt != null && confidence.measuredAt < .75) issues.push({ code: 'low_confidence', field: 'measuredAt', message: 'Check the measurement date and time.', severity: 'warning' });

  for (const field of FITDAYS_FIELDS) {
    const value = values[field.key];
    const certainty = confidence[field.key];
    if (value == null) {
      issues.push({ code: 'missing', field: field.key, message: `${field.label} was not visible or readable.`, severity: 'notice' });
      continue;
    }
    if (!Number.isFinite(value) || value < field.min || value > field.max) {
      issues.push({ code: 'out_of_range', field: field.key, message: `${field.label} is outside a realistic range.`, severity: 'warning' });
    } else if (certainty != null && certainty < .75) {
      issues.push({ code: 'low_confidence', field: field.key, message: `Check the extracted ${field.label.toLowerCase()}.`, severity: 'warning' });
    }
  }

  const { weightKg, bodyFatPercent, fatMassKg, fatFreeMassKg, waterMassKg, bodyWaterPercent, muscleMassKg, musclePercent } = values;
  if (weightKg != null && bodyFatPercent != null && fatMassKg != null && !near(fatMassKg, weightKg * bodyFatPercent / 100, 1)) {
    issues.push({ code: 'inconsistent', field: 'fatMassKg', relatedField: 'bodyFatPercent', message: 'Fat mass does not closely match weight × body-fat percentage.', severity: 'warning' });
  }
  if (weightKg != null && fatMassKg != null && fatFreeMassKg != null && !near(fatFreeMassKg, weightKg - fatMassKg, 1)) {
    issues.push({ code: 'inconsistent', field: 'fatFreeMassKg', relatedField: 'fatMassKg', message: 'Fat-free mass does not closely match weight minus fat mass.', severity: 'warning' });
  }
  if (weightKg != null && bodyWaterPercent != null && waterMassKg != null && !near(waterMassKg, weightKg * bodyWaterPercent / 100, 1)) {
    issues.push({ code: 'inconsistent', field: 'waterMassKg', relatedField: 'bodyWaterPercent', message: 'Water mass does not closely match weight × body-water percentage.', severity: 'warning' });
  }
  if (weightKg != null && muscleMassKg != null && musclePercent != null && !near(musclePercent, muscleMassKg / weightKg * 100, 2, .04)) {
    issues.push({ code: 'inconsistent', field: 'musclePercent', relatedField: 'muscleMassKg', message: 'Muscle percentage does not closely match muscle mass ÷ weight.', severity: 'warning' });
  }
  return issues;
}

export function sanitizeFitDaysDraft(raw: Partial<BodyMeasurementDraft>): BodyMeasurementDraft {
  const values = { ...EMPTY_BODY_MEASUREMENT_VALUES };
  const rejectedFields: BodyMetricKey[] = [];
  const rejectedTimestamp = typeof raw.measuredAt === 'string' && raw.measuredAt.trim() !== '' && !normalizeTimestamp(raw.measuredAt);
  values.measuredAt = normalizeTimestamp(raw.measuredAt);
  for (const field of FITDAYS_FIELDS) {
    const value = parseMeasurementNumber(raw[field.key]);
    const valid = value == null || (value >= field.min && value <= field.max);
    if (!valid) rejectedFields.push(field.key);
    values[field.key] = value != null && valid ? value : null;
  }
  const confidence = { ...EMPTY_BODY_MEASUREMENT_CONFIDENCE };
  for (const key of Object.keys(confidence) as Array<keyof BodyMeasurementConfidence>) {
    const parsed = parseMeasurementNumber(raw.confidence?.[key]);
    confidence[key] = parsed == null ? null : Math.max(0, Math.min(1, parsed));
  }
  const issues = validateFitDaysMeasurement(values, confidence)
    .filter((issue) => !(issue.code === 'missing' && issue.field && (rejectedFields.includes(issue.field as BodyMetricKey) || issue.field === 'measuredAt' && rejectedTimestamp)));
  if (rejectedTimestamp) issues.push({ code: 'out_of_range', field: 'measuredAt', message: 'Measurement date and time was invalid and was not imported.', severity: 'warning' });
  for (const key of rejectedFields) {
    const label = FITDAYS_FIELDS.find((field) => field.key === key)?.label ?? key;
    issues.push({ code: 'out_of_range', field: key, message: `${label} was outside a realistic range and was not imported.`, severity: 'warning' });
  }
  return {
    ...values,
    source: 'fitdays_ai_image',
    confidence,
    issues,
  };
}

export function findSimilarBodyMeasurement(existing: BodyMeasurement[], candidate: BodyMeasurementDraft) {
  if (!candidate.measuredAt || candidate.weightKg == null) return undefined;
  const candidateTime = new Date(candidate.measuredAt).getTime();
  const candidateWeight = candidate.weightKg;
  return existing.find((measurement) => {
    if (!measurement.measuredAt || measurement.weightKg == null) return false;
    const minutesApart = Math.abs(new Date(measurement.measuredAt).getTime() - candidateTime) / 60_000;
    return minutesApart <= 30 && Math.abs(measurement.weightKg - candidateWeight) <= .3;
  });
}

export function formatMeasurementTimestamp(measuredAt: string | null) {
  if (!measuredAt) return 'Date not read';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(measuredAt));
}
