import { exerciseMap } from '../data/exercises';
import { shiftDate, toDateKey } from './date';
import type {
  AppData,
  ReadinessResponse,
  SessionTemplateId,
  TrainingDayPlan,
  TrainingPlannerState,
  TrainingSelectionSource,
  WorkoutDay,
  WorkoutId,
  WorkoutSession,
} from '../types/models';

export type RecoveryIndicator = 'Ready' | 'Mostly recovered' | 'Recently trained' | 'Recovery recommended' | 'Not enough history';
export type PlannerMuscleGroup = 'Chest' | 'Back' | 'Shoulders' | 'Biceps' | 'Triceps' | 'Quadriceps' | 'Hamstrings' | 'Glutes' | 'Calves' | 'Core';

export interface SessionOptionSummary {
  id: SessionTemplateId;
  name: string;
  muscleGroups: PlannerMuscleGroup[];
  duration: string;
  type: 'upper' | 'lower' | 'full_body' | 'cardio' | 'mobility' | 'rest';
}

export interface SessionRecommendation {
  templateId: SessionTemplateId;
  reason: string;
  recoveryIndicator: RecoveryIndicator;
  supportsRemainingTargets: boolean;
}

export interface PlannerWarning {
  code: 'active_workout' | 'duplicate_session' | 'recent_muscles' | 'consecutive_strength' | 'hard_cardio_after_lower';
  tone: 'notice' | 'caution' | 'strong';
  title: string;
  message: string;
}

export const ALL_MUSCLE_GROUPS: PlannerMuscleGroup[] = ['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Quadriceps', 'Hamstrings', 'Glutes', 'Calves', 'Core'];

export const DEFAULT_TRAINING_PLANNER: TrainingPlannerState = {
  version: 1,
  dailyPlans: [],
  recoveryHeuristics: { strongWarningHours: 24, cautionHours: 48, heavyWorkingSetThreshold: 12 },
  weeklyTargets: { upperSessions: 2, lowerSessions: 2, strengthSessions: 4, recoveryOpportunities: 1 },
};

const DAY_IDS: WorkoutDay['id'][] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

function mondayOf(dateKey: string) {
  const date = new Date(`${dateKey}T12:00:00`);
  const day = date.getDay();
  date.setDate(date.getDate() - (day === 0 ? 6 : day - 1));
  return toDateKey(date);
}

export function weekDates(referenceDate = toDateKey()) {
  const monday = mondayOf(referenceDate);
  return Array.from({ length: 7 }, (_, index) => shiftDate(monday, index));
}

export function dayIdForDate(date: string): WorkoutDay['id'] {
  const index = Math.max(0, weekDates(date).indexOf(date));
  return DAY_IDS[index];
}

function normalizeMuscle(muscle: string): PlannerMuscleGroup | null {
  const value = muscle.toLowerCase();
  if (value.includes('chest')) return 'Chest';
  if (value.includes('lat') || value.includes('back') || value.includes('erector')) return 'Back';
  if (value.includes('delt') || value.includes('shoulder') || value.includes('trap')) return 'Shoulders';
  if (value.includes('bicep') || value.includes('brachialis')) return 'Biceps';
  if (value.includes('tricep')) return 'Triceps';
  if (value.includes('quad')) return 'Quadriceps';
  if (value.includes('hamstring')) return 'Hamstrings';
  if (value.includes('glute')) return 'Glutes';
  if (value.includes('calf') || value.includes('calves')) return 'Calves';
  if (value.includes('core') || value.includes('abdom')) return 'Core';
  return null;
}

export function sessionType(templateId: SessionTemplateId): SessionOptionSummary['type'] {
  if (templateId === 'cardio_recovery') return 'cardio';
  if (templateId === 'mobility_recovery') return 'mobility';
  if (templateId === 'full_rest') return 'rest';
  if (templateId.startsWith('upper_')) return 'upper';
  if (templateId.startsWith('lower_')) return 'lower';
  return 'full_body';
}

export function isStrengthTemplate(templateId: SessionTemplateId) {
  return !['cardio_recovery', 'mobility_recovery', 'full_rest'].includes(templateId);
}

