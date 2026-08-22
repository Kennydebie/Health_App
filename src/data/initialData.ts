import { defaultProgram } from './exercises';
import { DEFAULT_BODY_GOALS } from '../lib/bodyMeasurements';
import { DEFAULT_TRAINING_PLANNER } from '../lib/adaptivePlanner';
import { DEFAULT_NUTRITION_SETTINGS, detectedTimezone, nutritionTargetFromProfile } from '../lib/nutritionEvaluation';
import { toDateKey } from '../lib/date';
import type { AppData } from '../types/models';

/** Production-safe first-run data. Real health records are never seeded. */
export function createInitialData(): AppData {
  const now = new Date().toISOString();
  const today = toDateKey();
  const profile: AppData['profile'] = {
    name: 'Kenny',
    age: 29,
    sex: 'male',
    heightCm: 174,
    goalWeightKg: 75,
    calorieTarget: 2100,
    proteinTarget: 170,
    carbTarget: 205,
    fatTarget: 67,
    trainingDays: ['Monday', 'Wednesday', 'Friday'],
    units: 'metric',
    equipment: ['Adjustable dumbbells', 'Barbell', 'Bench', 'Dip setup', 'Bodyweight'],
    balanceLevel: 'beginner',
    trainingTemplate: 'three-day-full-body',
  };
  return {
    version: 12,
    profile,
    foodLog: [],
    nutritionTargetHistory: [nutritionTargetFromProfile(profile, today, detectedTimezone())],
    nutritionSettings: structuredClone(DEFAULT_NUTRITION_SETTINGS),
    nutritionDayRecords: [],
    favorites: [],
    recentFoodIds: [],
    savedMeals: [],
    foodLibrary: [],
    measurements: [],
    bodyGoals: structuredClone(DEFAULT_BODY_GOALS),
    weightLossPlans: [],
    program: structuredClone(defaultProgram),
    trainingPlanner: structuredClone(DEFAULT_TRAINING_PLANNER),
    sessions: [],
    habits: [],
    cardioLog: [],
    weeklyCardioTarget: 105,
    squatProgression: { currentLevel: 'assisted-squat', stableSessions: 0, updatedAt: now },
    progressionPlans: [],
    exerciseRestPreferences: {},
    activeGoal: {
      id: 'active-goal', name: 'Project 75', startingWeightKg: null, targetWeightKg: 75,
      targetRangeKg: [74.5, 75.5], phase: 'fat_loss', startDate: today, status: 'active',
      desiredLossRateMinPct: .3, desiredLossRateMaxPct: .8,
    },
    coachingSettings: { version: 1, dailyStepGoal: 8000, reviewWeekday: 0, coachingStyle: 'balanced' },
    activityLog: [],
    plannedFoodEntries: [],
    calorieReservations: [],
    dayTemplates: [],
    recoveryFeedback: [],
    pausePeriods: [],
    weeklyCheckIns: [],
    coachRecommendations: [],
    planChanges: [],
    productEvents: [],
    onboardingCompleted: false,
  };
}
