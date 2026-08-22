import { defaultProgram } from '../data/exercises';
import { createInitialData } from '../data/initialData';
import { DEFAULT_BODY_GOALS, withDetectedOutliers } from './bodyMeasurements';
import { DEFAULT_TRAINING_PLANNER, recalculateTrainingWeek } from './adaptivePlanner';
import { DEFAULT_NUTRITION_SETTINGS, detectedTimezone, nutritionTargetFromProfile } from './nutritionEvaluation';
import { toDateKey } from './date';
import { uid } from './id';
import { foodMap } from '../data/foods';
import { createFoodSnapshot } from './nutrition';
import type {
  AppData,
  BodyGoalSettings,
  BodyMeasurement,
  BodyMeasurementConfidence,
  DailyNutritionTargetSnapshot,
  NutritionDayRecord,
  NutritionEvaluationSettings,
  TrainingPlannerState,
  TrainingTemplate,
  UserProfile,
  WeightLossPlan,
  WorkoutDay,
  WorkoutId,
  FoodItem,
} from '../types/models';

const workoutIds = new Set<WorkoutId>(['upper_a', 'lower_a', 'upper_b', 'lower_b', 'full_body_a', 'full_body_b', 'full_body_c']);

export function inferWorkoutId(
  source: Pick<WorkoutDay, 'id' | 'title'> & { workoutId?: WorkoutId },
  template: TrainingTemplate = 'four-day-upper-lower',
): WorkoutId | undefined {
  if (source.workoutId && workoutIds.has(source.workoutId)) return source.workoutId;
  const title = source.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  if (title.includes('full body c')) return 'full_body_c';
  if (title.includes('full body b')) return 'full_body_b';
  if (title.includes('full body a')) return 'full_body_a';
  if (/\bupper\s*b\b/.test(title)) return 'upper_b';
  if (/\blower\s*b\b/.test(title)) return 'lower_b';
  if (/\bupper\s*a\b/.test(title)) return 'upper_a';
  if (/\blower\s*a\b/.test(title)) return 'lower_a';
  if (template === 'four-day-upper-lower') {
    const byDay: Partial<Record<WorkoutDay['id'], WorkoutId>> = { monday: 'upper_a', tuesday: 'lower_a', thursday: 'upper_b', saturday: 'lower_b' };
    return byDay[source.id];
  }
  if (source.id === 'monday') return 'full_body_a';
  if (source.id === 'thursday') return 'full_body_b';
  if (template === 'three-day-full-body' && source.id === 'saturday') return 'full_body_c';
  return undefined;
}

interface LegacyWeightEntry {
  id: string;
  date: string;
  weightKg: number;
  recordedAt?: string;
  source?: 'manual' | 'fitdays_ai_image';
  sourceMeasurementId?: string;
}

type LegacyMeasurement = Partial<BodyMeasurement> & {
  timestamp?: string | null;
  bodyWaterKg?: number | null;
  confidence?: BodyMeasurementConfidence & { timestamp?: number | null };
};

export type LegacyAppData = Omit<AppData, 'profile' | 'measurements' | 'bodyGoals' | 'weightLossPlans' | 'trainingPlanner' | 'nutritionTargetHistory' | 'nutritionSettings' | 'nutritionDayRecords' | 'foodLibrary' | 'exerciseRestPreferences' | 'activeGoal' | 'coachingSettings' | 'activityLog' | 'plannedFoodEntries' | 'calorieReservations' | 'dayTemplates' | 'recoveryFeedback' | 'pausePeriods' | 'weeklyCheckIns' | 'coachRecommendations' | 'planChanges' | 'productEvents' | 'onboardingCompleted'> & {
  profile: UserProfile & { startWeightKg?: number; currentWeightKg?: number };
  measurements?: LegacyMeasurement[];
  bodyMeasurements?: LegacyMeasurement[];
  weights?: LegacyWeightEntry[];
  bodyGoals?: Partial<BodyGoalSettings>;
  weightLossPlans?: WeightLossPlan[];
  nutritionTargetHistory?: DailyNutritionTargetSnapshot[];
  nutritionSettings?: Partial<NutritionEvaluationSettings>;
  nutritionDayRecords?: NutritionDayRecord[];
  trainingPlanner?: Partial<TrainingPlannerState>;
  foodLibrary?: FoodItem[];
  exerciseRestPreferences?: Record<string, number>;
  activeGoal?: AppData['activeGoal'];
  coachingSettings?: Partial<AppData['coachingSettings']>;
  activityLog?: AppData['activityLog'];
  plannedFoodEntries?: AppData['plannedFoodEntries'];
  calorieReservations?: AppData['calorieReservations'];
  dayTemplates?: AppData['dayTemplates'];
  recoveryFeedback?: AppData['recoveryFeedback'];
  pausePeriods?: AppData['pausePeriods'];
  weeklyCheckIns?: AppData['weeklyCheckIns'];
  coachRecommendations?: AppData['coachRecommendations'];
  planChanges?: AppData['planChanges'];
  productEvents?: AppData['productEvents'];
  onboardingCompleted?: boolean;
};