export function selectionSourceLabel(source: TrainingSelectionSource) {
  const labels: Record<TrainingSelectionSource, string> = {
    default_template: 'Original plan',
    adaptive_recommendation: 'Recommended',
    user_selected: 'Selected by you',
    user_moved: 'Moved by you',
    user_swapped: 'Swapped by you',
  };
  return labels[source];
}

export function workoutTemplate(program: WorkoutDay[], templateId: SessionTemplateId) {
  return isStrengthTemplate(templateId) ? program.find((day) => day.workoutId === templateId) : undefined;
}

export function workoutDayForSession(program: WorkoutDay[], templateId: SessionTemplateId, date: string): WorkoutDay {
  const calendarId = dayIdForDate(date);
  const calendarLabel = program.find((day) => day.id === calendarId)?.label ?? calendarId.slice(0, 3);
  const template = workoutTemplate(program, templateId);
  if (template) return { ...template, id: calendarId, label: calendarLabel };
  if (templateId === 'full_rest') return { id: calendarId, label: calendarLabel, title: 'Full rest day', focus: 'Rest and normal daily movement', duration: 'As needed', isRestDay: true, recovery: ['No workout is required today.', 'Resume the weekly objectives when it suits your schedule.'], exercises: [] };
  if (templateId === 'mobility_recovery') return { id: calendarId, label: calendarLabel, title: 'Mobility or light recovery', focus: 'Easy movement and mobility', duration: '10–25 min', isRestDay: true, recovery: ['Keep every movement comfortable and easy.', 'Stop or reduce the range if a movement causes pain.'], cardioTargetMinutes: 15, cardioSuggestion: 'Gentle mobility, an easy walk, or another light recovery activity.', exercises: [] };
  return { id: calendarId, label: calendarLabel, title: 'Cardio + recovery', focus: 'Conversational-pace cardio', duration: '25–40 min', isRestDay: true, recovery: ['Keep the pace recoverable.', 'Avoid hard intervals when your legs are carrying fatigue.'], cardioTargetMinutes: 30, cardioSuggestion: 'Easy walk, bike, or other low-impact cardio at a conversational pace.', exercises: [] };
}

export function sessionOption(program: WorkoutDay[], templateId: SessionTemplateId): SessionOptionSummary {
  const virtual: Record<'cardio_recovery' | 'mobility_recovery' | 'full_rest', SessionOptionSummary> = {
    cardio_recovery: { id: 'cardio_recovery', name: 'Cardio + recovery', muscleGroups: [], duration: '25–40 min', type: 'cardio' },
    mobility_recovery: { id: 'mobility_recovery', name: 'Mobility or light recovery', muscleGroups: [], duration: '10–25 min', type: 'mobility' },
    full_rest: { id: 'full_rest', name: 'Full rest day', muscleGroups: [], duration: 'As needed', type: 'rest' },
  };
  if (templateId === 'cardio_recovery' || templateId === 'mobility_recovery' || templateId === 'full_rest') return virtual[templateId];
  const day = workoutTemplate(program, templateId);
  const muscles = day?.exercises.flatMap((item) => {
    const exercise = exerciseMap.get(item.exerciseId);
    return [...(exercise?.primaryMuscles ?? []), ...(exercise?.secondaryMuscles ?? [])].map(normalizeMuscle).filter((item): item is PlannerMuscleGroup => item != null);
  }) ?? [];
  const type = sessionType(templateId);
  const labels: Partial<Record<WorkoutId, string>> = {
    upper_a: 'Chest, back & arms',
    upper_b: 'Shoulders, back & arms',
    lower_a: 'Legs · Squat & hamstrings',
    lower_b: 'Legs · Glutes & hamstrings',
    full_body_a: 'Full body 1', full_body_b: 'Full body 2', full_body_c: 'Full body 3',
  };
  return { id: templateId, name: labels[templateId as WorkoutId] ?? day?.title ?? 'Saved workout', muscleGroups: [...new Set(muscles)], duration: day?.duration ?? '60–75 min', type };
}

export function availableSessionOptions(program: WorkoutDay[]) {
  const strengthIds = [...new Set(program.flatMap((day) => day.workoutId ? [day.workoutId] : []))];
  return [...strengthIds, 'cardio_recovery', 'mobility_recovery', 'full_rest'].map((id) => sessionOption(program, id as SessionTemplateId));
}

