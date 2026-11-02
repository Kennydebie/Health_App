import type { AppData } from '../../types/models';
import type { Project73Data } from '../../types/project73';
import { createProject73Defaults, DEFAULT_PLANNING_PREFERENCES } from './defaults';
import { DEFAULT_METABOLIC_SETTINGS, recommendTargets } from './metabolism';
import { dailyWeights } from './weightTrend';

export const PROJECT73_DATA_VERSION = 13;
export const PROJECT73_GOAL_KG = 73;
const LEGACY_DEFAULT_TARGETS = { calorieTarget: 2100, proteinTarget: 170, carbTarget: 205, fatTarget: 67 };

type MaybeProject73 = Omit<AppData, keyof Project73Data> & Partial<Project73Data>;

/** Fills Project 73 fields on any data object without changing values the user already has. */
export function withProject73Fields(data: MaybeProject73): AppData {
  const defaults = createProject73Defaults();
  return {
    ...data,
    upgradeNotice: data.upgradeNotice ?? null,
    verifiedNutrition: data.verifiedNutrition && typeof data.verifiedNutrition === 'object' ? data.verifiedNutrition : {},
    metabolicSettings: { ...defaults.metabolicSettings, ...data.metabolicSettings, overrides: { ...DEFAULT_METABOLIC_SETTINGS.overrides, ...data.metabolicSettings?.overrides }, version: 1 },
    planningPreferences: { ...DEFAULT_PLANNING_PREFERENCES, ...data.planningPreferences, version: 1 },
    mealPlans: Array.isArray(data.mealPlans) ? data.mealPlans : [],
    customRecipes: Array.isArray(data.customRecipes) ? data.customRecipes : [],
    favoriteRecipeIds: Array.isArray(data.favoriteRecipeIds) ? data.favoriteRecipeIds : [],
    pantry: Array.isArray(data.pantry) ? data.pantry : [],
    shoppingStatus: data.shoppingStatus ?? null,
  };
}

function latestWeight(data: Pick<AppData, 'measurements'>) {
  return dailyWeights(data.measurements).at(-1)?.weightKg ?? null;
}

/**
 * One-time upgrade from the Project 75 data model (v12) to Project 73 (v13).
 * - Goal 75 kg becomes 73 kg; 75 kg is kept as a milestone.
 * - Age 29 (the old default) becomes 30.
 * - Calorie/macro targets are only replaced when they are still the untouched Project 75 defaults;
 *   otherwise the user keeps their values and the new suggestion is offered for review.
 * - No history (weights, food logs, workouts, photos) is changed.
 */
export function upgradeToProject73(input: MaybeProject73, today: string): AppData {
  const data = withProject73Fields(input);
  if (input.version >= PROJECT73_DATA_VERSION) return { ...data, version: Math.max(input.version, PROJECT73_DATA_VERSION) };
  const changes: string[] = [];
  const profile = { ...data.profile };
  if (profile.goalWeightKg === 75) {
    profile.goalWeightKg = PROJECT73_GOAL_KG;
    changes.push('Je streefgewicht is aangepast van 75 kg naar 73 kg. 75 kg blijft zichtbaar als tussendoel.');
  }
  if (profile.age === 29) {
    profile.age = 30;
    changes.push('Je leeftijd is bijgewerkt naar 30 jaar.');
  }
  const metabolicSettings = { ...data.metabolicSettings, previousGoalWeightKg: data.profile.goalWeightKg === 75 ? 75 : data.metabolicSettings.previousGoalWeightKg, updatedAt: new Date().toISOString() };
  const weightKg = latestWeight(data) ?? 85.5;
  const recommendation = recommendTargets({ sex: profile.sex, age: profile.age, heightCm: profile.heightCm, weightKg, goalWeightKg: profile.goalWeightKg }, metabolicSettings, today);
  const untouched = profile.calorieTarget === LEGACY_DEFAULT_TARGETS.calorieTarget && profile.proteinTarget === LEGACY_DEFAULT_TARGETS.proteinTarget
    && profile.carbTarget === LEGACY_DEFAULT_TARGETS.carbTarget && profile.fatTarget === LEGACY_DEFAULT_TARGETS.fatTarget;
  let pendingTargets: NonNullable<Project73Data['upgradeNotice']>['pendingTargets'] = null;
  const suggestion = { kcal: recommendation.suggested.kcal, protein: recommendation.suggested.protein, carbs: recommendation.suggested.carbs, fat: recommendation.suggested.fat };
  if (untouched) {
    profile.calorieTarget = suggestion.kcal;
    profile.proteinTarget = suggestion.protein;
    profile.carbTarget = suggestion.carbs;
    profile.fatTarget = suggestion.fat;
    changes.push(`Je dagdoelen zijn herberekend: ${suggestion.kcal} kcal en ${suggestion.protein} g eiwit.`);
  } else {
    // The user's own targets become explicit overrides so recalculation never silently replaces them.
    metabolicSettings.overrides = { ...metabolicSettings.overrides, kcal: profile.calorieTarget, protein: profile.proteinTarget, carbs: profile.carbTarget, fat: profile.fatTarget };
  }
  if (!untouched && (profile.calorieTarget !== suggestion.kcal || profile.proteinTarget !== suggestion.protein)) {
    pendingTargets = suggestion;
    changes.push(`Je eigen doelen (${profile.calorieTarget} kcal, ${profile.proteinTarget} g eiwit) zijn bewaard. Er staat een nieuwe suggestie voor je klaar.`);
  }
  const activeGoal = data.activeGoal.targetWeightKg === 75
    ? { ...data.activeGoal, name: 'Project 73', targetWeightKg: PROJECT73_GOAL_KG, targetRangeKg: [72.5, 73.5] as [number, number] }
    : data.activeGoal;
  const hadHistory = data.measurements.length + data.foodLog.length + data.sessions.length > 0;
  if (hadHistory) changes.push('Al je metingen, voedingslogs, trainingen en foto’s zijn behouden.');
  return {
    ...data,
    version: PROJECT73_DATA_VERSION,
    profile,
    activeGoal,
    metabolicSettings,
    upgradeNotice: changes.length && input.version > 0 && hadHistory
      ? { fromVersion: input.version, at: new Date().toISOString(), changes, pendingTargets, dismissed: false }
      : null,
  };
}
