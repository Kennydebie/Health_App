import { createInitialData } from '../data/initialData';
import type { AppData } from '../types/models';

const CORE_COLLECTION_KEYS = [
  'foodLog', 'nutritionTargetHistory', 'nutritionDayRecords', 'favorites', 'recentFoodIds', 'savedMeals',
  'foodLibrary', 'measurements', 'weightLossPlans', 'program', 'sessions', 'habits', 'cardioLog', 'progressionPlans',
] as const;

const V12_COLLECTION_KEYS = [
  'activityLog', 'plannedFoodEntries', 'calorieReservations', 'dayTemplates', 'recoveryFeedback', 'pausePeriods',
  'weeklyCheckIns', 'coachRecommendations', 'planChanges', 'productEvents',
] as const;

const fixtureFoodIds = new Set([
  'demo_yogurt', 'demo_whey', 'demo_walnuts', 'demo_honey', 'demo_blueberries', 'demo_wrap', 'demo_chicken',
  'demo_pepper', 'demo_spinach', 'yest_eggs', 'yest_bread', 'yest_salmon', 'yest_potatoes', 'yest_beans',
]);

export interface DataSummary {
  profileFound: boolean;
  nutritionEntries: number;
  workouts: number;
  bodyMeasurements: number;
  habits: number;
  dateFrom: string | null;
  dateTo: string | null;
  fixtureRecords: number;
  totalRecords: number;
}