export const emptyMeasurementValues = {
  weightKg: null, bmi: null, bodyFatPercent: null, fatMassKg: null, fatFreeMassKg: null,
  muscleMassKg: null, musclePercent: null, skeletalMusclePercent: null, boneMassKg: null,
  proteinMassKg: null, proteinPercent: null, waterMassKg: null, bodyWaterPercent: null,
  subcutaneousFatPercent: null, visceralFatIndex: null, bmrKcal: null, bodyAge: null,
  waistCircumferenceCm: null,
};

function canonicalMeasurement(measurement: LegacyMeasurement): BodyMeasurement {
  const legacyConfidence = measurement.confidence;
  const confidence = legacyConfidence ? { ...legacyConfidence, measuredAt: legacyConfidence.measuredAt ?? legacyConfidence.timestamp ?? null } : undefined;
  if (confidence && 'timestamp' in confidence) delete (confidence as { timestamp?: number | null }).timestamp;
  const { timestamp, bodyWaterKg, ...canonical } = measurement;
  return {
    ...emptyMeasurementValues,
    ...canonical,
    id: measurement.id ?? uid('measurement'),
    measuredAt: measurement.measuredAt ?? timestamp ?? null,
    waterMassKg: measurement.waterMassKg ?? bodyWaterKg ?? null,
    source: measurement.source ?? 'fitdays_ai_image',
    createdAt: measurement.createdAt ?? new Date().toISOString(),
    ...(confidence ? { confidence } : {}),
  };
}

