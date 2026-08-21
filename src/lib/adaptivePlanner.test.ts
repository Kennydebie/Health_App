import { describe, expect, it } from 'vitest';
import { createSeedData } from '../data/seed';
import type { AppData, WorkoutId, WorkoutSession } from '../types/models';
import {
  DEFAULT_TRAINING_PLANNER,
  dayIdForDate,
  moveTrainingSession,
  plannerWarnings,
  recalculateTrainingWeek,
  recoveryForSession,
  restoreRecommendedWeek,
  selectTrainingSession,
  sessionMuscleLoad,
  weeklyBalance,
  weekDates,
} from './adaptivePlanner';

const monday = '2026-08-17';
const mondayNoon = new Date('2026-08-17T12:00:00');

function completedSession(id: string, date: string, workoutId: WorkoutId, exerciseId: string, workingSets = 3): WorkoutSession {
  return {
    id,
    date,
    dayId: dayIdForDate(date),
    workoutId,
    title: workoutId,
    startedAt: `${date}T08:00:00.000Z`,
    completedAt: `${date}T09:00:00.000Z`,
    durationSeconds: 3600,
    sets: Array.from({ length: workingSets }, (_, index) => ({
      id: `${id}_${index}`,
      exerciseId,
      setNumber: index + 1,
      weightKg: 40,
      reps: 8,
      completed: true,
    })),
  };
}

function plannerData(referenceDate = monday, now = mondayNoon): AppData {
  const data = createSeedData();
  data.sessions = [];
  data.cardioLog = [];
  data.trainingPlanner = structuredClone(DEFAULT_TRAINING_PLANNER);
  data.trainingPlanner = recalculateTrainingWeek(data, referenceDate, now);
  return data;
}