function sessionMuscleTargets(program: WorkoutDay[], templateId: SessionTemplateId) {
  const loads = new Map<PlannerMuscleGroup, number>();
  const day = workoutTemplate(program, templateId);
  for (const item of day?.exercises ?? []) {
    const exercise = exerciseMap.get(item.exerciseId);
    for (const [muscle, factor] of [...(exercise?.primaryMuscles ?? []).map((group) => [group, 1] as const), ...(exercise?.secondaryMuscles ?? []).map((group) => [group, .5] as const)]) {
      const normalized = normalizeMuscle(muscle);
      if (normalized) loads.set(normalized, (loads.get(normalized) ?? 0) + item.sets * factor);
    }
  }
  return loads;
}

function completedTime(session: WorkoutSession) {
  if (session.completedAt?.slice(0, 10) === session.date) return new Date(session.completedAt).getTime();
  return new Date(`${session.date}T20:00:00`).getTime();
}

export function sessionMuscleLoad(session: WorkoutSession) {
  const loads = new Map<PlannerMuscleGroup, number>();
  for (const set of session.sets) {
    if (!set.completed || set.isWarmup) continue;
    const exercise = exerciseMap.get(set.exerciseId);
    const effortFactor = set.rir == null ? 1 : set.rir <= 1 ? 1.2 : set.rir >= 4 ? .8 : 1;
    for (const [muscle, factor] of [...(exercise?.primaryMuscles ?? []).map((item) => [item, effortFactor] as const), ...(exercise?.secondaryMuscles ?? []).map((item) => [item, .5 * effortFactor] as const)]) {
      const group = normalizeMuscle(muscle);
      if (group) loads.set(group, (loads.get(group) ?? 0) + factor);
    }
  }
  return loads;
}

function referenceTime(date: string, now = new Date()) {
  return date === toDateKey(now) ? now.getTime() : new Date(`${date}T12:00:00`).getTime();
}

export function recoveryForSession(data: Pick<AppData, 'program' | 'sessions' | 'trainingPlanner'>, templateId: SessionTemplateId, date: string, now = new Date()) {
  const option = sessionOption(data.program, templateId);
  if (!isStrengthTemplate(templateId)) return { indicator: 'Ready' as RecoveryIndicator, recentGroups: [] as PlannerMuscleGroup[], minimumHours: null as number | null };
  const completed = data.sessions.filter((session) => session.completedAt && session.date <= date);
  if (!completed.length) return { indicator: 'Not enough history' as RecoveryIndicator, recentGroups: [], minimumHours: null };
  const targetLoads = sessionMuscleTargets(data.program, templateId);
  const relevant = option.muscleGroups.filter((group) => (targetLoads.get(group) ?? 0) >= 2).flatMap((group) => {
    const latest = completed.filter((session) => (sessionMuscleLoad(session).get(group) ?? 0) > 0).sort((a, b) => completedTime(b) - completedTime(a))[0];
    if (!latest) return [];
    const hours = (referenceTime(date, now) - completedTime(latest)) / 3_600_000;
    const load = sessionMuscleLoad(latest).get(group) ?? 0;
    return [{ group, hours, load, effectiveHours: hours + (load < 2 ? 24 : load < 4 ? 12 : 0) }];
  });
  if (!relevant.length) return { indicator: 'Not enough history' as RecoveryIndicator, recentGroups: [], minimumHours: null };
  const minimumHours = Math.min(...relevant.map((item) => item.effectiveHours));
  const heavy = relevant.some((item) => item.load >= data.trainingPlanner.recoveryHeuristics.heavyWorkingSetThreshold);
  const strongThreshold = data.trainingPlanner.recoveryHeuristics.strongWarningHours;
  const cautionThreshold = data.trainingPlanner.recoveryHeuristics.cautionHours;
  const indicator: RecoveryIndicator = minimumHours < strongThreshold ? 'Recovery recommended'
    : minimumHours < cautionThreshold || heavy && minimumHours < cautionThreshold + 12 ? 'Recently trained'
      : minimumHours < cautionThreshold + 24 ? 'Mostly recovered' : 'Ready';
  return { indicator, recentGroups: relevant.filter((item) => item.effectiveHours < cautionThreshold).map((item) => item.group), minimumHours };
}

function sessionsInWeek(sessions: WorkoutSession[], date: string) {
  const [start, , , , , , end] = weekDates(date);
  return sessions.filter((session) => session.completedAt && session.date >= start && session.date <= end && session.sets.some((set) => set.completed && !set.isWarmup));
}

