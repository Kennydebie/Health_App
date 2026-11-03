import { exerciseMap } from '../data/exercises';
import type {
  AppData,
  CoachingConclusion,
  CoachingConfidence,
  CoachingEvidence,
  ProposedPlanChange,
  RecoveryFeedback,
} from '../types/models';
import { isStrengthTemplate } from './adaptivePlanner';
import { weightHistory } from './bodyMeasurements';
import { shiftDate, toDateKey } from './date';
import { getNutritionTotals } from './selectors';

const STRENGTH_NL: Record<string, string> = { improving: 'aan het verbeteren', stable: 'stabiel', slightly_declining: 'licht dalend', meaningfully_declining: 'duidelijk dalend', insufficient_data: 'nog onbekend' };
const PAUSE_NL: Record<string, string> = { traveling: 'op reis', sick: 'ziek', recovery_week: 'herstelweek', maintenance_break: 'onderhoudspauze', paused: 'gepauzeerd' };
function strengthNl(value: string) { return STRENGTH_NL[value] ?? value.replaceAll('_', ' '); }
function pauseNl(value: string) { return PAUSE_NL[value] ?? value.replace('_', ' '); }


const DAY_MS = 86_400_000;

export type WeightPaceStatus = 'slower_than_target' | 'on_target' | 'faster_than_target' | 'insufficient_data';
export type StrengthTrendState = 'improving' | 'stable' | 'slightly_declining' | 'meaningfully_declining' | 'insufficient_data';

export interface ExerciseStrengthTrend {
  exerciseId: string;
  exerciseName: string;
  state: StrengthTrendState;
  changePct: number | null;
  latestEstimatedOneRepMax: number | null;
  latestVolume: number | null;
  comparableSessions: number;
}

export interface CoachingInputs {
  periodStart: string;
  periodEnd: string;
  currentWeightAverage: number | null;
  previousWeightAverage: number | null;
  priorWeightAverage: number | null;
  latestWeight: number | null;
  currentWeighIns: number;
  previousWeighIns: number;
  weeklyChangeKg: number | null;
  weeklyChangePct: number | null;
  previousWeeklyChangePct: number | null;
  weightPace: WeightPaceStatus;
  completeNutritionDays: number;
  partialNutritionDays: number;
  averageCalories: number | null;
  averageProtein: number | null;
  calorieAdherencePct: number | null;
  proteinAdherencePct: number | null;
  plannedWorkouts: number;
  completedWorkouts: number;
  workoutAdherencePct: number | null;
  strengthTrends: ExerciseStrengthTrend[];
  overallStrength: StrengthTrendState;
  averageSteps: number | null;
  recovery: RecoveryFeedback | null;
  activePause: AppData['pausePeriods'][number] | null;
  recentPlanChange: AppData['planChanges'][number] | null;
  plateauDays: number;
  goalReached: boolean;
}

export interface CoachingDecision {
  conclusion: CoachingConclusion;
  title: string;
  explanation: string;
  confidence: CoachingConfidence;
  evidence: CoachingEvidence[];
  primaryAction: string;
  secondaryActions: string[];
  proposedChange?: ProposedPlanChange;
  alternativeChange?: ProposedPlanChange;
  nextReviewDate: string;
  warnings: string[];
  missingDataRequirements: string[];
}

