import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createSeedData } from '../data/seed';
import { defaultProgram } from '../data/exercises';
import { foodMap } from '../data/foods';
import { addMacros, entryMacros } from '../lib/nutrition';
import { uid } from '../lib/id';
import { buildProgramTemplate } from '../lib/workout';
import { DEFAULT_BODY_GOALS, withDetectedOutliers } from '../lib/bodyMeasurements';
import { DEFAULT_TRAINING_PLANNER, dayIdForDate, moveTrainingSession as movePlannerSession, recalculateTrainingWeek, restoreRecommendedWeek as restorePlannerWeek, selectTrainingSession as selectPlannerSession, workoutTemplate } from '../lib/adaptivePlanner';
import { toDateKey } from '../lib/date';
import type { AppData, BodyGoalSettings, BodyMeasurement, BodyMeasurementConfidence, BodyMeasurementDraft, BodyMetricKey, CardioEntry, FoodLogEntry, HabitEntry, LoggedSet, MealType, ProgressionPlan, ReadinessResponse, SessionTemplateId, SquatProgressionLevel, TrainingDayPlan, TrainingPlannerState, TrainingSelectionSource, TrainingTemplate, UserProfile, WorkoutDay, WorkoutId, WorkoutSession } from '../types/models';

const STORAGE_KEY = 'cut-forward-data-v1';

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

type LegacyAppData = Omit<AppData, 'profile' | 'measurements' | 'bodyGoals' | 'trainingPlanner'> & {
  profile: UserProfile & { startWeightKg?: number; currentWeightKg?: number };
  measurements?: LegacyMeasurement[];
  bodyMeasurements?: LegacyMeasurement[];
  weights?: LegacyWeightEntry[];
  bodyGoals?: Partial<BodyGoalSettings>;
  trainingPlanner?: Partial<TrainingPlannerState>;
};

const emptyMeasurementValues = {
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
  const needsProgramUpgrade = legacy.version < 4 || legacy.program.length !== 7;
  const profile = { ...legacy.profile };
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
  const withoutLegacyCollections = { ...legacy };
  delete withoutLegacyCollections.weights;
  delete withoutLegacyCollections.bodyMeasurements;
  const base: AppData = {
    ...withoutLegacyCollections,
    profile: {
      ...profile,
      trainingDays: profile.trainingDays ?? ['Monday', 'Tuesday', 'Thursday', 'Saturday'],
      balanceLevel: profile.balanceLevel ?? 'beginner',
      trainingTemplate: profile.trainingTemplate ?? 'four-day-upper-lower',
    },
    program: needsProgramUpgrade ? structuredClone(defaultProgram) : legacy.program,
    measurements,
    bodyGoals: { ...DEFAULT_BODY_GOALS, ...legacy.bodyGoals, version: 1 },
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
    squatProgression: legacy.squatProgression ?? { currentLevel: 'assisted-squat', stableSessions: 0, updatedAt: new Date().toISOString() },
    progressionPlans: legacy.progressionPlans ?? [],
  };
  const template = base.profile.trainingTemplate;
  const program = base.program.map((day) => day.isRestDay ? { ...day, workoutId: undefined } : { ...day, workoutId: inferWorkoutId(day, template) });
  const programByDay = new Map(program.map((day) => [day.id, day]));
  const sessions = base.sessions.map((session) => {
    const legacySession = session as WorkoutSession & { workoutId?: WorkoutId };
    const workoutId = legacySession.workoutId
      ?? inferWorkoutId({ id: legacySession.dayId, title: legacySession.title }, template)
      ?? programByDay.get(legacySession.dayId)?.workoutId;
    return { ...session, workoutId: workoutId ?? `legacy_${legacySession.dayId}` };
  });
  const migrated = { ...base, version: 8, program, sessions };
  return { ...migrated, trainingPlanner: recalculateTrainingWeek(migrated) };
}

function loadData(): AppData {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return migrateAppData(JSON.parse(saved) as AppData | LegacyAppData);
  } catch {
    // Fall through to safe seed data if storage is corrupted or unavailable.
  }
  return migrateAppData(createSeedData());
}