function completedCounts(data: Pick<AppData, 'sessions' | 'trainingPlanner'>, date: string) {
  const completed = sessionsInWeek(data.sessions, date);
  const upper = completed.filter((session) => sessionType(session.workoutId) === 'upper').length;
  const lower = completed.filter((session) => sessionType(session.workoutId) === 'lower').length;
  return { upper, lower, strength: completed.length };
}

function defaultTemplateForDate(program: WorkoutDay[], date: string): SessionTemplateId {
  const day = program.find((item) => item.id === dayIdForDate(date));
  return day?.workoutId ?? (dayIdForDate(date) === 'friday' ? 'mobility_recovery' : 'cardio_recovery');
}

export function lastPerformed(data: Pick<AppData, 'sessions'>, templateId: SessionTemplateId, beforeDate?: string) {
  if (!isStrengthTemplate(templateId)) return null;
  return data.sessions.filter((session) => session.completedAt && session.workoutId === templateId && (!beforeDate || session.date <= beforeDate)).sort((a, b) => b.date.localeCompare(a.date))[0]?.date ?? null;
}

function strengthDaysBefore(sessions: WorkoutSession[], date: string) {
  let count = 0;
  let cursor = shiftDate(date, -1);
  while (sessions.some((session) => session.completedAt && session.date === cursor && session.sets.some((set) => set.completed && !set.isWarmup))) {
    count += 1;
    cursor = shiftDate(cursor, -1);
  }
  return count;
}

function scheduledStrengthDaysBefore(data: Pick<AppData, 'program' | 'sessions' | 'trainingPlanner'>, date: string, now: Date) {
  const today = toDateKey(now);
  let count = 0;
  let cursor = shiftDate(date, -1);
  while (true) {
    const completed = data.sessions.some((session) => session.completedAt && session.date === cursor && session.sets.some((set) => set.completed && !set.isWarmup));
    const plan = data.trainingPlanner.dailyPlans.find((item) => item.date === cursor);
    const scheduled = cursor >= today && (!plan || !['skipped', 'missed', 'rest'].includes(plan.status)) && isStrengthTemplate(plan?.selectedSessionTemplateId ?? defaultTemplateForDate(data.program, cursor));
    if (!completed && !scheduled) break;
    count += 1;
    cursor = shiftDate(cursor, -1);
  }
  return count;
}

function scheduledStrengthOutsideDate(data: Pick<AppData, 'program' | 'trainingPlanner'>, date: string, now: Date) {
  const today = toDateKey(now);
  const dates = weekDates(date).filter((item) => item !== date && item >= today);
  return dates.filter((plannedDate) => {
    const plan = data.trainingPlanner.dailyPlans.find((item) => item.date === plannedDate);
    if (plan && (plan.status === 'completed' || plan.status === 'skipped' || plan.status === 'missed')) return false;
    return isStrengthTemplate(plan?.selectedSessionTemplateId ?? defaultTemplateForDate(data.program, plannedDate));
  }).length;
}

function adjacentPlanPenalty(data: Pick<AppData, 'program' | 'trainingPlanner'>, date: string, candidateId: SessionTemplateId) {
  if (!isStrengthTemplate(candidateId)) return 0;
  const candidate = sessionOption(data.program, candidateId);
  let penalty = 0;
  for (const adjacentDate of [shiftDate(date, -1), shiftDate(date, 1)]) {
    const plan = data.trainingPlanner.dailyPlans.find((item) => item.date === adjacentDate);
    if (!plan || ['skipped', 'missed', 'rest'].includes(plan.status) || !isStrengthTemplate(plan.selectedSessionTemplateId)) continue;
    const adjacent = sessionOption(data.program, plan.selectedSessionTemplateId);
    if (candidate.type === adjacent.type && (candidate.type === 'upper' || candidate.type === 'lower')) penalty -= 90;
    const overlap = candidate.muscleGroups.filter((muscle) => adjacent.muscleGroups.includes(muscle)).length;
    penalty -= overlap * 6;
  }
  return penalty;
}