export interface DailyCoachPriority {
  status: 'on_track' | 'needs_attention' | 'recovery_focus' | 'check_in_due';
  title: string;
  instruction: string;
  secondaryActions: string[];
  caloriesRemaining: number;
  proteinRemaining: number;
  stepsRemaining: number | null;
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function dateValue(date: string) {
  return new Date(`${date}T12:00:00`).getTime();
}

function measurementDate(value: string | null) {
  return value?.slice(0, 10) ?? '';
}

function valuesBetween(data: AppData, start: string, end: string) {
  return weightHistory(data.measurements)
    .filter((item) => measurementDate(item.measuredAt) >= start && measurementDate(item.measuredAt) <= end)
    .map((item) => item.weightKg)
    .filter((value): value is number => value != null);
}

function completeNutritionDates(data: AppData, start: string, end: string, reference: string) {
  const dates = Array.from({ length: Math.max(0, Math.round((dateValue(end) - dateValue(start)) / DAY_MS) + 1) }, (_, index) => shiftDate(start, index));
  const complete: string[] = [];
  const partial: string[] = [];
  for (const date of dates) {
    const record = data.nutritionDayRecords.find((item) => item.date === date);
    const hasFood = data.foodLog.some((entry) => entry.date === date);
    const explicitlyComplete = record?.completeness === 'fully_logged' || Boolean(record?.finishedAt);
    const explicitlyPartial = record?.completeness === 'partially_logged' || record?.completeness === 'planned_incomplete';
    if (explicitlyComplete) complete.push(date);
    else if (explicitlyPartial || (date < reference && hasFood)) partial.push(date);
  }
  return { complete, partial };
}

function estimatedOneRepMax(weightKg: number, reps: number) {
  if (weightKg <= 0 || reps <= 0) return 0;
  return weightKg * (1 + Math.min(reps, 12) / 30);
}

export function getStrengthTrends(data: AppData): ExerciseStrengthTrend[] {
  const byExercise = new Map<string, Array<{ date: string; e1rm: number; volume: number }>>();
  for (const session of data.sessions.filter((item) => item.completedAt).sort((a, b) => a.date.localeCompare(b.date))) {
    const exerciseIds = new Set(session.sets.filter((set) => set.completed && !set.isWarmup && !set.skipped).map((set) => set.exerciseId));
    for (const exerciseId of exerciseIds) {
      const sets = session.sets.filter((set) => set.exerciseId === exerciseId && set.completed && !set.isWarmup && !set.skipped);
      if (!sets.length) continue;
      const e1rm = Math.max(...sets.map((set) => estimatedOneRepMax(set.weightKg, set.reps)));
      const volume = sets.reduce((sum, set) => sum + set.weightKg * set.reps, 0);
      byExercise.set(exerciseId, [...(byExercise.get(exerciseId) ?? []), { date: session.date, e1rm, volume }]);
    }
  }
  return [...byExercise.entries()].map(([exerciseId, points]) => {
    const comparable = points.slice(-4);
    if (comparable.length < 2) return {
      exerciseId, exerciseName: exerciseMap.get(exerciseId)?.name ?? 'Saved exercise', state: 'insufficient_data' as const,
      changePct: null, latestEstimatedOneRepMax: comparable.at(-1)?.e1rm ?? null, latestVolume: comparable.at(-1)?.volume ?? null, comparableSessions: comparable.length,
    };
    const baseline = average(comparable.slice(0, -1).map((item) => item.e1rm)) ?? comparable[0].e1rm;
    const latest = comparable.at(-1)!;
    const changePct = baseline > 0 ? (latest.e1rm - baseline) / baseline * 100 : 0;
    const threeRegressions = comparable.length >= 3 && comparable.slice(-3).every((item, index, values) => index === 0 || item.e1rm < values[index - 1].e1rm);
    const state: StrengthTrendState = threeRegressions || changePct <= -5
      ? 'meaningfully_declining'
      : changePct < -2
        ? 'slightly_declining'
        : changePct > 2
          ? 'improving'
          : 'stable';
    return {
      exerciseId, exerciseName: exerciseMap.get(exerciseId)?.name ?? 'Saved exercise', state,
      changePct, latestEstimatedOneRepMax: latest.e1rm, latestVolume: latest.volume, comparableSessions: comparable.length,
    };
  }).sort((a, b) => b.comparableSessions - a.comparableSessions || a.exerciseName.localeCompare(b.exerciseName));
}

function overallStrength(trends: ExerciseStrengthTrend[]): StrengthTrendState {
  const comparable = trends.filter((item) => item.state !== 'insufficient_data');
  if (!comparable.length) return 'insufficient_data';
  const meaningful = comparable.filter((item) => item.state === 'meaningfully_declining').length;
  const slight = comparable.filter((item) => item.state === 'slightly_declining').length;
  const improving = comparable.filter((item) => item.state === 'improving').length;
  if (meaningful >= 2 || meaningful >= Math.ceil(comparable.length / 2)) return 'meaningfully_declining';
  if (meaningful || slight >= Math.ceil(comparable.length / 2)) return 'slightly_declining';
  if (improving >= Math.ceil(comparable.length / 2)) return 'improving';
  return 'stable';
}

function confidenceFor(inputs: Pick<CoachingInputs, 'currentWeighIns' | 'previousWeighIns' | 'completeNutritionDays' | 'plannedWorkouts' | 'completedWorkouts' | 'recentPlanChange'>): CoachingConfidence {
  if (inputs.currentWeighIns >= 5 && inputs.previousWeighIns >= 4 && inputs.completeNutritionDays >= 5 && (!inputs.plannedWorkouts || inputs.completedWorkouts >= Math.max(1, inputs.plannedWorkouts - 1)) && !inputs.recentPlanChange) return 'high';
  if (inputs.currentWeighIns >= 4 && inputs.previousWeighIns >= 3 && inputs.completeNutritionDays >= 4) return 'moderate';
  if (inputs.currentWeighIns >= 2 && inputs.completeNutritionDays >= 2) return 'low';
  return 'insufficient';
}

export function buildCoachingInputs(data: AppData, referenceDate = toDateKey()): CoachingInputs {
  const periodEnd = referenceDate;
  const periodStart = shiftDate(referenceDate, -6);
  const previousStart = shiftDate(referenceDate, -13);
  const previousEnd = shiftDate(referenceDate, -7);
  const priorStart = shiftDate(referenceDate, -20);
  const priorEnd = shiftDate(referenceDate, -14);
  const currentWeights = valuesBetween(data, periodStart, periodEnd);
  const previousWeights = valuesBetween(data, previousStart, previousEnd);
  const priorWeights = valuesBetween(data, priorStart, priorEnd);
  const currentWeightAverage = average(currentWeights);
  const previousWeightAverage = average(previousWeights);
  const priorWeightAverage = average(priorWeights);
  const weeklyChangeKg = currentWeightAverage != null && previousWeightAverage != null ? currentWeightAverage - previousWeightAverage : null;
  const weeklyChangePct = weeklyChangeKg != null && previousWeightAverage ? weeklyChangeKg / previousWeightAverage * 100 : null;
  const previousWeeklyChangePct = previousWeightAverage != null && priorWeightAverage ? (previousWeightAverage - priorWeightAverage) / priorWeightAverage * 100 : null;
  const minRate = data.activeGoal.desiredLossRateMinPct;
  const maxRate = data.activeGoal.desiredLossRateMaxPct;
  const weightPace: WeightPaceStatus = weeklyChangePct == null
    ? 'insufficient_data'
    : weeklyChangePct <= -maxRate
      ? 'faster_than_target'
      : weeklyChangePct <= -minRate
        ? 'on_target'
        : 'slower_than_target';
  const nutrition = completeNutritionDates(data, periodStart, periodEnd, referenceDate);
  const totals = nutrition.complete.map((date) => getNutritionTotals(data, date));
  const averageCalories = average(totals.map((item) => item.calories));
  const averageProtein = average(totals.map((item) => item.protein));
  const calorieAdherencePct = averageCalories == null ? null : averageCalories / Math.max(1, data.profile.calorieTarget) * 100;
  const proteinAdherencePct = averageProtein == null ? null : averageProtein / Math.max(1, data.profile.proteinTarget) * 100;
  const plans = data.trainingPlanner.dailyPlans.filter((plan) => plan.date >= periodStart && plan.date <= periodEnd && isStrengthTemplate(plan.selectedSessionTemplateId));
  const plannedWorkouts = plans.length || data.program.filter((day) => !day.isRestDay).length;
  const completedWorkouts = data.sessions.filter((session) => session.completedAt && session.date >= periodStart && session.date <= periodEnd).length;
  const strengthTrends = getStrengthTrends(data);
  const activity = data.activityLog.filter((item) => item.date >= periodStart && item.date <= periodEnd);
  const activePause = [...data.pausePeriods].reverse().find((item) => item.startDate <= referenceDate && (!item.endDate || item.endDate >= referenceDate)) ?? null;
  const recentPlanChange = [...data.planChanges].reverse().find((item) => item.appliedAt.slice(0, 10) >= shiftDate(referenceDate, -13)) ?? null;
  const recovery = [...data.recoveryFeedback].filter((item) => item.date <= referenceDate).sort((a, b) => a.date.localeCompare(b.date)).at(-1) ?? null;
  const flatThresholdKg = (currentWeightAverage ?? previousWeightAverage ?? 0) * .001;
  const enoughPlateauData = currentWeights.length >= 5 && previousWeights.length >= 4;
  const previousFlat = previousWeeklyChangePct != null && previousWeeklyChangePct > -data.activeGoal.desiredLossRateMinPct;
  const plateauDays = enoughPlateauData && previousFlat && weeklyChangeKg != null && weeklyChangeKg > -flatThresholdKg ? 14 : 0;
  const latestWeight = weightHistory(data.measurements).at(-1)?.weightKg ?? null;
  const goalReached = currentWeightAverage != null && currentWeightAverage >= data.activeGoal.targetRangeKg[0] && currentWeightAverage <= data.activeGoal.targetRangeKg[1];
  return {
    periodStart, periodEnd, currentWeightAverage, previousWeightAverage, priorWeightAverage, latestWeight,
    currentWeighIns: currentWeights.length, previousWeighIns: previousWeights.length, weeklyChangeKg, weeklyChangePct,
    previousWeeklyChangePct, weightPace, completeNutritionDays: nutrition.complete.length, partialNutritionDays: nutrition.partial.length,
    averageCalories, averageProtein, calorieAdherencePct, proteinAdherencePct, plannedWorkouts, completedWorkouts,
    workoutAdherencePct: plannedWorkouts ? completedWorkouts / plannedWorkouts * 100 : null,
    strengthTrends, overallStrength: overallStrength(strengthTrends), averageSteps: activity.length ? average(activity.map((item) => item.steps)) : null,
    recovery, activePause, recentPlanChange, plateauDays, goalReached,
  };
}

function evidenceFor(inputs: CoachingInputs): CoachingEvidence[] {
  return [
    { label: 'Gewichtstrend', value: inputs.weeklyChangeKg == null ? 'Te weinig gegevens' : `${inputs.weeklyChangeKg > 0 ? '+' : ''}${inputs.weeklyChangeKg.toFixed(2)} kg`, detail: `${inputs.currentWeighIns} wegingen deze week, ${inputs.previousWeighIns} vorige week` },
    { label: 'Voedingslog', value: `${inputs.completeNutritionDays} complete dagen`, detail: inputs.averageCalories == null ? 'Geen betrouwbaar gemiddelde' : `${Math.round(inputs.averageCalories)} kcal gemiddeld` },
    { label: 'Eiwit', value: inputs.averageProtein == null ? 'Te weinig gegevens' : `${Math.round(inputs.averageProtein)} g gemiddeld` },
    { label: 'Training', value: `${inputs.completedWorkouts} van ${inputs.plannedWorkouts} trainingen`, detail: `Kracht: ${strengthNl(inputs.overallStrength)}` },
  ];
}

export function decideWeeklyCoach(data: AppData, referenceDate = toDateKey()): CoachingDecision {
  const inputs = buildCoachingInputs(data, referenceDate);
  const confidence = confidenceFor(inputs);
  const evidence = evidenceFor(inputs);
  const nextReviewDate = shiftDate(referenceDate, 7);
  const missingDataRequirements = [
    ...(inputs.currentWeighIns < 5 ? [`nog ${5 - inputs.currentWeighIns} ${5 - inputs.currentWeighIns === 1 ? 'weging' : 'wegingen'} deze week`] : []),
    ...(inputs.completeNutritionDays < 5 ? [`nog ${5 - inputs.completeNutritionDays} volledig ${5 - inputs.completeNutritionDays === 1 ? 'gelogde dag' : 'gelogde dagen'}`] : []),
  ];
  const base = { confidence, evidence, nextReviewDate, missingDataRequirements, secondaryActions: [] as string[], warnings: [] as string[] };

  if (inputs.activePause) return {
    ...base, conclusion: 'paused', title: 'Trendbeoordeling staat op pauze',
    explanation: `Je plan staat op pauze (${pauseNl(inputs.activePause.type)}). Plateaus en lagere doelen worden pas weer beoordeeld als je hervat.`,
    primaryAction: 'Doe wat haalbaar is voor voeding en herstel, en hervat als je er klaar voor bent.',
  };

  if (inputs.goalReached) return {
    ...base, conclusion: 'goal_reached', title: 'Je doelbereik is bereikt',
    explanation: `Je 7-daags gemiddelde is ${inputs.currentWeightAverage?.toFixed(1)} kg, binnen je doelbereik van ${data.activeGoal.targetRangeKg[0].toFixed(1)}–${data.activeGoal.targetRangeKg[1].toFixed(1)} kg.`,
    primaryAction: 'Houd deze week je doelen aan en kies of je een onderhoudsfase start.',
  };

  if (confidence === 'insufficient' || inputs.currentWeighIns < 4 || inputs.previousWeighIns < 3) return {
    ...base, conclusion: 'improve_logging', title: 'Houd het plan aan en verzamel betere gegevens',
    explanation: `Er zijn te weinig consistente gegevens om het plan te wijzigen. ${missingDataRequirements.length ? `Vul vóór de volgende check aan: ${missingDataRequirements.join(' en ')}.` : 'Ga door met je huidige doelen.'}`,
    primaryAction: 'Houd je calorieën gelijk en vul ontbrekende wegingen en voedingsdagen aan.',
  };

  const rapidCurrent = inputs.weeklyChangePct != null && inputs.weeklyChangePct < -Math.max(1, data.activeGoal.desiredLossRateMaxPct);
  const rapidPrevious = inputs.previousWeeklyChangePct != null && inputs.previousWeeklyChangePct < -Math.max(1, data.activeGoal.desiredLossRateMaxPct);
  const poorRecovery = inputs.recovery && (inputs.recovery.energy === 'low' || inputs.recovery.sleep === 'poor' || inputs.recovery.soreness === 'high' || inputs.recovery.hunger === 'high');
  const intakeLow = inputs.calorieAdherencePct != null && inputs.calorieAdherencePct < 88;
  const strengthDeclining = inputs.overallStrength === 'meaningfully_declining' || inputs.overallStrength === 'slightly_declining';
  if ((rapidCurrent && rapidPrevious) || (rapidCurrent && strengthDeclining && (poorRecovery || intakeLow))) return {
    ...base, conclusion: 'increase_calories', title: 'Je tekort wordt te groot',
    explanation: 'Je gewicht daalt sneller dan het bereik, terwijl herstel of trainingsprestaties achteruitgaan. Een groter tekort is niet het doel.',
    primaryAction: 'Eet iets meer per dag en houd je trainingsgewichten gelijk tot je herstel stabiel is.',
    proposedChange: { variable: 'calorie_target', previousValue: data.profile.calorieTarget, proposedValue: data.profile.calorieTarget + 150, expectedEffect: 'Rustiger afvallen en je trainingen ondersteunen.' },
    warnings: ['Verlaag je calorieën niet verder en compenseer deze week niet met extra cardio.'],
  };

  const caloriesHigh = inputs.calorieAdherencePct != null && inputs.calorieAdherencePct > 107;
  const flatTrend = inputs.weeklyChangePct != null && inputs.weeklyChangePct > -data.activeGoal.desiredLossRateMinPct;
  if (flatTrend && caloriesHigh && inputs.completeNutritionDays >= 5) return {
    ...base, conclusion: 'improve_adherence', title: 'Volg het huidige plan eerst consequenter',
    explanation: `Je inname lag gemiddeld ${Math.round((inputs.averageCalories ?? 0) - data.profile.calorieTarget)} kcal boven je doel. Het huidige doel is nog niet goed genoeg gevolgd om te zeggen dat het niet werkt.`,
    primaryAction: `Kom gemiddeld dichter bij ${data.profile.calorieTarget.toLocaleString('nl-NL')} kcal voordat je een lager doel overweegt.`,
  };

  if (flatTrend && inputs.completeNutritionDays < 5) return {
    ...base, conclusion: 'improve_logging', title: 'De gegevens rechtvaardigen geen andere calorieën',
    explanation: `Je gewicht bleef bijna gelijk, maar maar ${inputs.completeNutritionDays} dagen zijn volledig gelogd. Dat is een gegevensprobleem, geen bewijs dat het plan niet werkt.`,
    primaryAction: 'Houd je doelen aan en log deze week minstens vijf volledige dagen.',
  };

  const nearTargetCalories = inputs.calorieAdherencePct != null && inputs.calorieAdherencePct >= 93 && inputs.calorieAdherencePct <= 105;
  if (inputs.plateauDays >= 14 && nearTargetCalories && inputs.completeNutritionDays >= 5 && !inputs.recentPlanChange) return {
    ...base, conclusion: 'reduce_calories', title: 'Een kleine aanpassing is redelijk',
    explanation: `Je gewichtstrend is ${inputs.plateauDays} dagen vrijwel vlak, terwijl je volledig logt en dicht bij je doel eet. Je kracht is ${strengthNl(inputs.overallStrength)}.`,
    primaryAction: 'Kies één kleine aanpassing. Niet tegelijk minder eten én meer bewegen.',
    proposedChange: { variable: 'calorie_target', previousValue: data.profile.calorieTarget, proposedValue: Math.max(1400, data.profile.calorieTarget - 100), expectedEffect: 'Een klein extra tekort voor de komende 14 dagen.' },
    alternativeChange: { variable: 'daily_steps', previousValue: data.coachingSettings.dailyStepGoal, proposedValue: data.coachingSettings.dailyStepGoal + 1750, expectedEffect: 'Meer lichte beweging zonder je voedingsdoelen te wijzigen.' },
    nextReviewDate: shiftDate(referenceDate, 14),
  };

  if (inputs.weightPace === 'on_target') return {
    ...base, conclusion: 'keep_plan', title: 'Het werkt: houd het plan aan',
    explanation: `Je 7-daags gemiddelde daalde ${Math.abs(inputs.weeklyChangeKg ?? 0).toFixed(2)} kg (${Math.abs(inputs.weeklyChangePct ?? 0).toFixed(2)}%). Dat valt binnen je bereik. Je kracht is ${strengthNl(inputs.overallStrength)}.`,
    primaryAction: 'Houd calorieën, activiteit en trainingsdoelen gelijk.',
    secondaryActions: inputs.proteinAdherencePct != null && inputs.proteinAdherencePct < 90 ? ['Kom gemiddeld dichter bij je eiwitdoel.'] : [],
  };

  if (strengthDeclining && (poorRecovery || intakeLow)) return {
    ...base, conclusion: 'recovery_focus', title: 'Bescherm je prestaties voordat je strenger wordt',
    explanation: 'Meerdere herstelsignalen of oefeningen gaan de verkeerde kant op. Eén slechte training zegt niets, maar samen verdient het aandacht.',
    primaryAction: 'Houd calorieën gelijk, haal je eiwit en doe één week één werkset minder bij de hoofdoefeningen.',
    proposedChange: { variable: 'training_volume', previousValue: 'huidige werksets', proposedValue: 'één set minder per hoofdoefening', expectedEffect: 'Minder vermoeidheid met behoud van de belangrijkste prikkel.' },
  };

  return {
    ...base, conclusion: 'keep_plan', title: 'Nog geen aanpassing nodig',
    explanation: inputs.recentPlanChange
      ? `Een recente aanpassing (${inputs.recentPlanChange.variable.replace('_', ' ')}) werkt nog door. Beoordeel die eerst na de geplande periode in plaats van nu iets anders te wijzigen.`
      : 'De huidige trend rechtvaardigt geen aanpassing van calorieën of activiteit. Blijf consequent meten.',
    primaryAction: 'Houd het plan aan en beoordeel nog een volle week.',
    secondaryActions: inputs.proteinAdherencePct != null && inputs.proteinAdherencePct < 90 ? ['Geef eiwit voorrang boven extra tussendoortjes.'] : [],
  };
}

export function buildDailyCoach(data: AppData, date = toDateKey(), hour = new Date().getHours()): DailyCoachPriority {
  const totals = getNutritionTotals(data, date);
  const caloriesRemaining = Math.round(data.profile.calorieTarget - totals.calories);
  const proteinRemaining = Math.round(data.profile.proteinTarget - totals.protein);
  const activity = data.activityLog.find((item) => item.date === date);
  const stepsRemaining = activity ? Math.max(0, data.coachingSettings.dailyStepGoal - activity.steps) : data.coachingSettings.dailyStepGoal;
  const activePause = [...data.pausePeriods].reverse().find((item) => item.startDate <= date && (!item.endDate || item.endDate >= date));
  const recovery = [...data.recoveryFeedback].filter((item) => item.date <= date).sort((a, b) => a.date.localeCompare(b.date)).at(-1);
  const plan = data.trainingPlanner.dailyPlans.find((item) => item.date === date);
  const workoutDue = Boolean(plan && isStrengthTemplate(plan.selectedSessionTemplateId) && plan.status !== 'completed');
  const missedWorkout = Boolean(plan && plan.status === 'missed');
  const checkInDue = !data.weeklyCheckIns.some((item) => item.periodEnd >= shiftDate(date, -6)) && new Date(`${date}T12:00:00`).getDay() === data.coachingSettings.reviewWeekday;

  if (activePause) return {
    status: 'recovery_focus', title: 'Keep today simple',
    instruction: `Your plan is marked ${activePause.type.replace('_', ' ')}. Keep nutrition steady, prioritize recovery, and resume the full plan only when ready.`,
    secondaryActions: ['Do not compensate for missed days with extreme restriction.'], caloriesRemaining, proteinRemaining, stepsRemaining,
  };
  if (recovery && (recovery.energy === 'low' || recovery.sleep === 'poor' || recovery.soreness === 'high')) return {
    status: 'recovery_focus', title: 'Recovery comes first today',
    instruction: 'Keep calories and protein on plan. Use the light or shortened workout option instead of forcing extra volume.',
    secondaryActions: workoutDue ? ['Review today’s workout before starting.'] : ['Choose low-fatigue walking if it feels appropriate.'], caloriesRemaining, proteinRemaining, stepsRemaining,
  };
  if (missedWorkout) return {
    status: 'needs_attention', title: 'Reschedule the missed session',
    instruction: 'Move the missed workout to a recovery-compatible day, choose the short version, or skip it and continue the schedule.',
    secondaryActions: ['Do not stack two full sessions without considering recovery.'], caloriesRemaining, proteinRemaining, stepsRemaining,
  };
  if (workoutDue) return {
    status: 'on_track', title: 'Complete today’s strength session',
    instruction: 'Use the prefilled targets and aim to preserve load and total repetitions. A small rep improvement is enough.',
    secondaryActions: proteinRemaining > 25 ? [`You still need ${Math.max(0, proteinRemaining)} g protein today.`] : [], caloriesRemaining, proteinRemaining, stepsRemaining,
  };
  if (proteinRemaining >= 30 && hour >= 12) return {
    status: 'needs_attention', title: 'Close the protein gap',
    instruction: `You have ${Math.max(0, caloriesRemaining).toLocaleString()} kcal left and still need ${proteinRemaining} g protein. Build the next meal around a lean protein source that fits the remaining budget.`,
    secondaryActions: ['Open “What can I eat?” for portion-aware suggestions.'], caloriesRemaining, proteinRemaining, stepsRemaining,
  };
  if (caloriesRemaining <= 200) return {
    status: caloriesRemaining < 0 ? 'needs_attention' : 'on_track', title: caloriesRemaining < 0 ? 'Return to the normal plan' : 'Keep the remaining budget controlled',
    instruction: caloriesRemaining < 0
      ? `You are ${Math.abs(caloriesRemaining)} kcal above today’s target. Do not compensate with extreme restriction tomorrow; return to the normal target.`
      : `Only ${caloriesRemaining} kcal remain. Protein is ${proteinRemaining <= 0 ? 'already covered' : 'still below target'}, so keep any remaining food deliberate.`,
    secondaryActions: [], caloriesRemaining, proteinRemaining, stepsRemaining,
  };
  if (checkInDue) return {
    status: 'check_in_due', title: 'Complete the weekly check-in',
    instruction: 'Review weight trend, nutrition logging, training performance, and recovery before deciding whether anything should change.',
    secondaryActions: [], caloriesRemaining, proteinRemaining, stepsRemaining,
  };
  if (stepsRemaining != null && stepsRemaining > 0) return {
    status: 'on_track', title: 'Finish the day with low-fatigue activity',
    instruction: `You have ${stepsRemaining.toLocaleString()} steps remaining. Keep the calorie target stable rather than eating back estimated exercise calories.`,
    secondaryActions: proteinRemaining > 0 ? [`Keep ${proteinRemaining} g protein in the remaining food plan.`] : [], caloriesRemaining, proteinRemaining, stepsRemaining,
  };
  return {
    status: 'on_track', title: 'Stay with the current plan',
    instruction: 'Calories, protein, and activity are on course. No extra adjustment is needed today.',
    secondaryActions: [], caloriesRemaining, proteinRemaining, stepsRemaining,
  };
}