describe('adaptive workout planner', () => {
  it('creates a balanced, deterministic four-day week when there is no history', () => {
    const data = plannerData();
    const plans = data.trainingPlanner.dailyPlans.filter((plan) => weekDates(monday).includes(plan.date));
    const strength = plans.filter((plan) => !['cardio_recovery', 'mobility_recovery', 'full_rest'].includes(plan.selectedSessionTemplateId));

    expect(plans).toHaveLength(7);
    expect(strength).toHaveLength(4);
    expect(plans.filter((plan) => ['cardio_recovery', 'mobility_recovery', 'full_rest'].includes(plan.selectedSessionTemplateId)).length).toBeGreaterThanOrEqual(1);
    expect(plans.every((plan) => plan.recommendationReason.length > 20)).toBe(true);
  });

  it('warns about Upper A after Thursday Upper B but keeps the deliberate Friday choice', () => {
    const data = plannerData('2026-08-21', new Date('2026-08-21T12:00:00'));
    data.sessions = [completedSession('upper_b_thu', '2026-08-20', 'upper_b', 'overhead-press')];
    data.trainingPlanner = recalculateTrainingWeek(data, '2026-08-21', new Date('2026-08-21T12:00:00'));

    const warnings = plannerWarnings(data, '2026-08-21', 'upper_a', undefined, new Date('2026-08-21T12:00:00'));
    const selected = selectTrainingSession(data, '2026-08-21', 'upper_a', 'user_selected', true, undefined, new Date('2026-08-21T12:00:00'));

    expect(warnings.some((warning) => warning.code === 'recent_muscles')).toBe(true);
    expect(selected.dailyPlans.find((plan) => plan.date === '2026-08-21')).toMatchObject({ selectedSessionTemplateId: 'upper_a', selectionSource: 'user_selected', overrideWarningShown: true });
    expect(weeklyBalance({ ...data, trainingPlanner: selected }, '2026-08-21').strength).toBe(1);
  });

  it('allows Lower B on Saturday when lower-body muscles have not been trained recently', () => {
    const data = plannerData('2026-08-22', new Date('2026-08-22T12:00:00'));
    data.sessions = [completedSession('upper_thu', '2026-08-20', 'upper_b', 'overhead-press')];

    const recovery = recoveryForSession(data, 'lower_b', '2026-08-22', new Date('2026-08-22T12:00:00'));
    const warnings = plannerWarnings(data, '2026-08-22', 'lower_b', undefined, new Date('2026-08-22T12:00:00'));

    expect(['Ready', 'Not enough history']).toContain(recovery.indicator);
    expect(warnings.some((warning) => warning.code === 'recent_muscles')).toBe(false);
  });

  it('replans the Thursday-to-Sunday acceptance scenario without workout debt or lost history', () => {
    const data = plannerData('2026-08-21', new Date('2026-08-21T12:00:00'));
    const thursday = completedSession('upper_b_thu', '2026-08-20', 'upper_b', 'overhead-press');
    data.sessions = [thursday];
    data.trainingPlanner = recalculateTrainingWeek(data, '2026-08-21', new Date('2026-08-21T12:00:00'));
    data.trainingPlanner = selectTrainingSession(data, '2026-08-21', 'upper_a', 'user_selected', true, undefined, new Date('2026-08-21T12:00:00'));
    const friday = completedSession('upper_a_fri', '2026-08-21', 'upper_a', 'bench-press');
    data.sessions.push(friday);
    data.trainingPlanner = recalculateTrainingWeek(data, '2026-08-21', new Date('2026-08-21T18:00:00'));
    data.trainingPlanner = selectTrainingSession(data, '2026-08-22', 'lower_b', 'user_selected', false, undefined, new Date('2026-08-22T12:00:00'));
    const saturday = completedSession('lower_b_sat', '2026-08-22', 'lower_b', 'hip-thrust');
    data.sessions.push(saturday);
    data.trainingPlanner = recalculateTrainingWeek(data, '2026-08-23', new Date('2026-08-23T12:00:00'));

    const sunday = data.trainingPlanner.dailyPlans.find((plan) => plan.date === '2026-08-23')!;
    expect(['cardio_recovery', 'mobility_recovery', 'full_rest']).toContain(sunday.selectedSessionTemplateId);
    expect(data.sessions.map((session) => session.id)).toEqual(['upper_b_thu', 'upper_a_fri', 'lower_b_sat']);
    expect(weeklyBalance(data, '2026-08-23')).toMatchObject({ upper: 2, lower: 1, strength: 3, cardioMinutes: 0 });
  });

  it('warns before an exact duplicate session on the same day without deleting the first workout', () => {
    const data = plannerData();
    data.sessions = [completedSession('first_upper', monday, 'upper_a', 'bench-press')];

    expect(plannerWarnings(data, monday, 'upper_a', undefined, mondayNoon).some((warning) => warning.code === 'duplicate_session')).toBe(true);
    expect(data.sessions.map((session) => session.id)).toEqual(['first_upper']);
  });

  it('warns after three consecutive completed strength days, while planned and skipped days do not count', () => {
    const data = plannerData('2026-08-20', new Date('2026-08-20T12:00:00'));
    data.sessions = [
      completedSession('mon', '2026-08-17', 'upper_a', 'bench-press'),
      completedSession('tue', '2026-08-18', 'lower_a', 'romanian-deadlift'),
      completedSession('wed', '2026-08-19', 'upper_b', 'overhead-press'),
    ];
    expect(plannerWarnings(data, '2026-08-20', 'lower_b', undefined, new Date('2026-08-20T12:00:00')).some((warning) => warning.code === 'consecutive_strength')).toBe(true);

    data.sessions = data.sessions.slice(0, 2);
    const plannedWednesday = selectTrainingSession(data, '2026-08-19', 'upper_b', 'user_selected', false, undefined, new Date('2026-08-18T12:00:00'));
    data.trainingPlanner = { ...plannedWednesday, dailyPlans: plannedWednesday.dailyPlans.map((plan) => plan.date === '2026-08-19' ? { ...plan, status: 'skipped' as const } : plan) };
    expect(plannerWarnings(data, '2026-08-20', 'lower_b', undefined, new Date('2026-08-20T12:00:00')).some((warning) => warning.code === 'consecutive_strength')).toBe(false);
  });

  it('moves and swaps future sessions, preserves user choices on recalculation, and restores recommendations', () => {
    const data = plannerData();
    const beforeTuesday = data.trainingPlanner.dailyPlans.find((plan) => plan.date === '2026-08-18')!;
    const beforeWednesday = data.trainingPlanner.dailyPlans.find((plan) => plan.date === '2026-08-19')!;
    data.trainingPlanner = moveTrainingSession(data, '2026-08-18', '2026-08-19', true, mondayNoon);
    expect(data.trainingPlanner.dailyPlans.find((plan) => plan.date === '2026-08-18')).toMatchObject({ selectedSessionTemplateId: beforeWednesday.selectedSessionTemplateId, selectionSource: 'user_swapped' });
    expect(data.trainingPlanner.dailyPlans.find((plan) => plan.date === '2026-08-19')).toMatchObject({ selectedSessionTemplateId: beforeTuesday.selectedSessionTemplateId, selectionSource: 'user_swapped' });

    data.trainingPlanner = recalculateTrainingWeek(data, monday, mondayNoon);
    expect(data.trainingPlanner.dailyPlans.find((plan) => plan.date === '2026-08-19')?.selectionSource).toBe('user_swapped');

    data.trainingPlanner = restoreRecommendedWeek(data, monday, mondayNoon);
    expect(data.trainingPlanner.dailyPlans.filter((plan) => weekDates(monday).includes(plan.date)).every((plan) => !plan.selectionSource.startsWith('user_'))).toBe(true);
  });

  it('surfaces an unfinished workout and counts only completed non-warm-up sets for fatigue and balance', () => {
    const data = plannerData();
    const unfinished = completedSession('active', monday, 'upper_a', 'bench-press');
    unfinished.completedAt = undefined;
    const emptyCompletion = completedSession('empty', '2026-08-18', 'lower_a', 'romanian-deadlift', 0);
    emptyCompletion.sets = [{ id: 'warmup', exerciseId: 'romanian-deadlift', setNumber: 1, weightKg: 20, reps: 5, completed: true, isWarmup: true }];
    data.sessions = [unfinished, emptyCompletion];

    expect(plannerWarnings(data, '2026-08-18', 'lower_b', undefined, new Date('2026-08-18T12:00:00')).some((warning) => warning.code === 'active_workout')).toBe(true);
    expect(sessionMuscleLoad(emptyCompletion).size).toBe(0);
    expect(weeklyBalance(data, '2026-08-18').strength).toBe(0);
  });

  it('uses logged RIR and readiness data as explainable recommendation inputs', () => {
    const data = plannerData();
    const hard = completedSession('hard', monday, 'upper_a', 'bench-press');
    const easy = completedSession('easy', monday, 'upper_a', 'bench-press');
    hard.sets = hard.sets.map((set) => ({ ...set, rir: 0 }));
    easy.sets = easy.sets.map((set) => ({ ...set, rir: 4 }));
    expect(sessionMuscleLoad(hard).get('Chest')).toBeGreaterThan(sessionMuscleLoad(easy).get('Chest') ?? 0);

    data.trainingPlanner = selectTrainingSession(data, monday, 'upper_a', 'user_selected', true, {
      energy: 1, muscleSoreness: 5, jointDiscomfort: 'significant', availableMinutes: 15, preferredIntensity: 'light', recordedAt: '2026-08-17T10:00:00.000Z',
    }, mondayNoon);
    const plan = data.trainingPlanner.dailyPlans.find((item) => item.date === monday)!;
    expect(plan.selectedSessionTemplateId).toBe('upper_a');
    expect(plan.recommendedSessionTemplateId).toBe('mobility_recovery');
    expect(plan.recommendationReason).toContain('significant joint discomfort');
  });

  it('preserves completed history across week rollover and handles Sunday-to-Monday boundaries', () => {
    const data = plannerData('2026-08-23', new Date('2026-08-23T12:00:00'));
    const sundaySession = completedSession('sun', '2026-08-23', 'upper_a', 'bench-press');
    data.sessions = [sundaySession];
    data.trainingPlanner = recalculateTrainingWeek(data, '2026-08-23', new Date('2026-08-23T12:00:00'));
    const historical = structuredClone(data.trainingPlanner.dailyPlans.find((plan) => plan.date === '2026-08-23'));

    data.trainingPlanner = recalculateTrainingWeek(data, '2026-08-24', new Date('2026-08-24T12:00:00'));

    expect(weekDates('2026-08-23').at(-1)).toBe('2026-08-23');
    expect(weekDates('2026-08-24')[0]).toBe('2026-08-24');
    expect(data.trainingPlanner.dailyPlans.find((plan) => plan.date === '2026-08-23')).toEqual(historical);
    expect(data.sessions[0]).toEqual(sundaySession);
    expect(data.trainingPlanner.dailyPlans.filter((plan) => weekDates('2026-08-24').includes(plan.date))).toHaveLength(7);
  });
});