export function recommendSession(data: Pick<AppData, 'program' | 'sessions' | 'cardioLog' | 'weeklyCardioTarget' | 'trainingPlanner'>, date: string, now = new Date()): SessionRecommendation {
  const active = [...data.sessions].reverse().find((session) => !session.completedAt);
  if (active && active.date === date) return { templateId: active.workoutId, reason: `Resume ${sessionOption(data.program, active.workoutId).name}; it is already in progress.`, recoveryIndicator: 'Ready', supportsRemainingTargets: true };
  const counts = completedCounts(data, date);
  const targets = data.trainingPlanner.weeklyTargets;
  const remaining = { upper: Math.max(0, targets.upperSessions - counts.upper), lower: Math.max(0, targets.lowerSessions - counts.lower), strength: Math.max(0, targets.strengthSessions - counts.strength) };
  const defaultId = defaultTemplateForDate(data.program, date);
  const defaultOption = sessionOption(data.program, defaultId);
  const scheduledStrength = scheduledStrengthOutsideDate(data, date, now);
  const cardioMinutes = (() => { const [start, , , , , , end] = weekDates(date); return data.cardioLog.filter((entry) => entry.date >= start && entry.date <= end).reduce((sum, entry) => sum + entry.minutes, 0); })();
  const consecutive = strengthDaysBefore(data.sessions, date);
  const scheduledConsecutive = scheduledStrengthDaysBefore(data, date, now);
  const readiness = data.trainingPlanner.dailyPlans.find((plan) => plan.date === date)?.readinessResponse;

  if (readiness?.jointDiscomfort === 'significant') return { templateId: 'mobility_recovery', reason: 'You reported significant joint discomfort. Choose recovery and stop for sharp pain, dizziness or instability. This is not a diagnosis.', recoveryIndicator: 'Recovery recommended', supportsRemainingTargets: true };
  if (readiness && (readiness.energy <= 2 || readiness.muscleSoreness >= 4 || readiness.availableMinutes < 20)) return { templateId: 'mobility_recovery', reason: `Recovery is recommended based on your check-in: ${readiness.energy}/5 energy, ${readiness.muscleSoreness}/5 soreness and ${readiness.availableMinutes} minutes available.`, recoveryIndicator: 'Recovery recommended', supportsRemainingTargets: true };

  if (consecutive >= 3) return { templateId: 'mobility_recovery', reason: `Recovery is recommended after ${consecutive} consecutive strength days.`, recoveryIndicator: 'Recovery recommended', supportsRemainingTargets: true };
  if (scheduledConsecutive >= 3) return { templateId: 'mobility_recovery', reason: `Recovery is recommended because ${scheduledConsecutive} consecutive strength days are already completed or selected.`, recoveryIndicator: 'Recovery recommended', supportsRemainingTargets: true };

  if (scheduledStrength >= remaining.strength) {
    const recoveryId = cardioMinutes < data.weeklyCardioTarget ? defaultId : 'mobility_recovery';
    const safeRecoveryId = isStrengthTemplate(recoveryId) ? (cardioMinutes < data.weeklyCardioTarget ? 'cardio_recovery' : 'mobility_recovery') : recoveryId;
    return { templateId: safeRecoveryId, reason: cardioMinutes < data.weeklyCardioTarget ? `${Math.max(0, data.weeklyCardioTarget - cardioMinutes)} cardio minutes remain. The remaining strength workouts are already scheduled on other days.` : 'The remaining strength workouts are already scheduled on other days. Recovery is recommended here.', recoveryIndicator: 'Ready', supportsRemainingTargets: true };
  }

  const candidates = availableSessionOptions(data.program).filter((option) => isStrengthTemplate(option.id) && (remaining[option.type === 'upper' ? 'upper' : option.type === 'lower' ? 'lower' : 'strength'] > 0 || remaining.strength > 0));
  const scored = candidates.map((option) => {
    const recovery = recoveryForSession(data as Pick<AppData, 'program' | 'sessions' | 'trainingPlanner'>, option.id, date, now);
    const categoryNeed = option.type === 'upper' ? remaining.upper : option.type === 'lower' ? remaining.lower : remaining.strength;
    const performed = sessionsInWeek(data.sessions, date).filter((session) => session.workoutId === option.id).length;
    const recoveryScore = recovery.indicator === 'Ready' ? 30 : recovery.indicator === 'Mostly recovered' ? 18 : recovery.indicator === 'Not enough history' ? 12 : recovery.indicator === 'Recently trained' ? -25 : -60;
    const defaultScore = option.id === defaultId ? 12 : 0;
    const spacingScore = adjacentPlanPenalty(data, date, option.id);
    return { option, recovery, score: categoryNeed * 35 + recoveryScore + defaultScore + spacingScore - performed * 18 };
  }).sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (best && remaining.strength > 0) {
    const daysSince = best.recovery.minimumHours == null ? null : Math.floor(best.recovery.minimumHours / 24);
    const category = best.option.type === 'upper' ? 'upper-body' : best.option.type === 'lower' ? 'lower-body' : 'strength';
    const count = Math.max(1, best.option.type === 'upper' ? remaining.upper : best.option.type === 'lower' ? remaining.lower : remaining.strength);
    const targetText = `${count} ${category} workout${count === 1 ? '' : 's'} remain${count === 1 ? 's' : ''} this week.`;
    const recoveryText = best.recovery.indicator === 'Not enough history'
      ? 'More workout history is needed to estimate recovery.'
      : best.recovery.indicator === 'Ready'
        ? `The main muscles have had ${daysSince ?? 0} recovery day${daysSince === 1 ? '' : 's'}.`
        : `Recovery status: ${best.recovery.indicator.toLowerCase()}.`;
    return { templateId: best.option.id, reason: `Recommended because ${targetText} ${recoveryText}`, recoveryIndicator: best.recovery.indicator, supportsRemainingTargets: true };
  }

  if (cardioMinutes < data.weeklyCardioTarget) return { templateId: 'cardio_recovery', reason: `${Math.max(0, data.weeklyCardioTarget - cardioMinutes)} cardio minutes remain and your weekly strength target is already covered.`, recoveryIndicator: 'Ready', supportsRemainingTargets: true };
  return { templateId: defaultOption.type === 'rest' ? 'full_rest' : 'mobility_recovery', reason: 'Weekly strength and cardio targets are complete. Recovery is recommended.', recoveryIndicator: 'Ready', supportsRemainingTargets: true };
}

