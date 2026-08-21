import type { ExerciseMuscleMap, MuscleId, ProgramExercise } from '../types/models';

export const MUSCLE_LABELS: Record<MuscleId, string> = {
  upper_chest: 'Upper chest', mid_chest: 'Mid chest', lower_chest: 'Lower chest',
  front_deltoid: 'Front shoulders', side_deltoid: 'Side shoulders', rear_deltoid: 'Rear shoulders',
  biceps: 'Biceps', triceps: 'Triceps', forearms: 'Forearms', upper_trapezius: 'Upper traps',
  middle_trapezius: 'Middle traps', rhomboids: 'Rhomboids', latissimus_dorsi: 'Lats',
  spinal_erectors: 'Spinal erectors', rectus_abdominis: 'Abdominals', obliques: 'Obliques',
  quadriceps: 'Quadriceps', hamstrings: 'Hamstrings', gluteus_maximus: 'Gluteus maximus',
  gluteus_medius: 'Gluteus medius', adductors: 'Adductors', hip_flexors: 'Hip flexors',
  calves: 'Calves', tibialis_anterior: 'Front lower legs',
};

const bilateral = { laterality: 'bilateral' as const };
const alternating = { laterality: 'alternating' as const };

export const EXERCISE_MUSCLE_MAPS: Record<string, ExerciseMuscleMap> = {
  'bench-press': { primary: ['mid_chest'], secondary: ['triceps', 'front_deltoid'], preferredView: 'front', ...bilateral },
  'one-arm-row': { primary: ['latissimus_dorsi', 'rhomboids'], secondary: ['middle_trapezius', 'rear_deltoid', 'biceps'], stabilizers: ['spinal_erectors', 'obliques'], preferredView: 'back', ...alternating },
  'incline-db-press': { primary: ['upper_chest'], secondary: ['front_deltoid', 'triceps'], preferredView: 'front', ...bilateral },
  'barbell-row': { primary: ['latissimus_dorsi', 'rhomboids'], secondary: ['middle_trapezius', 'rear_deltoid', 'biceps'], stabilizers: ['spinal_erectors'], preferredView: 'back', ...bilateral },
  'db-curl': { primary: ['biceps'], secondary: ['forearms'], preferredView: 'front', ...bilateral },
  'triceps-extension': { primary: ['triceps'], secondary: [], stabilizers: ['rectus_abdominis'], preferredView: 'back', ...bilateral },
  'romanian-deadlift': { primary: ['hamstrings', 'gluteus_maximus'], secondary: ['adductors'], stabilizers: ['spinal_erectors', 'forearms'], preferredView: 'back', ...bilateral },
  'hip-thrust': { primary: ['gluteus_maximus'], secondary: ['hamstrings', 'gluteus_medius'], stabilizers: ['rectus_abdominis'], preferredView: 'back', ...bilateral },
  'overhead-press': { primary: ['front_deltoid', 'side_deltoid'], secondary: ['triceps', 'upper_chest'], stabilizers: ['rectus_abdominis'], preferredView: 'front', ...bilateral },
  'lateral-raise': { primary: ['side_deltoid'], secondary: ['upper_trapezius'], preferredView: 'both', ...bilateral },
  'calf-raise': { primary: ['calves'], secondary: [], stabilizers: ['tibialis_anterior'], preferredView: 'back', ...bilateral },
  'db-bench-press': { primary: ['mid_chest'], secondary: ['triceps', 'front_deltoid'], preferredView: 'front', ...bilateral },
  dips: { primary: ['lower_chest', 'triceps'], secondary: ['front_deltoid'], preferredView: 'both', ...bilateral },
  'db-pullover': { primary: ['latissimus_dorsi'], secondary: ['lower_chest', 'triceps'], stabilizers: ['rectus_abdominis'], preferredView: 'both', ...bilateral },
  'rear-delt-fly': { primary: ['rear_deltoid'], secondary: ['rhomboids', 'middle_trapezius'], preferredView: 'back', ...bilateral },
  'hammer-curl': { primary: ['biceps'], secondary: ['forearms'], preferredView: 'front', ...bilateral },
  'assisted-squat': { primary: ['quadriceps', 'gluteus_maximus'], secondary: ['adductors', 'hip_flexors'], stabilizers: ['rectus_abdominis', 'spinal_erectors'], preferredView: 'both', ...bilateral },
  'box-squat': { primary: ['quadriceps', 'gluteus_maximus'], secondary: ['adductors', 'hamstrings'], stabilizers: ['rectus_abdominis', 'spinal_erectors'], preferredView: 'both', ...bilateral },
  'supported-goblet-squat': { primary: ['quadriceps', 'gluteus_maximus'], secondary: ['adductors', 'hip_flexors'], stabilizers: ['rectus_abdominis', 'spinal_erectors'], preferredView: 'both', ...bilateral },
  'goblet-squat': { primary: ['quadriceps', 'gluteus_maximus'], secondary: ['adductors', 'hip_flexors'], stabilizers: ['rectus_abdominis', 'spinal_erectors'], preferredView: 'both', ...bilateral },
  'supported-reverse-lunge': { primary: ['quadriceps', 'gluteus_maximus'], secondary: ['adductors', 'gluteus_medius'], stabilizers: ['obliques', 'calves'], preferredView: 'both', ...alternating },
  'supported-split-squat': { primary: ['quadriceps', 'gluteus_maximus'], secondary: ['adductors', 'gluteus_medius'], stabilizers: ['obliques', 'calves'], preferredView: 'both', ...alternating },
  'split-squat': { primary: ['quadriceps', 'gluteus_maximus'], secondary: ['adductors', 'gluteus_medius'], stabilizers: ['obliques', 'calves'], preferredView: 'both', ...alternating },
  'bulgarian-split-squat': { primary: ['quadriceps', 'gluteus_maximus'], secondary: ['adductors', 'gluteus_medius'], stabilizers: ['obliques', 'calves'], preferredView: 'both', ...alternating },
  'sliding-hamstring-curl': { primary: ['hamstrings'], secondary: ['gluteus_maximus'], stabilizers: ['spinal_erectors', 'calves'], preferredView: 'back', ...bilateral },
  'dead-bug': { primary: ['rectus_abdominis'], secondary: ['hip_flexors'], stabilizers: ['obliques'], preferredView: 'front', ...alternating },
  'side-plank': { primary: ['obliques'], secondary: ['gluteus_medius', 'side_deltoid'], stabilizers: ['rectus_abdominis'], preferredView: 'both', ...bilateral },
};

