import { defaultProgram, exerciseMap } from '../data/exercises';
import { shiftDate, toDateKey } from './date';
import type { CardioEntry, MovementPattern, ProgramExercise, SquatProgressionLevel, TrainingTemplate, UserProfile, WorkoutDay, WorkoutId, WorkoutSession } from '../types/models';

export const squatProgressionLevels: Array<{ id: SquatProgressionLevel; label: string; requirement: 'supported' | 'basic' | 'advanced' }> = [
  { id: 'assisted-squat', label: 'Assisted squat', requirement: 'supported' },
  { id: 'box-squat', label: 'Box squat', requirement: 'supported' },
  { id: 'supported-goblet-squat', label: 'Supported goblet squat', requirement: 'supported' },
  { id: 'goblet-squat', label: 'Unsupported goblet squat', requirement: 'basic' },
  { id: 'supported-split-squat', label: 'Supported split squat', requirement: 'supported' },
  { id: 'split-squat', label: 'Unsupported split squat', requirement: 'basic' },
  { id: 'bulgarian-split-squat', label: 'Bulgarian split squat', requirement: 'advanced' },
];

export const squatReadinessCriteria = [
  'All prescribed sets completed with controlled tempo',
  'Whole foot stayed planted',
  'No uncontrolled collapse or loss of balance',
  'No sharp pain',
  'Prescribed RIR was maintained',
  'Execution was stable across at least two sessions',
];

export function isEquipmentCompatible(exerciseId: string, equipment: string[]): boolean {
  const exercise = exerciseMap.get(exerciseId);
  return Boolean(exercise && exercise.requiredEquipment.every((item) => item === 'Bodyweight' || equipment.includes(item)));
}

const balanceRank = { none: 0, supported: 0, basic: 1, advanced: 2 } as const;
const profileBalanceRank = { beginner: 0, developing: 1, stable: 2 } as const;

export function exceedsBalanceLevel(exerciseId: string, balanceLevel: UserProfile['balanceLevel']): boolean {
  const exercise = exerciseMap.get(exerciseId);
  return Boolean(exercise && balanceRank[exercise.balanceRequirement] > profileBalanceRank[balanceLevel]);
}

export interface WeeklyProgramAnalysis {
  muscleSets: Array<{ muscle: string; sets: number }>;
  movementCoverage: Array<{ pattern: MovementPattern; sets: number; covered: boolean }>;
  warnings: string[];
}

const trackedPatterns: MovementPattern[] = ['Horizontal push', 'Horizontal pull', 'Vertical push', 'Vertical pull substitute', 'Squat', 'Hip hinge', 'Single-leg', 'Knee-flexion hamstrings', 'Calves', 'Core', 'Lateral shoulder'];

export function analyzeWeeklyProgram(program: WorkoutDay[], profile: Pick<UserProfile, 'equipment' | 'balanceLevel'>): WeeklyProgramAnalysis {
  const muscleSets = new Map<string, number>();
  const patternSets = new Map<MovementPattern, number>();
  const exerciseCounts = new Map<string, number>();

  for (const prescription of program.flatMap((day) => day.exercises)) {
    const exercise = exerciseMap.get(prescription.exerciseId);
    if (!exercise) continue;
    exerciseCounts.set(exercise.id, (exerciseCounts.get(exercise.id) ?? 0) + 1);
    for (const muscle of exercise.primaryMuscles) muscleSets.set(muscle, (muscleSets.get(muscle) ?? 0) + prescription.sets);
    for (const pattern of exercise.movementPatterns) patternSets.set(pattern, (patternSets.get(pattern) ?? 0) + prescription.sets);
  }

  const warnings: string[] = [];
  const majorPatterns: MovementPattern[] = ['Horizontal push', 'Horizontal pull', 'Vertical push', 'Squat', 'Hip hinge', 'Single-leg'];
  const missing = majorPatterns.filter((pattern) => !patternSets.get(pattern));
  if (missing.length) warnings.push(`Missing major movement patterns: ${missing.join(', ')}.`);
  if (!patternSets.get('Core')) warnings.push('No direct core work is programmed.');
  if (!patternSets.get('Lateral shoulder')) warnings.push('No lateral-shoulder work is programmed.');
  if (!patternSets.get('Knee-flexion hamstrings')) warnings.push('No knee-flexion hamstring exercise is programmed.');
  if (!patternSets.get('Vertical pull substitute')) warnings.push('No vertical pull or lat-focused substitute is programmed.');

  for (const [exerciseId, count] of exerciseCounts) {
    if (count > 2) warnings.push(`${exerciseMap.get(exerciseId)?.name ?? exerciseId} appears ${count} times this week.`);
  }
  const allPrescriptions = program.flatMap((day) => day.exercises);
  const incompatible = [...new Set(allPrescriptions.filter((item) => !isEquipmentCompatible(item.exerciseId, profile.equipment)).map((item) => exerciseMap.get(item.exerciseId)?.name ?? item.exerciseId))];
  if (incompatible.length) warnings.push(`Unavailable equipment: ${incompatible.join(', ')}.`);
  const balanceWarnings = [...new Set(allPrescriptions.filter((item) => exceedsBalanceLevel(item.exerciseId, profile.balanceLevel)).map((item) => exerciseMap.get(item.exerciseId)?.name ?? item.exerciseId))];
  if (balanceWarnings.length) warnings.push(`Above the selected balance level: ${balanceWarnings.join(', ')}.`);

  return {
    muscleSets: [...muscleSets].map(([muscle, sets]) => ({ muscle, sets })).sort((a, b) => b.sets - a.sets || a.muscle.localeCompare(b.muscle)),
    movementCoverage: trackedPatterns.map((pattern) => ({ pattern, sets: patternSets.get(pattern) ?? 0, covered: Boolean(patternSets.get(pattern)) })),
    warnings,
  };
}