export function migrateAppData(saved: AppData | LegacyAppData): AppData {
  const legacy = saved as LegacyAppData;
  const fallback = createInitialData();
  const needsProgramUpgrade = !Array.isArray(legacy.program) || legacy.version < 4 || legacy.program.length !== 7;
  const profile = { ...fallback.profile, ...legacy.profile };
  delete profile.startWeightKg;
  delete profile.currentWeightKg;
  const importedMeasurements = [...(legacy.measurements ?? legacy.bodyMeasurements ?? [])].map(canonicalMeasurement);
  const representedWeightIds = new Set(importedMeasurements.map((measurement) => measurement.id));
  const legacyWeights = (legacy.weights ?? []).flatMap((weight): BodyMeasurement[] => {
    if (weight.sourceMeasurementId && representedWeightIds.has(weight.sourceMeasurementId)) return [];
    return [{
      ...emptyMeasurementValues,
      id: weight.id,
      measuredAt: weight.recordedAt ?? `${weight.date}T12:00:00`,
      weightKg: weight.weightKg,
      source: weight.source ?? 'manual',
      createdAt: weight.recordedAt ?? `${weight.date}T12:00:00`,
      isDemo: weight.id.startsWith('demo_weight_'),
    }];
  });
  const combinedMeasurements = [...importedMeasurements, ...legacyWeights];
  const measurements = withDetectedOutliers(combinedMeasurements.some((measurement) => !measurement.isDemo)
    ? combinedMeasurements.filter((measurement) => !measurement.isDemo)
    : combinedMeasurements);
  const firstNutritionDate = (legacy.foodLog ?? []).map((entry) => entry.date).sort()[0] ?? toDateKey();
  const foodLibrary = legacy.foodLibrary ?? [];
  const migratedFoodLog = (legacy.foodLog ?? []).map((entry) => {
    if (entry.snapshot) return entry;
    const food = foodLibrary.find((item) => item.id === entry.foodId) ?? foodMap.get(entry.foodId);
    const snapshot = food ? createFoodSnapshot(food, entry.servingId, entry.quantity) : null;
    return snapshot ? { ...entry, snapshot } : entry;
  });
  const nutritionTargetHistory = legacy.nutritionTargetHistory?.length
    ? legacy.nutritionTargetHistory
    : [nutritionTargetFromProfile(profile as UserProfile, firstNutritionDate, detectedTimezone())];
  const base: AppData = {
    ...fallback,
    ...legacy,
    profile: {
      ...profile,
      trainingDays: profile.trainingDays ?? fallback.profile.trainingDays,
      balanceLevel: profile.balanceLevel ?? 'beginner',
      trainingTemplate: profile.trainingTemplate ?? 'four-day-upper-lower',
    },
    foodLog: migratedFoodLog,
    favorites: legacy.favorites ?? [],
    recentFoodIds: legacy.recentFoodIds ?? [],
    savedMeals: legacy.savedMeals ?? [],
    foodLibrary,
    sessions: legacy.sessions ?? [],
    habits: legacy.habits ?? [],
    program: needsProgramUpgrade ? structuredClone(defaultProgram) : legacy.program,
    measurements,
    bodyGoals: { ...DEFAULT_BODY_GOALS, ...legacy.bodyGoals, version: 1 },
    weightLossPlans: legacy.weightLossPlans ?? [],
    nutritionTargetHistory,
    nutritionSettings: {
      ...DEFAULT_NUTRITION_SETTINGS,
      ...legacy.nutritionSettings,
      version: 1,
      calories: { ...DEFAULT_NUTRITION_SETTINGS.calories, ...legacy.nutritionSettings?.calories },
      protein: { ...DEFAULT_NUTRITION_SETTINGS.protein, ...legacy.nutritionSettings?.protein },
      macros: { ...DEFAULT_NUTRITION_SETTINGS.macros, ...legacy.nutritionSettings?.macros },
    },
    nutritionDayRecords: legacy.nutritionDayRecords ?? [],
    trainingPlanner: {
      ...DEFAULT_TRAINING_PLANNER,
      ...legacy.trainingPlanner,
      version: 1,
      dailyPlans: legacy.trainingPlanner?.dailyPlans ?? [],
      recoveryHeuristics: { ...DEFAULT_TRAINING_PLANNER.recoveryHeuristics, ...legacy.trainingPlanner?.recoveryHeuristics },
      weeklyTargets: { ...DEFAULT_TRAINING_PLANNER.weeklyTargets, ...legacy.trainingPlanner?.weeklyTargets },
    },
    cardioLog: legacy.cardioLog ?? [],
    weeklyCardioTarget: legacy.weeklyCardioTarget ?? 105,
    squatProgression: legacy.squatProgression ?? fallback.squatProgression,
    progressionPlans: legacy.progressionPlans ?? [],
    exerciseRestPreferences: legacy.exerciseRestPreferences ?? {},
    activeGoal: legacy.activeGoal ?? {
      ...fallback.activeGoal,
      startingWeightKg: measurements.find((item) => item.weightKg != null)?.weightKg ?? null,
      targetWeightKg: profile.goalWeightKg,
      targetRangeKg: [profile.goalWeightKg - .5, profile.goalWeightKg + .5],
    },
    coachingSettings: { ...fallback.coachingSettings, ...legacy.coachingSettings, version: 1 },
    activityLog: legacy.activityLog ?? [],
    plannedFoodEntries: legacy.plannedFoodEntries ?? [],
    calorieReservations: legacy.calorieReservations ?? [],
    dayTemplates: legacy.dayTemplates ?? [],
    recoveryFeedback: legacy.recoveryFeedback ?? [],
    pausePeriods: legacy.pausePeriods ?? [],
    weeklyCheckIns: legacy.weeklyCheckIns ?? [],
    coachRecommendations: legacy.coachRecommendations ?? [],
    planChanges: legacy.planChanges ?? [],
    productEvents: legacy.productEvents ?? [],
    onboardingCompleted: legacy.onboardingCompleted ?? legacy.version < 12,
  };
  const template = base.profile.trainingTemplate;
  const program = base.program.map((day) => day.isRestDay ? { ...day, workoutId: undefined } : { ...day, workoutId: inferWorkoutId(day, template) });
  const programByDay = new Map(program.map((day) => [day.id, day]));
  const sessions = base.sessions.map((session) => {
    const legacySession = session as typeof session & { workoutId?: WorkoutId };
    const workoutId = legacySession.workoutId
      ?? inferWorkoutId({ id: legacySession.dayId, title: legacySession.title }, template)
      ?? programByDay.get(legacySession.dayId)?.workoutId;
    return { ...session, workoutId: workoutId ?? `legacy_${legacySession.dayId}` };
  });
  const migrated = { ...base, version: 12, program, sessions };
  return { ...migrated, trainingPlanner: recalculateTrainingWeek(migrated) };
}