export function exerciseMuscleMap(exerciseId: string) {
  return EXERCISE_MUSCLE_MAPS[exerciseId];
}

export interface MuscleExposure {
  muscle: MuscleId;
  exerciseCount: number;
  workingSets: number;
  primarySets: number;
  secondarySets: number;
  stabilizerSets: number;
}

export function combinedMuscleExposure(exercises: ProgramExercise[], mapForExercise: (exerciseId: string) => ExerciseMuscleMap | undefined) {
  const exposure = new Map<MuscleId, MuscleExposure>();
  const add = (muscle: MuscleId, sets: number, role: 'primary' | 'secondary' | 'stabilizer') => {
    const current = exposure.get(muscle) ?? { muscle, exerciseCount: 0, workingSets: 0, primarySets: 0, secondarySets: 0, stabilizerSets: 0 };
    current.exerciseCount += 1;
    current.workingSets += sets;
    if (role === 'primary') current.primarySets += sets;
    if (role === 'secondary') current.secondarySets += sets;
    if (role === 'stabilizer') current.stabilizerSets += sets;
    exposure.set(muscle, current);
  };
  for (const exercise of exercises) {
    const map = mapForExercise(exercise.exerciseId);
    if (!map) continue;
    map.primary.forEach((muscle) => add(muscle, exercise.sets, 'primary'));
    map.secondary.forEach((muscle) => add(muscle, exercise.sets, 'secondary'));
    map.stabilizers?.forEach((muscle) => add(muscle, exercise.sets, 'stabilizer'));
  }
  return [...exposure.values()].sort((a, b) => (b.primarySets * 3 + b.secondarySets * 2 + b.stabilizerSets) - (a.primarySets * 3 + a.secondarySets * 2 + a.stabilizerSets));
}

export function exposureMuscleMap(exposure: MuscleExposure[]): ExerciseMuscleMap {
  const primary: MuscleId[] = [];
  const secondary: MuscleId[] = [];
  const stabilizers: MuscleId[] = [];
  for (const item of exposure) {
    if (item.primarySets >= 3 || item.primarySets + item.secondarySets >= 6) primary.push(item.muscle);
    else if (item.primarySets > 0 || item.secondarySets >= 2) secondary.push(item.muscle);
    else stabilizers.push(item.muscle);
  }
  return { primary, secondary, stabilizers, preferredView: 'both', laterality: 'bilateral', presentation: 'session-exposure' };
}

export function muscleList(ids: MuscleId[]) {
  return ids.map((id) => MUSCLE_LABELS[id]).join(', ') || 'None';
}