function cloneRecoveryDays(): WorkoutDay[] {
  return structuredClone(defaultProgram).map((day) => ({
    ...day,
    title: day.isRestDay ? day.title : 'Recovery + easy cardio',
    focus: day.isRestDay ? day.focus : 'Easy movement and recovery',
    duration: day.isRestDay ? day.duration : '20–35 min',
    exercises: [],
    isRestDay: true,
    workoutId: undefined,
    cardioTargetMinutes: day.cardioTargetMinutes ?? 25,
    cardioSuggestion: day.cardioSuggestion ?? 'Easy walk, bike or other low-impact cardio at a conversational pace.',
    recovery: day.recovery ?? [
      'Keep the effort easy and finish feeling better than you started.',
      'Add a short mobility session only if it feels useful.',
      'Prioritise sleep and normal meals before the next strength day.',
    ],
  }));
}

const fullBodyA: ProgramExercise[] = [
  { exerciseId: 'bench-press', sets: 3, repMin: 6, repMax: 10, restSeconds: 180, rir: '2', warmupSets: 3 },
  { exerciseId: 'one-arm-row', sets: 3, repMin: 8, repMax: 12, restSeconds: 120, rir: '2', warmupSets: 1 },
  { exerciseId: 'assisted-squat', sets: 3, repMin: 8, repMax: 12, restSeconds: 150, rir: '2–3', warmupSets: 2, variationGroup: 'squat-progression' },
  { exerciseId: 'romanian-deadlift', sets: 3, repMin: 6, repMax: 10, restSeconds: 180, rir: '2', warmupSets: 2 },
  { exerciseId: 'lateral-raise', sets: 2, repMin: 12, repMax: 20, restSeconds: 75, rir: '1–2' },
  { exerciseId: 'dead-bug', sets: 3, repMin: 6, repMax: 10, restSeconds: 60, rir: 'Controlled', notes: 'Controlled reps per side.' },
];

const fullBodyB: ProgramExercise[] = [
  { exerciseId: 'overhead-press', sets: 3, repMin: 6, repMax: 10, restSeconds: 150, rir: '2', warmupSets: 3 },
  { exerciseId: 'db-pullover', sets: 3, repMin: 10, repMax: 15, restSeconds: 105, rir: '1–2', warmupSets: 1 },
  { exerciseId: 'hip-thrust', sets: 3, repMin: 8, repMax: 12, restSeconds: 120, rir: '2', warmupSets: 2 },
  { exerciseId: 'supported-split-squat', sets: 3, repMin: 8, repMax: 12, restSeconds: 120, rir: '2–3', warmupSets: 1 },
  { exerciseId: 'db-bench-press', sets: 3, repMin: 8, repMax: 12, restSeconds: 120, rir: '2', warmupSets: 1 },
  { exerciseId: 'sliding-hamstring-curl', sets: 3, repMin: 8, repMax: 15, restSeconds: 90, rir: '1–2' },
  { exerciseId: 'side-plank', sets: 3, repMin: 20, repMax: 45, restSeconds: 60, rir: 'Controlled', notes: 'Seconds per side.' },
];

