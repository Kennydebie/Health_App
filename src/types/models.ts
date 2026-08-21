export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snacks';

export interface Macros {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface FoodServing {
  id: string;
  label: string;
  amount: number;
  unit: 'g' | 'ml';
}

export interface FoodItem extends Macros {
  id: string;
  name: string;
  category: string;
  unit: 'g' | 'ml';
  image: string;
  servings: FoodServing[];
}

export interface FoodLogEntry {
  id: string;
  foodId: string;
  date: string;
  meal: MealType;
  servingId: string;
  quantity: number;
  createdAt: string;
}

export interface SavedMeal {
  id: string;
  name: string;
  items: Array<Pick<FoodLogEntry, 'foodId' | 'servingId' | 'quantity'>>;
}

export interface UserProfile {
  name: string;
  age: number;
  sex: 'male' | 'female';
  heightCm: number;
  startWeightKg: number;
  currentWeightKg: number;
  goalWeightKg: number;
  calorieTarget: number;
  proteinTarget: number;
  carbTarget: number;
  fatTarget: number;
  trainingDays: string[];
  units: 'metric' | 'imperial';
  equipment: string[];
}

export interface WeightEntry {
  id: string;
  date: string;
  weightKg: number;
}

export interface Exercise {
  id: string;
  name: string;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  setup: string[];
  execution: string[];
  breathing: string;
  mistakes: string[];
  safety: string;
  alternatives: string[];
  demoUrl: string;
}

export interface ProgramExercise {
  exerciseId: string;
  sets: number;
  repMin: number;
  repMax: number;
  restSeconds: number;
  rir: string;
}

export interface WorkoutDay {
  id: 'monday' | 'wednesday' | 'friday';
  label: string;
  title: string;
  duration: string;
  exercises: ProgramExercise[];
}

export interface LoggedSet {
  id: string;
  exerciseId: string;
  setNumber: number;
  weightKg: number;
  reps: number;
  completed: boolean;
}

export interface WorkoutSession {
  id: string;
  date: string;
  dayId: WorkoutDay['id'];
  title: string;
  startedAt: string;
  completedAt?: string;
  durationSeconds: number;
  sets: LoggedSet[];
}

export interface HabitEntry {
  date: string;
  water: boolean;
  walk: boolean;
  sleep: boolean;
}

export interface AppData {
  version: number;
  profile: UserProfile;
  foodLog: FoodLogEntry[];
  favorites: string[];
  recentFoodIds: string[];
  savedMeals: SavedMeal[];
  weights: WeightEntry[];
  program: WorkoutDay[];
  sessions: WorkoutSession[];
  habits: HabitEntry[];
}
