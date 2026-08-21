import { describe, expect, it } from 'vitest';
import type { Macros, UserProfile } from '../types/models';
import {
  DEFAULT_NUTRITION_SETTINGS,
  dateKeyInTimezone,
  evaluateNutritionDay,
  nutritionTargetFromProfile,
  targetSnapshotForDate,
} from './nutritionEvaluation';

const profile = {
  calorieTarget: 2100, proteinTarget: 170, carbTarget: 205, fatTarget: 67,
} as UserProfile;
const target = nutritionTargetFromProfile(profile, '2026-08-20', 'Europe/Amsterdam');
const completed = (totals: Macros, date = '2026-08-20') => evaluateNutritionDay({ date, today: '2026-08-21', totals, target: { ...target, date }, settings: DEFAULT_NUTRITION_SETTINGS });

describe('daily nutrition evaluation', () => {
  it('marks a completed day on target only when every required goal is green', () => {
    const result = completed({ calories: 2080, protein: 164, carbs: 200, fat: 65 });
    expect(result.overall).toBe('on_target');
    expect([result.calories, result.protein, result.carbohydrates, result.fat]).toEqual(['on_target', 'on_target', 'on_target', 'on_target']);
  });

  it('marks calories above 115% as over', () => {
    expect(completed({ calories: 2560, protein: 180, carbs: 220, fat: 70 }).overall).toBe('over');
  });

  it('marks calories below 80% as under', () => {
    expect(completed({ calories: 1500, protein: 160, carbs: 180, fat: 60 }).overall).toBe('under');
  });

  it('marks sufficient calories with insufficient protein as under', () => {
    const result = completed({ calories: 2050, protein: 110, carbs: 205, fat: 67 });
    expect(result.calories).toBe('on_target');
    expect(result.protein).toBe('under');
    expect(result.overall).toBe('under');
  });

  it('marks a completed amber day close to target', () => {
    expect(completed({ calories: 1800, protein: 145, carbs: 180, fat: 58 }).overall).toBe('close');
  });

  it('keeps breakfast today in progress instead of under target', () => {
    const result = evaluateNutritionDay({ date: '2026-08-21', today: '2026-08-21', totals: { calories: 450, protein: 35, carbs: 45, fat: 14 }, target, settings: DEFAULT_NUTRITION_SETTINGS });
    expect(result.overall).toBe('in_progress');
    expect(result.protein).toBe('in_progress');
  });

  it('warns immediately when today is already over a maximum', () => {
    const result = evaluateNutritionDay({ date: '2026-08-21', today: '2026-08-21', totals: { calories: 2500, protein: 180, carbs: 210, fat: 68 }, target, settings: DEFAULT_NUTRITION_SETTINGS });
    expect(result.overall).toBe('over');
    expect(result.calories).toBe('over');
  });

  it('keeps a past day with no data grey and uncounted', () => {
    const result = completed({ calories: 0, protein: 0, carbs: 0, fat: 0 });
    expect(result.overall).toBe('no_data');
    expect(result.counted).toBe(false);
  });

  it('does not count future days in consistency', () => {
    const result = evaluateNutritionDay({ date: '2026-08-22', today: '2026-08-21', totals: { calories: 0, protein: 0, carbs: 0, fat: 0 }, target, settings: DEFAULT_NUTRITION_SETTINGS });
    expect(result.complete).toBe(false);
    expect(result.counted).toBe(false);
  });

  it('recalculates immediately when totals change more than once', () => {
    expect(completed({ calories: 900, protein: 60, carbs: 80, fat: 25 }).overall).toBe('under');
    expect(completed({ calories: 1820, protein: 140, carbs: 175, fat: 56 }).overall).toBe('close');
    expect(completed({ calories: 2050, protein: 165, carbs: 200, fat: 66 }).overall).toBe('on_target');
  });

  it('keeps historical target snapshots after current targets change', () => {
    const history = [target, nutritionTargetFromProfile({ ...profile, calorieTarget: 1950 } as UserProfile, '2026-08-21', 'Europe/Amsterdam')];
    expect(targetSnapshotForDate(history, profile, '2026-08-20').caloriesKcal).toBe(2100);
    expect(targetSnapshotForDate(history, profile, '2026-08-22').caloriesKcal).toBe(1950);
  });

  it('uses the requested timezone when midnight changes the local date', () => {
    const instant = new Date('2026-08-21T22:30:00Z');
    expect(dateKeyInTimezone(instant, 'Europe/Amsterdam')).toBe('2026-08-22');
    expect(dateKeyInTimezone(instant, 'America/New_York')).toBe('2026-08-21');
  });
});