export function buildProgramTemplate(template: TrainingTemplate, squatLevel: SquatProgressionLevel): WorkoutDay[] {
  if (template === 'four-day-upper-lower') {
    return structuredClone(defaultProgram).map((day) => ({ ...day, exercises: day.exercises.map((item) => item.variationGroup === 'squat-progression' ? { ...item, exerciseId: squatLevel } : item) }));
  }
  const program = cloneRecoveryDays();
  const makeTrainingDay = (index: number, workoutId: WorkoutId, title: string, focus: string, exercises: ProgramExercise[]) => {
    program[index] = { ...program[index], workoutId, title, focus, duration: '60–75 min', isRestDay: false, cardioTargetMinutes: undefined, cardioSuggestion: undefined, recovery: undefined, exercises: structuredClone(exercises).map((item) => item.variationGroup === 'squat-progression' ? { ...item, exerciseId: squatLevel } : item) };
  };
  makeTrainingDay(0, 'full_body_a', 'Full body A', 'Push + pull + squat', fullBodyA);
  makeTrainingDay(3, 'full_body_b', 'Full body B', 'Shoulders + hinge + single-leg', fullBodyB);
  if (template === 'three-day-full-body') makeTrainingDay(5, 'full_body_c', 'Full body C', 'Alternating full-body session', fullBodyA);
  return program;
}

export function weekStart(date = new Date()): string {
  const day = date.getDay();
  return shiftDate(toDateKey(date), -(day === 0 ? 6 : day - 1));
}

export function weeklyCardioMinutes(entries: CardioEntry[], reference = new Date()): number {
  const start = weekStart(reference);
  const end = shiftDate(start, 6);
  return entries.filter((entry) => entry.date >= start && entry.date <= end).reduce((sum, entry) => sum + entry.minutes, 0);
}

export function weeklyStrengthCompleted(sessions: WorkoutSession[], reference = new Date()): number {
  const start = weekStart(reference);
  const end = shiftDate(start, 6);
  return sessions.filter((session) => session.completedAt && session.date >= start && session.date <= end).length;
}

export function adherenceSuggestion(program: WorkoutDay[], sessions: WorkoutSession[]): string | null {
  const planned = program.filter((day) => !day.isRestDay).length;
  if (planned < 4) return null;
  const start = shiftDate(weekStart(), -27);
  const completed = sessions.filter((session) => session.completedAt && session.date >= start).length;
  const weeklyAverage = completed / 4;
  if (weeklyAverage >= 3.5) return null;
  if (weeklyAverage < 2.5) return 'You have averaged about two sessions per week recently. A two-day full-body template may be easier to complete consistently.';
  return 'You have averaged about three sessions per week recently. A three-day alternating full-body template may fit better.';
}

export interface ProgressionRecommendation {
  type: 'increase' | 'decrease' | 'maintain' | 'log-rir';
  title: string;
  text: string;
  targetWeightKg?: number;
}

export function progressionRecommendation(sessions: WorkoutSession[], exerciseId: string, prescription: ProgramExercise, currentSessionId?: string): ProgressionRecommendation | null {
  if (prescription.rir === 'Controlled') return null;
  const performances = sessions
    .filter((session) => session.id === currentSessionId || Boolean(session.completedAt))
    .map((session) => session.sets.filter((set) => set.exerciseId === exerciseId && !set.isWarmup && set.completed))
    .filter((sets) => sets.length >= prescription.sets)
    .slice(-2);
  if (!performances.length) return null;
  const current = performances.at(-1)!;
  const allAtTop = current.every((set) => set.reps >= prescription.repMax);
  if (allAtTop && current.some((set) => set.rir === undefined)) return { type: 'log-rir', title: 'Log effort before progressing', text: 'Every working set reached the top of the range. Add RIR for each set so the app can verify that the target effort was maintained.' };
  const minRir = Number.parseInt(prescription.rir, 10) || 1;
  const qualifies = (sets: typeof current) => sets.every((set) => set.reps >= prescription.repMax && (set.rir ?? -1) >= minRir);
  const missesMinimum = (sets: typeof current) => sets.some((set) => set.reps < prescription.repMin);
  const lastWeight = Math.max(...current.map((set) => set.weightKg));
  const exercise = exerciseMap.get(exerciseId);
  if (performances.length === 2 && performances.every(qualifies)) {
    const increment = exercise?.requiredEquipment.includes('Barbell') ? 2.5 : 1;
    return { type: 'increase', title: 'Load increase available', text: `Two sessions reached the top of the range at the planned RIR. Confirm ${lastWeight + increment} kg for the next session, then return toward the lower end of the rep range.`, targetWeightKg: lastWeight + increment };
  }
  if (performances.length === 2 && performances.every(missesMinimum) && lastWeight > 0) {
    const targetWeightKg = Math.max(0, Math.round(lastWeight * .925 * 2) / 2);
    return { type: 'decrease', title: 'Small load reduction available', text: `The minimum reps were missed in two consecutive sessions. Confirm ${targetWeightKg} kg next time (about 5–10% lower) and rebuild from the bottom of the range.`, targetWeightKg };
  }
  return { type: 'maintain', title: 'Keep this load', text: 'Add controlled repetitions inside the prescribed range before increasing weight. Training to failure is not required.' };
}