function isExplicitSource(source: TrainingSelectionSource) {
  return source === 'user_selected' || source === 'user_moved' || source === 'user_swapped';
}

export function recalculateTrainingWeek(data: AppData, referenceDate = toDateKey(), now = new Date()) {
  const dates = weekDates(referenceDate);
  const dateSet = new Set(dates);
  const untouched = data.trainingPlanner.dailyPlans.filter((plan) => !dateSet.has(plan.date));
  const existingByDate = new Map(data.trainingPlanner.dailyPlans.filter((plan) => dateSet.has(plan.date)).map((plan) => [plan.date, plan]));
  const generated: TrainingDayPlan[] = [];
  const plannerView = { ...data, trainingPlanner: { ...data.trainingPlanner, dailyPlans: [...untouched, ...existingByDate.values()] } };
  for (const date of dates) {
    const existing = existingByDate.get(date);
    const completed = data.sessions.filter((session) => session.completedAt && session.date === date).sort((a, b) => (a.completedAt ?? '').localeCompare(b.completedAt ?? '')).at(-1);
    if (existing?.status === 'completed' || completed) {
      const actual = completed ?? data.sessions.find((session) => session.id === existing?.completedWorkoutId);
      generated.push({
        ...(existing ?? {
          date, recommendationReason: 'Historical session preserved.', recommendationCreatedAt: now.toISOString(), overrideWarningShown: false,
          selectionSource: 'adaptive_recommendation' as const,
        }),
        recommendedSessionTemplateId: existing?.recommendedSessionTemplateId ?? actual?.workoutId ?? defaultTemplateForDate(data.program, date),
        selectedSessionTemplateId: actual?.workoutId ?? existing?.selectedSessionTemplateId ?? defaultTemplateForDate(data.program, date),
        status: 'completed', completedWorkoutId: actual?.id ?? existing?.completedWorkoutId, completedAt: actual?.completedAt ?? existing?.completedAt,
      });
      continue;
    }
    if (existing && date < toDateKey(now)) {
      generated.push({
        ...existing,
        status: existing.status === 'skipped' ? 'skipped' : existing.selectedSessionTemplateId === 'full_rest' ? 'rest' : 'missed',
      });
      continue;
    }
    const generatedDates = new Set(generated.map((plan) => plan.date));
    const currentPlannerPlans = [
      ...plannerView.trainingPlanner.dailyPlans.filter((plan) => plan.date !== date && !generatedDates.has(plan.date)),
      ...generated,
      ...(existing ? [existing] : []),
    ];
    const recommendation = recommendSession({ ...plannerView, trainingPlanner: { ...plannerView.trainingPlanner, dailyPlans: currentPlannerPlans } }, date, now);
    const explicit = existing && isExplicitSource(existing.selectionSource);
    const selected = explicit ? existing.selectedSessionTemplateId : recommendation.templateId;
    const past = date < toDateKey(now);
    const status = existing?.status === 'skipped' ? 'skipped' : past ? (selected === 'full_rest' ? 'rest' : 'missed') : explicit ? 'selected' : selected === 'full_rest' ? 'rest' : 'recommended';
    generated.push({
      date,
      recommendedSessionTemplateId: recommendation.templateId,
      selectedSessionTemplateId: selected,
      selectionSource: explicit ? existing.selectionSource : existing?.selectionSource === 'default_template' ? 'adaptive_recommendation' : existing?.selectionSource ?? 'default_template',
      recommendationReason: recommendation.reason,
      recommendationCreatedAt: existing && date < toDateKey(now) ? existing.recommendationCreatedAt : now.toISOString(),
      status,
      overrideWarningShown: existing?.overrideWarningShown ?? false,
      readinessResponse: existing?.readinessResponse,
    });
  }
  return { ...data.trainingPlanner, version: 1 as const, dailyPlans: [...untouched, ...generated] };
}

