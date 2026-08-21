import { defaultProgram } from './exercises';
import { shiftDate, toDateKey } from '../lib/date';
import type { AppData, FoodLogEntry, WeightEntry, WorkoutSession } from '../types/models';

const now = new Date().toISOString();
const today = toDateKey();
const log = (id: string, foodId: string, meal: FoodLogEntry['meal'], servingId: string, quantity: number, date = today): FoodLogEntry => ({ id, foodId, meal, servingId, quantity, date, createdAt: now });

const foodLog: FoodLogEntry[] = [
  log('demo_yogurt', 'greek-yogurt', 'breakfast', 'bowl', 1),
  log('demo_whey', 'whey', 'breakfast', 'scoop', 1),
  log('demo_walnuts', 'walnuts', 'breakfast', 'handful', 0.75),
  log('demo_honey', 'honey', 'breakfast', 'teaspoon', 1),
  log('demo_blueberries', 'blueberries', 'breakfast', 'handful', 1),
  log('demo_wrap', 'wrap', 'lunch', 'wrap', 2),
  log('demo_chicken', 'chicken', 'lunch', 'portion', 1.2),
  log('demo_pepper', 'bell-pepper', 'lunch', 'pepper', 0.5),
  log('demo_spinach', 'spinach', 'lunch', '100g', 0.5),
  log('yest_eggs', 'eggs', 'breakfast', 'two-eggs', 1, shiftDate(today, -1)),
  log('yest_bread', 'bread', 'breakfast', 'two-slices', 1, shiftDate(today, -1)),
  log('yest_salmon', 'salmon', 'dinner', 'fillet', 1, shiftDate(today, -1)),
  log('yest_potatoes', 'potatoes', 'dinner', 'portion', 1, shiftDate(today, -1)),
  log('yest_beans', 'green-beans', 'dinner', '100g', 1.5, shiftDate(today, -1)),
];

const weightValues = [83.8, 83.6, 83.7, 83.3, 83.4, 83.2, 83.0, 83.1, 82.9, 82.8, 82.9, 82.6, 82.7, 82.6];
const weights: WeightEntry[] = weightValues.map((weightKg, index) => ({ id: `demo_weight_${index}`, date: shiftDate(today, index - 13), weightKg }));

const demoSessions: WorkoutSession[] = [
  { id: 'demo_session_1', date: shiftDate(today, -7), dayId: 'monday', title: 'Upper A', startedAt: now, completedAt: now, durationSeconds: 3120, sets: [
    { id: 'ds1', exerciseId: 'bench-press', setNumber: 1, weightKg: 50, reps: 10, completed: true },
    { id: 'ds2', exerciseId: 'bench-press', setNumber: 2, weightKg: 50, reps: 9, completed: true },
    { id: 'ds3', exerciseId: 'bench-press', setNumber: 3, weightKg: 50, reps: 8, completed: true },
    { id: 'ds4', exerciseId: 'one-arm-row', setNumber: 1, weightKg: 24, reps: 12, completed: true },
    { id: 'ds5', exerciseId: 'one-arm-row', setNumber: 2, weightKg: 24, reps: 11, completed: true },
    { id: 'ds6', exerciseId: 'one-arm-row', setNumber: 3, weightKg: 24, reps: 10, completed: true },
  ] },
  { id: 'demo_session_2', date: shiftDate(today, -4), dayId: 'friday', title: 'Upper B', startedAt: now, completedAt: now, durationSeconds: 2880, sets: [
    { id: 'ds7', exerciseId: 'db-bench-press', setNumber: 1, weightKg: 22, reps: 12, completed: true },
    { id: 'ds8', exerciseId: 'db-bench-press', setNumber: 2, weightKg: 22, reps: 11, completed: true },
    { id: 'ds9', exerciseId: 'db-bench-press', setNumber: 3, weightKg: 22, reps: 10, completed: true },
  ] },
];

export function createSeedData(): AppData {
  return {
    version: 2,
    profile: {
      name: 'Kenny', age: 29, sex: 'male', heightCm: 174, startWeightKg: 83.8, currentWeightKg: 82.6, goalWeightKg: 75,
      calorieTarget: 2100, proteinTarget: 170, carbTarget: 205, fatTarget: 67,
      trainingDays: ['Monday', 'Tuesday', 'Thursday', 'Saturday'], units: 'metric',
      equipment: ['Adjustable dumbbells', 'Barbell', 'Bench', 'Dip setup', 'Bodyweight'],
    },
    foodLog,
    favorites: ['chicken', 'greek-yogurt', 'whey', 'banana'],
    recentFoodIds: ['chicken', 'wrap', 'greek-yogurt', 'whey', 'banana'],
    savedMeals: [{ id: 'protein-yogurt-bowl', name: 'Protein yogurt bowl', items: [
      { foodId: 'greek-yogurt', servingId: 'bowl', quantity: 1 },
      { foodId: 'whey', servingId: 'scoop', quantity: 1 },
      { foodId: 'walnuts', servingId: 'handful', quantity: 0.75 },
      { foodId: 'honey', servingId: 'teaspoon', quantity: 1 },
    ] }],
    weights,
    program: defaultProgram,
    sessions: demoSessions,
    habits: [{ date: today, water: false, walk: false, sleep: true }],
  };
}