export function useAppData() {
  const [data, setData] = useState<AppData>(loadData);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [data]);

  const update = useCallback((recipe: (current: AppData) => AppData) => setData((current) => recipe(current)), []);
  const plannerDate = useRef(toDateKey());

  useEffect(() => {
    const timer = window.setInterval(() => {
      const currentDate = toDateKey();
      if (currentDate === plannerDate.current) return;
      plannerDate.current = currentDate;
      update((current) => ({ ...current, trainingPlanner: recalculateTrainingWeek(current, currentDate) }));
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [update]);

  const addFood = useCallback((entry: Omit<FoodLogEntry, 'id' | 'createdAt'>) => {
    update((current) => ({
      ...current,
      foodLog: [...current.foodLog, { ...entry, id: uid('food'), createdAt: new Date().toISOString() }],
      recentFoodIds: [entry.foodId, ...current.recentFoodIds.filter((id) => id !== entry.foodId)].slice(0, 8),
    }));
  }, [update]);

  const updateFood = useCallback((id: string, changes: Partial<Pick<FoodLogEntry, 'meal' | 'servingId' | 'quantity'>>) => {
    update((current) => ({ ...current, foodLog: current.foodLog.map((entry) => entry.id === id ? { ...entry, ...changes } : entry) }));
  }, [update]);

  const deleteFood = useCallback((id: string) => update((current) => ({ ...current, foodLog: current.foodLog.filter((entry) => entry.id !== id) })), [update]);

  const duplicateFood = useCallback((id: string) => update((current) => {
    const source = current.foodLog.find((entry) => entry.id === id);
    if (!source) return current;
    return { ...current, foodLog: [...current.foodLog, { ...source, id: uid('food'), createdAt: new Date().toISOString() }] };
  }), [update]);

  const toggleFavorite = useCallback((foodId: string) => update((current) => ({
    ...current,
    favorites: current.favorites.includes(foodId) ? current.favorites.filter((id) => id !== foodId) : [...current.favorites, foodId],
  })), [update]);

  const repeatMeal = useCallback((sourceDate: string, targetDate: string, meal: MealType) => update((current) => {
    const copies = current.foodLog.filter((entry) => entry.date === sourceDate && entry.meal === meal).map((entry) => ({ ...entry, id: uid('food'), date: targetDate, createdAt: new Date().toISOString() }));
    return { ...current, foodLog: [...current.foodLog, ...copies] };
  }), [update]);

  const addSavedMeal = useCallback((savedMealId: string, date: string, meal: MealType) => update((current) => {
    const saved = current.savedMeals.find((item) => item.id === savedMealId);
    if (!saved) return current;
    const entries = saved.items.map((item) => ({ ...item, id: uid('food'), date, meal, createdAt: new Date().toISOString() }));
    return { ...current, foodLog: [...current.foodLog, ...entries] };
  }), [update]);

  const saveWeight = useCallback((date: string, weightKg: number, waistCircumferenceCm: number | null = null) => update((current) => {
    const withoutDemo = current.measurements.filter((item) => !item.isDemo);
    const existing = withoutDemo.find((item) => item.measuredAt?.slice(0, 10) === date && item.source === 'manual');
    const measurement: BodyMeasurement = {
      ...emptyMeasurementValues,
      ...(existing ?? {}),
      id: existing?.id ?? uid('measurement'),
      measuredAt: existing?.measuredAt ?? `${date}T12:00:00`,
      weightKg,
      waistCircumferenceCm,
      source: 'manual',
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    };
    const measurements = existing
      ? withoutDemo.map((item) => item.id === existing.id ? measurement : item)
      : [...withoutDemo, measurement];
    return { ...current, measurements: withDetectedOutliers(measurements) };
  }), [update]);

  const saveBodyMeasurement = useCallback((draft: BodyMeasurementDraft, replaceId?: string) => update((current) => {
    const id = replaceId ?? uid('measurement');
    const measurement: BodyMeasurement = { ...draft, id, createdAt: new Date().toISOString() };
    const genuine = current.measurements.filter((item) => !item.isDemo);
    const measurements = replaceId
      ? genuine.map((item) => item.id === replaceId ? measurement : item)
      : [...genuine, measurement];
    return {
      ...current,
      measurements: withDetectedOutliers(measurements),
      bodyGoals: {
        ...current.bodyGoals,
        fatFreeMassTargetKg: current.bodyGoals.fatFreeMassTargetKg ?? draft.fatFreeMassKg,
        muscleMassTargetKg: current.bodyGoals.muscleMassTargetKg ?? draft.muscleMassKg,
      },
    };
  }), [update]);

  const updateBodyGoals = useCallback((bodyGoals: BodyGoalSettings) => update((current) => ({ ...current, bodyGoals })), [update]);

  const confirmMeasurementMetric = useCallback((measurementId: string, metric: BodyMetricKey) => update((current) => ({
    ...current,
    measurements: current.measurements.map((measurement) => measurement.id !== measurementId ? measurement : {
      ...measurement,
      excludedFromTrend: (measurement.excludedFromTrend ?? []).filter((item) => item !== metric),
      confirmedOutlierMetrics: [...new Set([...(measurement.confirmedOutlierMetrics ?? []), metric])],
    }),
  })), [update]);

  const updateProfile = useCallback((profile: UserProfile) => update((current) => ({ ...current, profile })), [update]);

  const updateProgramDay = useCallback((day: WorkoutDay) => update((current) => {
    const next = { ...current, program: current.program.map((item) => item.id === day.id ? day : item) };
    return { ...next, trainingPlanner: recalculateTrainingWeek(next) };
  }), [update]);

  const selectTrainingSession = useCallback((date: string, templateId: SessionTemplateId, source: TrainingSelectionSource = 'user_selected', warningShown = false, readiness?: ReadinessResponse) => update((current) => ({
    ...current,
    trainingPlanner: selectPlannerSession(current, date, templateId, source, warningShown, readiness),
  })), [update]);

  const skipTrainingDay = useCallback((date: string) => update((current) => {
    const plans = current.trainingPlanner.dailyPlans.map((plan) => plan.date === date ? { ...plan, status: 'skipped' as const } : plan);
    const next = { ...current, trainingPlanner: { ...current.trainingPlanner, dailyPlans: plans } };
    return { ...next, trainingPlanner: recalculateTrainingWeek(next, date) };
  }), [update]);

  const moveTrainingSession = useCallback((fromDate: string, toDate: string, swap: boolean) => update((current) => ({
    ...current,
    trainingPlanner: movePlannerSession(current, fromDate, toDate, swap),
  })), [update]);

  const restoreRecommendedWeek = useCallback((date = toDateKey()) => update((current) => ({
    ...current,
    trainingPlanner: restorePlannerWeek(current, date),
  })), [update]);

  const recalculateTrainingPlan = useCallback((date = toDateKey()) => update((current) => ({
    ...current,
    trainingPlanner: recalculateTrainingWeek(current, date),
  })), [update]);

  const keepCurrentTrainingWeek = useCallback((previousPlans: TrainingDayPlan[], selectedDate: string) => update((current) => {
    const previousByDate = new Map(previousPlans.map((plan) => [plan.date, plan]));
    const dailyPlans = current.trainingPlanner.dailyPlans.map((plan) => {
      const previous = previousByDate.get(plan.date);
      if (!previous || plan.date <= selectedDate || plan.status === 'completed') return plan;
      return {
        ...plan,
        selectedSessionTemplateId: previous.selectedSessionTemplateId,
        selectionSource: previous.selectionSource.startsWith('user_') ? previous.selectionSource : 'user_selected' as const,
        status: previous.selectedSessionTemplateId === 'full_rest' ? 'rest' as const : 'selected' as const,
      };
    });
    const next = { ...current, trainingPlanner: { ...current.trainingPlanner, dailyPlans } };
    return { ...next, trainingPlanner: recalculateTrainingWeek(next, selectedDate) };
  }), [update]);

  const addCardio = useCallback((date: string, minutes: number, activity: CardioEntry['activity']) => update((current) => {
    const next = { ...current, cardioLog: [...current.cardioLog, { id: uid('cardio'), date, minutes, activity }] };
    return { ...next, trainingPlanner: recalculateTrainingWeek(next, date) };
  }), [update]);

  const setWeeklyCardioTarget = useCallback((minutes: number) => update((current) => {
    const next = { ...current, weeklyCardioTarget: Math.max(30, Math.min(150, minutes)) };
    return { ...next, trainingPlanner: recalculateTrainingWeek(next) };
  }), [update]);

  const setSquatProgression = useCallback((level: SquatProgressionLevel) => update((current) => ({
    ...current,
    squatProgression: { currentLevel: level, stableSessions: 0, updatedAt: new Date().toISOString() },
    program: current.program.map((day) => ({ ...day, exercises: day.exercises.map((exercise) => exercise.variationGroup === 'squat-progression' ? { ...exercise, exerciseId: level } : exercise) })),
  })), [update]);

  const applyTrainingTemplate = useCallback((template: TrainingTemplate) => update((current) => {
    const program = buildProgramTemplate(template, current.squatProgression.currentLevel);
    const trainingDays = program.filter((day) => !day.isRestDay).map((day) => ({ monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday', thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday' }[day.id]));
    const next = { ...current, program, profile: { ...current.profile, trainingTemplate: template, trainingDays } };
    return { ...next, trainingPlanner: restorePlannerWeek(next) };
  }), [update]);

  const confirmProgression = useCallback((exerciseId: string, targetWeightKg: number, reason: ProgressionPlan['reason']) => update((current) => ({
    ...current,
    progressionPlans: [...current.progressionPlans.filter((item) => item.exerciseId !== exerciseId), { exerciseId, targetWeightKg, reason, confirmedAt: new Date().toISOString() }],
  })), [update]);

  const startWorkout = useCallback((day: WorkoutDay, date = toDateKey()) => {
    if (day.isRestDay || day.exercises.length === 0) return null;
    const lightVersion = data.trainingPlanner.dailyPlans.find((plan) => plan.date === date)?.readinessResponse?.preferredIntensity === 'light';
    const previousCompleted = data.sessions.filter((session) => session.completedAt).flatMap((session) => session.sets).filter((set) => set.completed && !set.isWarmup);
    const sets: LoggedSet[] = day.exercises.flatMap((exercise) => {
      const previous = previousCompleted.filter((set) => set.exerciseId === exercise.exerciseId).slice(-exercise.sets);
      const confirmedLoad = data.progressionPlans.find((item) => item.exerciseId === exercise.exerciseId)?.targetWeightKg;
      const workingLoad = confirmedLoad ?? previous.at(-1)?.weightKg ?? 0;
      const selectedLoad = lightVersion && workingLoad > 0 ? Math.round(workingLoad * .9 * 2) / 2 : workingLoad;
      const warmupCount = exercise.warmupSets ?? 0;
      const warmups = Array.from({ length: warmupCount }, (_, index) => ({
        id: uid('set'), exerciseId: exercise.exerciseId, setNumber: index + 1,
        weightKg: selectedLoad > 0 ? Math.round(selectedLoad * (.45 + index * .15) * 2) / 2 : 0,
        reps: Math.max(4, 8 - index * 2), completed: false, isWarmup: true,
      }));
      const working = Array.from({ length: lightVersion ? Math.max(1, exercise.sets - 1) : exercise.sets }, (_, index) => ({
        id: uid('set'), exerciseId: exercise.exerciseId, setNumber: index + 1,
        weightKg: lightVersion ? selectedLoad : confirmedLoad ?? previous[index]?.weightKg ?? previous.at(-1)?.weightKg ?? 0,
        reps: previous[index]?.reps ?? 0, completed: false, isWarmup: false,
      }));
      return [...warmups, ...working];
    });
    if (!day.workoutId) return null;
    const session: WorkoutSession = { id: uid('session'), date, dayId: dayIdForDate(date), workoutId: day.workoutId, title: lightVersion ? `${day.title} · Light` : day.title, startedAt: new Date().toISOString(), durationSeconds: 0, sets };
    const plannedExercises = new Set(day.exercises.map((exercise) => exercise.exerciseId));
    update((current) => ({ ...current, sessions: [...current.sessions, session], progressionPlans: current.progressionPlans.filter((item) => !plannedExercises.has(item.exerciseId)) }));
    return session.id;
  }, [data.progressionPlans, data.sessions, data.trainingPlanner.dailyPlans, update]);

  const startWorkoutTemplate = useCallback((templateId: SessionTemplateId, date = toDateKey()) => {
    const template = workoutTemplate(data.program, templateId);
    if (!template) return null;
    return startWorkout(template, date);
  }, [data.program, startWorkout]);

  const discardWorkout = useCallback((sessionId: string) => update((current) => ({ ...current, sessions: current.sessions.filter((session) => session.id !== sessionId) })), [update]);

  const updateWorkoutSet = useCallback((sessionId: string, setId: string, changes: Partial<Pick<LoggedSet, 'weightKg' | 'reps' | 'completed' | 'rir'>>) => update((current) => ({
    ...current,
    sessions: current.sessions.map((session) => session.id === sessionId ? { ...session, sets: session.sets.map((set) => set.id === setId ? { ...set, ...changes } : set) } : session),
  })), [update]);

  const finishWorkout = useCallback((sessionId: string, durationSeconds: number) => update((current) => {
    const completedAt = new Date().toISOString();
    const session = current.sessions.find((item) => item.id === sessionId);
    const next = { ...current, sessions: current.sessions.map((item) => item.id === sessionId ? { ...item, completedAt, durationSeconds } : item) };
    return session ? { ...next, trainingPlanner: recalculateTrainingWeek(next, session.date) } : next;
  }), [update]);

  const updateHabit = useCallback((date: string, changes: Partial<Omit<HabitEntry, 'date'>>) => update((current) => {
    const existing = current.habits.find((entry) => entry.date === date);
    const habits = existing ? current.habits.map((entry) => entry.date === date ? { ...entry, ...changes } : entry) : [...current.habits, { date, water: false, walk: false, sleep: false, ...changes }];
    return { ...current, habits };
  }), [update]);

  const resetDemo = useCallback(() => {
    const seed = migrateAppData(createSeedData());
    setData(seed);
    return seed;
  }, []);

  const totalsForDate = useCallback((date: string) => {
    const macros = data.foodLog.filter((entry) => entry.date === date).flatMap((entry) => {
      const food = foodMap.get(entry.foodId);
      return food ? [entryMacros(food, entry)] : [];
    });
    return addMacros(macros);
  }, [data.foodLog]);

  return useMemo(() => ({
    data, addFood, updateFood, deleteFood, duplicateFood, toggleFavorite, repeatMeal, addSavedMeal,
    saveWeight, saveBodyMeasurement, updateBodyGoals, confirmMeasurementMetric, updateProfile, updateProgramDay, selectTrainingSession, skipTrainingDay, moveTrainingSession, restoreRecommendedWeek, recalculateTrainingPlan, keepCurrentTrainingWeek, addCardio, setWeeklyCardioTarget, setSquatProgression, applyTrainingTemplate, confirmProgression,
    startWorkout, startWorkoutTemplate, discardWorkout, updateWorkoutSet, finishWorkout, updateHabit, resetDemo, totalsForDate,
  }), [data, addFood, updateFood, deleteFood, duplicateFood, toggleFavorite, repeatMeal, addSavedMeal, saveWeight, saveBodyMeasurement, updateBodyGoals, confirmMeasurementMetric, updateProfile, updateProgramDay, selectTrainingSession, skipTrainingDay, moveTrainingSession, restoreRecommendedWeek, recalculateTrainingPlan, keepCurrentTrainingWeek, addCardio, setWeeklyCardioTarget, setSquatProgression, applyTrainingTemplate, confirmProgression, startWorkout, startWorkoutTemplate, discardWorkout, updateWorkoutSet, finishWorkout, updateHabit, resetDemo, totalsForDate]);
}

export type AppController = ReturnType<typeof useAppData>;