export interface MergeResult {
  data: AppData;
  duplicates: number;
  conflicts: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function validateAppData(value: unknown) {
  const errors: string[] = [];
  if (!isRecord(value)) return { valid: false, errors: ['The backup does not contain an application data object.'] };
  if (!Number.isInteger(value.version) || Number(value.version) < 1 || Number(value.version) > 100) errors.push('Invalid application data version.');
  if (!isRecord(value.profile)) errors.push('Profile is missing.');
  else {
    if (typeof value.profile.name !== 'string' || !value.profile.name.trim() || value.profile.name.length > 100) errors.push('Profile name is invalid.');
    for (const key of ['age', 'heightCm', 'goalWeightKg', 'calorieTarget', 'proteinTarget', 'carbTarget', 'fatTarget']) {
      if (typeof value.profile[key] !== 'number' || !Number.isFinite(value.profile[key])) errors.push(`Profile ${key} is invalid.`);
    }
  }
  const version = Number(value.version);
  const collectionKeys = version >= 12 ? [...CORE_COLLECTION_KEYS, ...V12_COLLECTION_KEYS] : CORE_COLLECTION_KEYS;
  for (const key of collectionKeys) {
    if (!Array.isArray(value[key])) errors.push(`${key} must be a list.`);
    else if (value[key].length > 100_000) errors.push(`${key} contains too many records.`);
  }
  if (!isRecord(value.nutritionSettings)) errors.push('Nutrition settings are missing.');
  if (!isRecord(value.bodyGoals)) errors.push('Body goals are missing.');
  if (!isRecord(value.trainingPlanner) || !Array.isArray(value.trainingPlanner.dailyPlans)) errors.push('Training planner is invalid.');
  if (!isRecord(value.squatProgression)) errors.push('Squat progression is invalid.');
  if (!isRecord(value.exerciseRestPreferences)) errors.push('Exercise rest preferences are invalid.');
  if (version >= 12) {
    if (!isRecord(value.activeGoal)) errors.push('Active goal is missing.');
    if (!isRecord(value.coachingSettings)) errors.push('Coaching settings are missing.');
    if (typeof value.onboardingCompleted !== 'boolean') errors.push('Onboarding status is invalid.');
  }
  if (typeof value.weeklyCardioTarget !== 'number' || value.weeklyCardioTarget < 0 || value.weeklyCardioTarget > 2_000) errors.push('Weekly cardio target is invalid.');
  return { valid: errors.length === 0, errors };
}

export function stripProductionFixtures(data: AppData): AppData {
  return {
    ...data,
    foodLog: data.foodLog.filter((entry) => !fixtureFoodIds.has(entry.id)),
    measurements: data.measurements.filter((measurement) => !measurement.isDemo && !measurement.id.startsWith('demo_weight_')),
    sessions: data.sessions.filter((session) => !session.id.startsWith('demo_session_')),
    savedMeals: data.savedMeals.filter((meal) => meal.id !== 'protein-yogurt-bowl'),
  };
}

function recordDate(record: unknown) {
  if (!isRecord(record)) return null;
  for (const key of ['date', 'measuredAt', 'createdAt', 'planStartDate']) {
    const value = record[key];
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  }
  return null;
}

export function summarizeAppData(data: AppData): DataSummary {
  const clean = stripProductionFixtures(data);
  const dates = [
    ...clean.foodLog.map(recordDate), ...clean.sessions.map(recordDate), ...clean.measurements.map(recordDate),
    ...clean.habits.map(recordDate), ...clean.cardioLog.map(recordDate),
  ].filter((date): date is string => Boolean(date)).sort();
  const fixtureRecords = data.foodLog.length - clean.foodLog.length + data.sessions.length - clean.sessions.length + data.measurements.length - clean.measurements.length;
  const totalRecords = clean.foodLog.length + clean.sessions.length + clean.measurements.length + clean.habits.length + clean.cardioLog.length + clean.weightLossPlans.length;
  return {
    profileFound: Boolean(data.profile.name.trim()),
    nutritionEntries: clean.foodLog.length,
    workouts: clean.sessions.length,
    bodyMeasurements: clean.measurements.length,
    habits: clean.habits.length,
    dateFrom: dates[0] ?? null,
    dateTo: dates.at(-1) ?? null,
    fixtureRecords,
    totalRecords,
  };
}

export function hasMeaningfulData(data: AppData) {
  const summary = summarizeAppData(data);
  const initial = createInitialData();
  return summary.totalRecords > 0 || JSON.stringify(data.profile) !== JSON.stringify(initial.profile)
    || JSON.stringify(data.bodyGoals) !== JSON.stringify(initial.bodyGoals)
    || JSON.stringify(data.nutritionSettings) !== JSON.stringify(initial.nutritionSettings);
}

function stableString(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableString).join(',')}]`;
  if (isRecord(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableString(value[key])}`).join(',')}}`;
  return JSON.stringify(value) ?? 'undefined';
}

export function appDataFingerprint(data: AppData) {
  return stableString(data);
}

function mergeList<T>(remote: T[], local: T[], keyOf: (item: T) => string, contentOf: (item: T) => string) {
  const byKey = new Map<string, T>();
  const content = new Set<string>();
  let duplicates = 0;
  let conflicts = 0;
  for (const item of remote) {
    byKey.set(keyOf(item), item);
    content.add(contentOf(item));
  }
  for (const item of local) {
    const key = keyOf(item);
    const signature = contentOf(item);
    const existing = byKey.get(key);
    if (existing) {
      if (stableString(existing) !== stableString(item)) conflicts += 1;
      else duplicates += 1;
      content.delete(contentOf(existing));
      byKey.set(key, item);
      content.add(signature);
    } else if (content.has(signature)) duplicates += 1;
    else {
      byKey.set(key, item);
      content.add(signature);
    }
  }
  return { values: [...byKey.values()], duplicates, conflicts };
}

export function mergeAppData(remoteInput: AppData, localInput: AppData): MergeResult {
  const remote = stripProductionFixtures(remoteInput);
  const local = stripProductionFixtures(localInput);
  let duplicates = 0;
  let conflicts = stableString(remote.profile) === stableString(local.profile) ? 0 : 1;
  const merge = <T,>(remoteList: T[], localList: T[], keyOf: (item: T) => string, contentOf = (item: T) => stableString(item)) => {
    const result = mergeList(remoteList, localList, keyOf, contentOf);
    duplicates += result.duplicates;
    conflicts += result.conflicts;
    return result.values;
  };
  const data: AppData = {
    ...remote,
    ...local,
    version: Math.max(remote.version, local.version, 12),
    profile: local.profile,
    foodLog: merge(remote.foodLog, local.foodLog, (item) => item.id, (item) => stableString({ ...item, id: undefined })),
    nutritionTargetHistory: merge(remote.nutritionTargetHistory, local.nutritionTargetHistory, (item) => item.date),
    nutritionDayRecords: merge(remote.nutritionDayRecords, local.nutritionDayRecords, (item) => item.date),
    favorites: [...new Set([...remote.favorites, ...local.favorites])],
    recentFoodIds: [...new Set([...local.recentFoodIds, ...remote.recentFoodIds])].slice(0, 20),
    savedMeals: merge(remote.savedMeals, local.savedMeals, (item) => item.id, (item) => stableString({ ...item, id: undefined })),
    foodLibrary: merge(remote.foodLibrary, local.foodLibrary, (item) => item.id),
    measurements: merge(remote.measurements, local.measurements, (item) => item.id, (item) => stableString({ measuredAt: item.measuredAt, weightKg: item.weightKg, source: item.source })),
    weightLossPlans: merge(remote.weightLossPlans, local.weightLossPlans, (item) => item.id),
    program: local.program,
    trainingPlanner: {
      ...local.trainingPlanner,
      dailyPlans: merge(remote.trainingPlanner.dailyPlans, local.trainingPlanner.dailyPlans, (item) => item.date),
    },
    sessions: merge(remote.sessions, local.sessions, (item) => item.id, (item) => stableString({ date: item.date, startedAt: item.startedAt, workoutId: item.workoutId })),
    habits: merge(remote.habits, local.habits, (item) => item.date),
    cardioLog: merge(remote.cardioLog, local.cardioLog, (item) => item.id, (item) => stableString({ ...item, id: undefined })),
    progressionPlans: merge(remote.progressionPlans, local.progressionPlans, (item) => item.exerciseId),
    exerciseRestPreferences: { ...remote.exerciseRestPreferences, ...local.exerciseRestPreferences },
    activeGoal: local.activeGoal,
    coachingSettings: local.coachingSettings,
    activityLog: merge(remote.activityLog, local.activityLog, (item) => item.date),
    plannedFoodEntries: merge(remote.plannedFoodEntries, local.plannedFoodEntries, (item) => item.id),
    calorieReservations: merge(remote.calorieReservations, local.calorieReservations, (item) => item.id),
    dayTemplates: merge(remote.dayTemplates, local.dayTemplates, (item) => item.id),
    recoveryFeedback: merge(remote.recoveryFeedback, local.recoveryFeedback, (item) => item.id),
    pausePeriods: merge(remote.pausePeriods, local.pausePeriods, (item) => item.id),
    weeklyCheckIns: merge(remote.weeklyCheckIns, local.weeklyCheckIns, (item) => item.id),
    coachRecommendations: merge(remote.coachRecommendations, local.coachRecommendations, (item) => item.id),
    planChanges: merge(remote.planChanges, local.planChanges, (item) => item.id),
    productEvents: merge(remote.productEvents, local.productEvents, (item) => item.id),
    onboardingCompleted: local.onboardingCompleted || remote.onboardingCompleted,
  };
  return { data, duplicates, conflicts };
}