export function selectTrainingSession(data: AppData, date: string, templateId: SessionTemplateId, selectionSource: TrainingSelectionSource = 'user_selected', overrideWarningShown = false, readinessResponse?: ReadinessResponse, now = new Date()) {
  const recommendation = recommendSession(data, date, now);
  const existing = data.trainingPlanner.dailyPlans.find((plan) => plan.date === date);
  const selected: TrainingDayPlan = {
    ...(existing ?? { date, recommendationCreatedAt: now.toISOString(), recommendationReason: recommendation.reason, recommendedSessionTemplateId: recommendation.templateId }),
    selectedSessionTemplateId: templateId,
    selectionSource,
    status: templateId === 'full_rest' ? 'rest' : 'selected',
    overrideWarningShown,
    readinessResponse,
  };
  const next = { ...data, trainingPlanner: { ...data.trainingPlanner, dailyPlans: [...data.trainingPlanner.dailyPlans.filter((plan) => plan.date !== date), selected] } };
  return recalculateTrainingWeek(next, date, now);
}

export function moveTrainingSession(data: AppData, fromDate: string, toDate: string, swap: boolean, now = new Date()) {
  const from = data.trainingPlanner.dailyPlans.find((plan) => plan.date === fromDate);
  const to = data.trainingPlanner.dailyPlans.find((plan) => plan.date === toDate);
  if (!from || !to || from.status === 'completed' || to.status === 'completed') return data.trainingPlanner;
  const nextPlans = data.trainingPlanner.dailyPlans.map((plan) => {
    if (plan.date === toDate) return { ...plan, selectedSessionTemplateId: from.selectedSessionTemplateId, selectionSource: swap ? 'user_swapped' as const : 'user_moved' as const, status: 'selected' as const };
    if (plan.date === fromDate) return { ...plan, selectedSessionTemplateId: swap ? to.selectedSessionTemplateId : 'full_rest', selectionSource: swap ? 'user_swapped' as const : 'user_moved' as const, status: swap ? 'selected' as const : 'rest' as const };
    return plan;
  });
  return recalculateTrainingWeek({ ...data, trainingPlanner: { ...data.trainingPlanner, dailyPlans: nextPlans } }, fromDate, now);
}

export function restoreRecommendedWeek(data: AppData, referenceDate = toDateKey(), now = new Date()) {
  const dates = new Set(weekDates(referenceDate));
  const dailyPlans = data.trainingPlanner.dailyPlans.map((plan) => dates.has(plan.date) && plan.status !== 'completed' ? { ...plan, selectedSessionTemplateId: plan.recommendedSessionTemplateId, selectionSource: 'adaptive_recommendation' as const, status: plan.recommendedSessionTemplateId === 'full_rest' ? 'rest' as const : 'recommended' as const, overrideWarningShown: false, readinessResponse: undefined } : plan);
  return recalculateTrainingWeek({ ...data, trainingPlanner: { ...data.trainingPlanner, dailyPlans } }, referenceDate, now);
}

