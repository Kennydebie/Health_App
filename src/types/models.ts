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
  balanceLevel: 'beginner' | 'developing' | 'stable';
  trainingTemplate: TrainingTemplate;
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
  movementPatterns: MovementPattern[];
  requiredEquipment: string[];
  defaultPrescription: ExercisePrescription;
  balanceRequirement: 'none' | 'supported' | 'basic' | 'advanced';
  experienceLevel: 'beginner' | 'intermediate';
  setup: string[];
  execution: string[];
  breathing: string;
  mistakes: string[];
  safety: string;
  alternatives: string[];
  videoId?: string;
  videoFallback: string;
}

export type MovementPattern = 'Horizontal push' | 'Horizontal pull' | 'Vertical push' | 'Vertical pull substitute' | 'Squat' | 'Hip hinge' | 'Single-leg' | 'Knee-flexion hamstrings' | 'Calves' | 'Core' | 'Lateral shoulder';
export type TrainingTemplate = 'two-day-full-body' | 'three-day-full-body' | 'four-day-upper-lower';
export type SquatProgressionLevel = 'assisted-squat' | 'box-squat' | 'supported-goblet-squat' | 'goblet-squat' | 'supported-split-squat' | 'split-squat' | 'bulgarian-split-squat';
export type WorkoutId = 'upper_a' | 'lower_a' | 'upper_b' | 'lower_b' | 'full_body_a' | 'full_body_b' | 'full_body_c' | `legacy_${string}`;

export interface ExercisePrescription {
  sets: number;
  repMin: number;
  repMax: number;
  restSeconds: number;
  rir: string;
  warmupSets?: number;
}

export interface ProgramExercise extends ExercisePrescription {
  exerciseId: string;
  variationGroup?: 'squat-progression';
  notes?: string;
}

export interface WorkoutDay {
  id: 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
  /** Stable identity for a lifting slot. It never changes when the visible title changes. */
  workoutId?: WorkoutId;
  label: string;
  title: string;
  focus?: string;
  duration: string;
  isRestDay: boolean;
  recovery?: string[];
  cardioTargetMinutes?: number;
  cardioSuggestion?: string;
  exercises: ProgramExercise[];
}

export interface LoggedSet {
  id: string;
  exerciseId: string;
  setNumber: number;
  weightKg: number;
  reps: number;
  completed: boolean;
  isWarmup?: boolean;
  rir?: number;
}

export interface WorkoutSession {
  id: string;
  date: string;
  dayId: WorkoutDay['id'];
  workoutId: WorkoutId;
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

export interface CardioEntry {
  id: string;
  date: string;
  minutes: number;
  activity: 'Brisk walk' | 'Relaxed walk' | 'Cycling' | 'Other low impact';
}

export interface SquatProgressionState {
  currentLevel: SquatProgressionLevel;
  stableSessions: number;
  updatedAt: string;
}

export interface ProgressionPlan {
  exerciseId: string;
  targetWeightKg: number;
  reason: 'increase' | 'decrease';
  confirmedAt: string;
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
  cardioLog: CardioEntry[];
  weeklyCardioTarget: number;
  squatProgression: SquatProgressionState;
  progressionPlans: ProgressionPlan[];
}
