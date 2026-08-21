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

export interface DailyNutritionTargetSnapshot {
  date: string;
  caloriesKcal: number;
  proteinGrams: number;
  carbohydrateGrams: number;
  fatGrams: number;
  timezone: string;
}

export interface NutritionEvaluationSettings {
  version: 1;
  calories: { onTargetMin: number; onTargetMax: number; closeMin: number; closeMax: number };
  protein: { onTargetMin: number; closeMin: number };
  macros: { onTargetMin: number; onTargetMax: number; closeMin: number; closeMax: number };
  untrackedDayDefault: 'excluded' | 'no_data';
}

export interface NutritionDayRecord {
  date: string;
  finishedAt?: string;
  untrackedTreatment?: 'excluded' | 'no_data';
}

export interface UserProfile {
  name: string;
  age: number;
  sex: 'male' | 'female';
  heightCm: number;
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

export type BodyMetricKey =
  | 'weightKg'
  | 'bmi'
  | 'bodyFatPercent'
  | 'fatMassKg'
  | 'fatFreeMassKg'
  | 'muscleMassKg'
  | 'musclePercent'
  | 'skeletalMusclePercent'
  | 'boneMassKg'
  | 'proteinMassKg'
  | 'proteinPercent'
  | 'waterMassKg'
  | 'bodyWaterPercent'
  | 'subcutaneousFatPercent'
  | 'visceralFatIndex'
  | 'bmrKcal'
  | 'bodyAge'
  | 'waistCircumferenceCm';

export interface BodyMeasurementValues {
  measuredAt: string | null;
  weightKg: number | null;
  bmi: number | null;
  bodyFatPercent: number | null;
  fatMassKg: number | null;
  fatFreeMassKg: number | null;
  muscleMassKg: number | null;
  musclePercent: number | null;
  skeletalMusclePercent: number | null;
  boneMassKg: number | null;
  proteinMassKg: number | null;
  proteinPercent: number | null;
  waterMassKg: number | null;
  bodyWaterPercent: number | null;
  subcutaneousFatPercent: number | null;
  visceralFatIndex: number | null;
  bmrKcal: number | null;
  bodyAge: number | null;
  waistCircumferenceCm: number | null;
}

export type BodyMeasurementConfidence = Record<'measuredAt' | BodyMetricKey, number | null>;

export interface MeasurementIssue {
  code: 'missing' | 'low_confidence' | 'out_of_range' | 'inconsistent';
  field?: 'measuredAt' | BodyMetricKey;
  relatedField?: BodyMetricKey;
  message: string;
  severity: 'notice' | 'warning';
}

export interface BodyMeasurementDraft extends BodyMeasurementValues {
  source: 'manual' | 'fitdays_ai_image';
  confidence?: BodyMeasurementConfidence;
  issues?: MeasurementIssue[];
}

export interface BodyMeasurement extends BodyMeasurementDraft {
  id: string;
  createdAt: string;
  isDemo?: boolean;
  excludedFromTrend?: BodyMetricKey[];
  confirmedOutlierMetrics?: BodyMetricKey[];
}

export interface BodyGoalSettings {
  version: 1;
  bodyFatCheckpointPercent: number;
  bodyFatTargetMinPercent: number;
  bodyFatTargetMaxPercent: number;
  bodyFatPersonalTargetPercent: number;
  fatFreeMassTargetKg: number | null;
  muscleMassTargetKg: number | null;
  waistTargetCm: number | null;
}

export interface WeightLossPlan {
  id: string;
  baselineMeasurementId: string;
  baselineWeightKg: number;
  baselineBodyFatPercent: number | null;
  baselineFatMassKg: number | null;
  baselineFatFreeMassKg: number | null;
  baselineMuscleMassKg: number | null;
  goalWeightKg: number;
  weeklyRatePct: number;
  planStartDate: string;
  estimatedTargetDate: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export type MuscleId =
  | 'upper_chest'
  | 'mid_chest'
  | 'lower_chest'
  | 'front_deltoid'
  | 'side_deltoid'
  | 'rear_deltoid'
  | 'biceps'
  | 'triceps'
  | 'forearms'
  | 'upper_trapezius'
  | 'middle_trapezius'
  | 'rhomboids'
  | 'latissimus_dorsi'
  | 'spinal_erectors'
  | 'rectus_abdominis'
  | 'obliques'
  | 'quadriceps'
  | 'hamstrings'
  | 'gluteus_maximus'
  | 'gluteus_medius'
  | 'adductors'
  | 'hip_flexors'
  | 'calves'
  | 'tibialis_anterior';

export interface ExerciseMuscleMap {
  primary: MuscleId[];
  secondary: MuscleId[];
  stabilizers?: MuscleId[];
  preferredView: 'front' | 'back' | 'both';
  laterality?: 'bilateral' | 'left' | 'right' | 'alternating';
  presentation?: 'exercise-role' | 'session-exposure';
}

export interface Exercise {
  id: string;
  name: string;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  muscleMap: ExerciseMuscleMap;
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
export type SessionTemplateId = WorkoutId | 'cardio_recovery' | 'mobility_recovery' | 'full_rest';
export type TrainingSelectionSource = 'default_template' | 'adaptive_recommendation' | 'user_selected' | 'user_moved' | 'user_swapped';
export type TrainingDayStatus = 'recommended' | 'selected' | 'completed' | 'skipped' | 'missed' | 'rest';

export interface ReadinessResponse {
  energy: 1 | 2 | 3 | 4 | 5;
  muscleSoreness: 1 | 2 | 3 | 4 | 5;
  jointDiscomfort: 'none' | 'mild' | 'significant';
  availableMinutes: number;
  preferredIntensity: 'light' | 'normal' | 'hard';
  recordedAt: string;
}

export interface TrainingDayPlan {
  date: string;
  recommendedSessionTemplateId: SessionTemplateId;
  selectedSessionTemplateId: SessionTemplateId;
  selectionSource: TrainingSelectionSource;
  recommendationReason: string;
  recommendationCreatedAt: string;
  status: TrainingDayStatus;
  completedWorkoutId?: string;
  completedAt?: string;
  overrideWarningShown: boolean;
  readinessResponse?: ReadinessResponse;
}

export interface RecoveryHeuristics {
  strongWarningHours: number;
  cautionHours: number;
  heavyWorkingSetThreshold: number;
}

export interface WeeklyTrainingTargets {
  upperSessions: number;
  lowerSessions: number;
  strengthSessions: number;
  recoveryOpportunities: number;
}

export interface TrainingPlannerState {
  version: 1;
  dailyPlans: TrainingDayPlan[];
  recoveryHeuristics: RecoveryHeuristics;
  weeklyTargets: WeeklyTrainingTargets;
}

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
  nutritionTargetHistory: DailyNutritionTargetSnapshot[];
  nutritionSettings: NutritionEvaluationSettings;
  nutritionDayRecords: NutritionDayRecord[];
  favorites: string[];
  recentFoodIds: string[];
  savedMeals: SavedMeal[];
  measurements: BodyMeasurement[];
  bodyGoals: BodyGoalSettings;
  weightLossPlans: WeightLossPlan[];
  program: WorkoutDay[];
  trainingPlanner: TrainingPlannerState;
  sessions: WorkoutSession[];
  habits: HabitEntry[];
  cardioLog: CardioEntry[];
  weeklyCardioTarget: number;
  squatProgression: SquatProgressionState;
  progressionPlans: ProgressionPlan[];
}