export function plannerWarnings(data: AppData, date: string, templateId: SessionTemplateId, readiness?: ReadinessResponse, now = new Date()): PlannerWarning[] {
  const warnings: PlannerWarning[] = [];
  const option = sessionOption(data.program, templateId);
  const active = [...data.sessions].reverse().find((session) => !session.completedAt);
  if (active) warnings.push({ code: 'active_workout', tone: 'strong', title: 'Workout already in progress', message: `You have an unfinished ${sessionOption(data.program, active.workoutId).name} workout. Resume it, discard it or start another workout.` });
  const duplicate = isStrengthTemplate(templateId) && data.sessions.some((session) => session.completedAt && session.date === date && session.workoutId === templateId);
  if (duplicate) warnings.push({ code: 'duplicate_session', tone: 'strong', title: 'Exact session already completed today', message: `You already completed ${option.name} today. Starting it again creates a second workout and additional volume for the same muscle groups; the first workout will remain preserved.` });
  const recovery = recoveryForSession(data, templateId, date, now);
  if (recovery.indicator === 'Recovery recommended' || recovery.indicator === 'Recently trained') {
    const groups = recovery.recentGroups.join(', ');
    warnings.push({ code: 'recent_muscles', tone: recovery.indicator === 'Recovery recommended' ? 'strong' : 'caution', title: 'Some muscles may still be recovering', message: `You recently trained ${groups || 'overlapping muscle groups'}. Repeating a hard ${option.type === 'upper' ? 'upper-body' : option.type === 'lower' ? 'lower-body' : 'strength'} session today may reduce workout quality.` });
  }
  const consecutive = strengthDaysBefore(data.sessions, date);
  if (isStrengthTemplate(templateId) && consecutive >= 3) warnings.push({ code: 'consecutive_strength', tone: 'caution', title: 'Several consecutive strength days', message: `You have completed ${consecutive} strength sessions on consecutive days. A lighter or recovery-focused day may help manage fatigue.` });
  if (templateId === 'cardio_recovery' && readiness?.preferredIntensity === 'hard') {
    const recentLower = data.sessions.some((session) => session.completedAt && sessionType(session.workoutId) === 'lower' && session.date >= shiftDate(date, -1) && session.date <= date);
    if (recentLower) warnings.push({ code: 'hard_cardio_after_lower', tone: 'caution', title: 'Hard cardio may conflict with leg recovery', message: 'A demanding lower-body workout was completed recently. Easy walking or gentle cycling is less likely to compete with leg recovery than hard running intervals.' });
  }
  return warnings;
}

export function weeklyBalance(data: Pick<AppData, 'sessions' | 'cardioLog' | 'weeklyCardioTarget' | 'trainingPlanner'>, referenceDate = toDateKey()) {
  const completed = sessionsInWeek(data.sessions, referenceDate);
  const counts = completedCounts(data, referenceDate);
  const [start, , , , , , end] = weekDates(referenceDate);
  const cardioMinutes = data.cardioLog.filter((entry) => entry.date >= start && entry.date <= end).reduce((sum, entry) => sum + entry.minutes, 0);
  const trained = new Set(completed.flatMap((session) => [...sessionMuscleLoad(session).keys()]));
  const recoveryOpportunities = data.trainingPlanner.dailyPlans.filter((plan) => plan.date >= start && plan.date <= end && (plan.selectedSessionTemplateId === 'full_rest' || plan.selectedSessionTemplateId === 'mobility_recovery' || plan.selectedSessionTemplateId === 'cardio_recovery')).length;
  return {
    upper: counts.upper, lower: counts.lower, strength: counts.strength, cardioMinutes, recoveryOpportunities,
    trainedGroups: ALL_MUSCLE_GROUPS.filter((group) => trained.has(group)),
    untrainedGroups: ALL_MUSCLE_GROUPS.filter((group) => !trained.has(group)),
    targets: data.trainingPlanner.weeklyTargets,
    cardioTarget: data.weeklyCardioTarget,
  };
}
