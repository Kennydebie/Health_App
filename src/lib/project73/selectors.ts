import { getIngredient } from '../../data/project73/ingredients';
import { builtinRecipes } from '../../data/project73/recipes';
import type { AppData } from '../../types/models';
import type { MealPlan, PlannedMeal, Recipe } from '../../types/project73';
import { getNutritionTotals } from '../selectors';
import { recommendTargets, type TargetRecommendation } from './metabolism';
import { dayTotals, type PlannerContext } from './mealPlanner';
import { assessProgress, type AdherenceSummary, type CoachAssessment } from './progressCoach';
import { mealNutrition } from './recipeMath';
import { addDays, dailyWeights, dayIndex, observedRate, smoothedTrend, weeklyAverages, weightProgress, type ObservedRate, type TrendPoint, type WeeklyAverage, type WeightProgress } from './weightTrend';

export function allRecipes(data: Pick<AppData, 'customRecipes'>): Recipe[] {
  return [...builtinRecipes, ...data.customRecipes];
}

export function recipeMapFor(data: Pick<AppData, 'customRecipes'>) {
  return new Map(allRecipes(data).map((recipe) => [recipe.id, recipe]));
}

export function activePlan(data: Pick<AppData, 'mealPlans'>): MealPlan | null {
  return [...data.mealPlans].filter((plan) => plan.status === 'active').sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
}

/** Meals for a date: the active plan wins; otherwise the most recent plan that covers the date. */
export function mealsOn(data: Pick<AppData, 'mealPlans'>, date: string): PlannedMeal[] {
  const plans = [...data.mealPlans].sort((a, b) => Number(b.status === 'active') - Number(a.status === 'active') || b.createdAt.localeCompare(a.createdAt));
  for (const plan of plans) {
    const meals = plan.meals.filter((meal) => meal.date === date);
    if (meals.length) return meals.sort((a, b) => a.order - b.order);
  }
  return [];
}

export function findMeal(data: Pick<AppData, 'mealPlans'>, mealId: string) {
  for (const plan of data.mealPlans) {
    const meal = plan.meals.find((item) => item.id === mealId);
    if (meal) return { plan, meal };
  }
  return null;
}

export function weightSeries(data: Pick<AppData, 'measurements'>) {
  const daily = dailyWeights(data.measurements);
  return { daily, trend: smoothedTrend(daily), weekly: weeklyAverages(daily) };
}

export function currentWeightKg(data: Pick<AppData, 'measurements'>, fallback = 85.5) {
  const { trend } = weightSeries(data);
  return trend.at(-1)?.trendKg ?? fallback;
}

export function targetRecommendation(data: AppData, today: string): TargetRecommendation {
  const weightKg = currentWeightKg(data);
  return recommendTargets({ sex: data.profile.sex, age: data.profile.age, heightCm: data.profile.heightCm, weightKg, goalWeightKg: data.profile.goalWeightKg }, data.metabolicSettings, today);
}

export function plannerContext(data: AppData, today: string): PlannerContext {
  const recentFrom = addDays(today, -21);
  return {
    recipes: allRecipes(data),
    lookup: getIngredient,
    preferences: data.planningPreferences,
    targets: { kcal: data.profile.calorieTarget, protein: data.profile.proteinTarget },
    favoriteRecipeIds: data.favoriteRecipeIds,
    pantryIngredientIds: data.pantry.filter((item) => item.amount > 0).map((item) => item.ingredientId),
    recentRecipeIds: data.mealPlans.filter((plan) => plan.status === 'archived').flatMap((plan) => plan.meals.filter((meal) => meal.date >= recentFrom).map((meal) => meal.recipeId)),
  };
}

export function plannedDayTotals(data: AppData, date: string) {
  return dayTotals(mealsOn(data, date), recipeMapFor(data), getIngredient);
}

/** Confirmed intake (food log, including meals marked "Gegeten"). Planned food is never counted here. */
export function actualDayTotals(data: AppData, date: string) {
  return getNutritionTotals(data, date);
}

export function mealDetails(data: Pick<AppData, 'customRecipes'>, meal: Pick<PlannedMeal, 'recipeId' | 'servings'>) {
  const recipe = recipeMapFor(data).get(meal.recipeId);
  if (!recipe) return null;
  return { recipe, nutrition: mealNutrition(recipe, meal.servings, getIngredient) };
}

