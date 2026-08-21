import { useCallback, useEffect, useMemo, useState } from 'react';
import { createSeedData } from '../data/seed';
import { defaultProgram } from '../data/exercises';
import { foodMap } from '../data/foods';
import { addMacros, entryMacros } from '../lib/nutrition';
import { uid } from '../lib/id';
import { buildProgramTemplate } from '../lib/workout';
import type { AppData, CardioEntry, FoodLogEntry, HabitEntry, LoggedSet, MealType, ProgressionPlan, SquatProgressionLevel, TrainingTemplate, UserProfile, WeightEntry, WorkoutDay, WorkoutSession } from '../types/models';

const STORAGE_KEY = 'cut-forward-data-v1';

export function migrateAppData(saved: AppData): AppData {
  const legacy = saved as AppData & Partial<Pick<AppData, 'cardioLog' | 'weeklyCardioTarget' | 'squatProgression' | 'progressionPlans'>>;
  if (saved.version >= 4 && saved.program.length === 7 && legacy.cardioLog && legacy.squatProgression && legacy.progressionPlans) return saved;
  return {
    ...saved,
    version: 4,
    profile: {
      ...saved.profile,
      trainingDays: ['Monday', 'Tuesday', 'Thursday', 'Saturday'],
      balanceLevel: saved.profile.balanceLevel ?? 'beginner',
      trainingTemplate: saved.profile.trainingTemplate ?? 'four-day-upper-lower',
    },
    program: structuredClone(defaultProgram),
    cardioLog: legacy.cardioLog ?? [],
    weeklyCardioTarget: legacy.weeklyCardioTarget ?? 105,
    squatProgression: legacy.squatProgression ?? { currentLevel: 'assisted-squat', stableSessions: 0, updatedAt: new Date().toISOString() },
    progressionPlans: legacy.progressionPlans ?? [],
  };
}

function loadData(): AppData {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return migrateAppData(JSON.parse(saved) as AppData);
  } catch {
    // Fall through to safe seed data if storage is corrupted or unavailable.
  }
  return createSeedData();
}