export function plannedDaysAhead(data: AppData, today: string) {
  const dates = new Set<string>();
  const plan = activePlan(data);
  for (const meal of plan?.meals ?? []) if (meal.date >= today) dates.add(meal.date);
  return [...dates].sort();
}

export interface WeightOverview {
  trend: TrendPoint[];
  weekly: WeeklyAverage[];
  progress: WeightProgress;
  rate28: ObservedRate | null;
  forecastDate: string | null;
  forecastBasis: 'observed' | 'planned' | 'none';
  expectedKgPerWeek: number;
}

export function weightOverview(data: AppData, today: string): WeightOverview {
  const { trend, weekly } = weightSeries(data);
  const recommendation = targetRecommendation(data, today);
  const start = data.activeGoal.startingWeightKg ?? trend[0]?.weightKg ?? null;
  const progress = weightProgress(trend, start, data.profile.goalWeightKg, data.metabolicSettings.previousGoalWeightKg);
  const rate28 = observedRate(trend, 28, today);
  let forecastDate: string | null = null;
  let forecastBasis: WeightOverview['forecastBasis'] = 'none';
  if (progress.remainingKg <= 0 && progress.currentKg != null) {
    forecastDate = today;
    forecastBasis = 'observed';
  } else if (rate28?.reliable && rate28.kgPerWeek > 0.05) {
    forecastDate = addDays(today, Math.round((progress.remainingKg / rate28.kgPerWeek) * 7));
    forecastBasis = 'observed';
  } else if (recommendation.expectedKgPerWeek > 0.05) {
    forecastDate = recommendation.forecasts.target.date;
    forecastBasis = 'planned';
  }
  return { trend, weekly, progress, rate28, forecastDate, forecastBasis, expectedKgPerWeek: recommendation.expectedKgPerWeek };
}

export function adherenceSummary(data: AppData, today: string, windowDays = 21): AdherenceSummary {
  const from = addDays(today, -windowDays);
  const dates = Array.from({ length: windowDays }, (_, index) => addDays(from, index));
  const intakeDays = dates.map((date) => ({ date, totals: getNutritionTotals(data, date) })).filter((day) => day.totals.calories > 0);
  const meals = data.mealPlans.flatMap((plan) => plan.meals).filter((meal) => meal.date >= from && meal.date < today);
  const unique = new Map(meals.map((meal) => [meal.id, meal]));
  const list = [...unique.values()];
  return {
    daysWithIntake: intakeDays.length,
    windowDays,
    averageKcal: intakeDays.length ? intakeDays.reduce((sum, day) => sum + day.totals.calories, 0) / intakeDays.length : null,
    averageProtein: intakeDays.length ? intakeDays.reduce((sum, day) => sum + day.totals.protein, 0) / intakeDays.length : null,
    plannedMeals: list.length,
    eatenMeals: list.filter((meal) => meal.status === 'eaten').length,
    skippedOrReplaced: list.filter((meal) => meal.status === 'skipped' || meal.status === 'replaced').length,
  };
}

function strengthSessionsBetween(data: AppData, from: string, to: string) {
  return data.sessions.filter((session) => session.completedAt && session.date >= from && session.date < to).length;
}

export function progressAssessment(data: AppData, today: string): CoachAssessment {
  const overview = weightOverview(data, today);
  const lastChange = [...data.nutritionTargetHistory].sort((a, b) => b.date.localeCompare(a.date))[0];
  const daysSinceTargetChange = lastChange ? dayIndex(today) - dayIndex(lastChange.date) : null;
  return assessProgress({
    rate: overview.rate28,
    expectedKgPerWeek: overview.expectedKgPerWeek,
    desiredBand: data.metabolicSettings.desiredLossKgPerWeek,
    currentKg: overview.progress.currentKg,
    kcalTarget: data.profile.calorieTarget,
    proteinTarget: data.profile.proteinTarget,
    adherence: adherenceSummary(data, today),
    strengthSessionsLast4Weeks: strengthSessionsBetween(data, addDays(today, -28), addDays(today, 1)),
    strengthSessionsPrevious4Weeks: strengthSessionsBetween(data, addDays(today, -56), addDays(today, -28)),
    daysSinceTargetChange: daysSinceTargetChange != null && data.nutritionTargetHistory.length > 1 ? daysSinceTargetChange : null,
  });
}