export function useAppData() {
  const [data, setData] = useState<AppData>(loadData);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [data]);

  const update = useCallback((recipe: (current: AppData) => AppData) => setData((current) => recipe(current)), []);

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

  const saveWeight = useCallback((date: string, weightKg: number) => update((current) => {
    const existing = current.weights.find((item) => item.date === date);
    const weights: WeightEntry[] = existing
      ? current.weights.map((item) => item.date === date ? { ...item, weightKg } : item)
      : [...current.weights, { id: uid('weight'), date, weightKg }];
    return { ...current, weights, profile: { ...current.profile, currentWeightKg: weightKg } };
  }), [update]);

  const updateProfile = useCallback((profile: UserProfile) => update((current) => ({ ...current, profile })), [update]);

  const updateProgramDay = useCallback((day: WorkoutDay) => update((current) => ({ ...current, program: current.program.map((item) => item.id === day.id ? day : item) })), [update]);

  const addCardio = useCallback((date: string, minutes: number, activity: CardioEntry['activity']) => update((current) => ({
    ...current,
    cardioLog: [...current.cardioLog, { id: uid('cardio'), date, minutes, activity }],
  })), [update]);

  const setWeeklyCardioTarget = useCallback((minutes: number) => update((current) => ({ ...current, weeklyCardioTarget: Math.max(30, Math.min(150, minutes)) })), [update]);

  const setSquatProgression = useCallback((level: SquatProgressionLevel) => update((current) => ({
    ...current,
    squatProgression: { currentLevel: level, stableSessions: 0, updatedAt: new Date().toISOString() },
    program: current.program.map((day) => ({ ...day, exercises: day.exercises.map((exercise) => exercise.variationGroup === 'squat-progression' ? { ...exercise, exerciseId: level } : exercise) })),
  })), [update]);

  const applyTrainingTemplate = useCallback((template: TrainingTemplate) => update((current) => {
    const program = buildProgramTemplate(template, current.squatProgression.currentLevel);
    const trainingDays = program.filter((day) => !day.isRestDay).map((day) => ({ monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday', thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday' }[day.id]));
    return { ...current, program, profile: { ...current.profile, trainingTemplate: template, trainingDays } };
  }), [update]);

  const confirmProgression = useCallback((exerciseId: string, targetWeightKg: number, reason: ProgressionPlan['reason']) => update((current) => ({
    ...current,
    progressionPlans: [...current.progressionPlans.filter((item) => item.exerciseId !== exerciseId), { exerciseId, targetWeightKg, reason, confirmedAt: new Date().toISOString() }],
  })), [update]);

  const startWorkout = useCallback((day: WorkoutDay) => {
    if (day.isRestDay || day.exercises.length === 0) return null;
    const previousCompleted = data.sessions.filter((session) => session.completedAt).flatMap((session) => session.sets).filter((set) => set.completed && !set.isWarmup);
    const sets: LoggedSet[] = day.exercises.flatMap((exercise) => {
      const previous = previousCompleted.filter((set) => set.exerciseId === exercise.exerciseId).slice(-exercise.sets);
      const confirmedLoad = data.progressionPlans.find((item) => item.exerciseId === exercise.exerciseId)?.targetWeightKg;
      const workingLoad = confirmedLoad ?? previous.at(-1)?.weightKg ?? 0;
      const warmupCount = exercise.warmupSets ?? 0;
      const warmups = Array.from({ length: warmupCount }, (_, index) => ({
        id: uid('set'), exerciseId: exercise.exerciseId, setNumber: index + 1,
        weightKg: workingLoad > 0 ? Math.round(workingLoad * (.45 + index * .15) * 2) / 2 : 0,
        reps: Math.max(4, 8 - index * 2), completed: false, isWarmup: true,
      }));
      const working = Array.from({ length: exercise.sets }, (_, index) => ({
        id: uid('set'), exerciseId: exercise.exerciseId, setNumber: index + 1,
        weightKg: confirmedLoad ?? previous[index]?.weightKg ?? previous.at(-1)?.weightKg ?? 0,
        reps: previous[index]?.reps ?? 0, completed: false, isWarmup: false,
      }));
      return [...warmups, ...working];
    });
    const session: WorkoutSession = { id: uid('session'), date: new Date().toLocaleDateString('en-CA'), dayId: day.id, title: day.title, startedAt: new Date().toISOString(), durationSeconds: 0, sets };
    const plannedExercises = new Set(day.exercises.map((exercise) => exercise.exerciseId));
    update((current) => ({ ...current, sessions: [...current.sessions, session], progressionPlans: current.progressionPlans.filter((item) => !plannedExercises.has(item.exerciseId)) }));
    return session.id;
  }, [data.progressionPlans, data.sessions, update]);

  const updateWorkoutSet = useCallback((sessionId: string, setId: string, changes: Partial<Pick<LoggedSet, 'weightKg' | 'reps' | 'completed' | 'rir'>>) => update((current) => ({
    ...current,
    sessions: current.sessions.map((session) => session.id === sessionId ? { ...session, sets: session.sets.map((set) => set.id === setId ? { ...set, ...changes } : set) } : session),
  })), [update]);

  const finishWorkout = useCallback((sessionId: string, durationSeconds: number) => update((current) => ({
    ...current,
    sessions: current.sessions.map((session) => session.id === sessionId ? { ...session, completedAt: new Date().toISOString(), durationSeconds } : session),
  })), [update]);

  const updateHabit = useCallback((date: string, changes: Partial<Omit<HabitEntry, 'date'>>) => update((current) => {
    const existing = current.habits.find((entry) => entry.date === date);
    const habits = existing ? current.habits.map((entry) => entry.date === date ? { ...entry, ...changes } : entry) : [...current.habits, { date, water: false, walk: false, sleep: false, ...changes }];
    return { ...current, habits };
  }), [update]);

  const resetDemo = useCallback(() => {
    const seed = createSeedData();
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
    saveWeight, updateProfile, updateProgramDay, addCardio, setWeeklyCardioTarget, setSquatProgression, applyTrainingTemplate, confirmProgression,
    startWorkout, updateWorkoutSet, finishWorkout, updateHabit, resetDemo, totalsForDate,
  }), [data, addFood, updateFood, deleteFood, duplicateFood, toggleFavorite, repeatMeal, addSavedMeal, saveWeight, updateProfile, updateProgramDay, addCardio, setWeeklyCardioTarget, setSquatProgression, applyTrainingTemplate, confirmProgression, startWorkout, updateWorkoutSet, finishWorkout, updateHabit, resetDemo, totalsForDate]);
}

export type AppController = ReturnType<typeof useAppData>;
