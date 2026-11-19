import { getIngredient } from '../../data/project73/ingredients';
import type { AppData, FoodLogEntry, MealType, UserProfile } from '../../types/models';
import type { MealPlan, MealSlot, MetabolicSettings, PantryItem, PlannedMeal, PlanningPreferences, Recipe, ShoppingStatusSummary } from '../../types/project73';
import type { ShoppingItem, ShoppingPlan } from '../../types/shopping';
import { detectedTimezone, nutritionTargetFromProfile, upsertTargetSnapshot } from '../nutritionEvaluation';
import { generateMealPlan, regenerateDay, replaceMeal, updateMeal } from './mealPlanner';
import { scaleTotals } from './recipeMath';
import { findMeal, mealDetails, plannerContext, targetRecommendation } from './selectors';

type Transform = (data: AppData) => AppData;

const SLOT_TO_MEAL: Record<MealSlot, MealType> = { breakfast: 'breakfast', lunch: 'lunch', dinner: 'dinner', snack: 'snacks' };

function nowIso() {
  return new Date().toISOString();
}

function randomSeed() {
  return Math.floor(Math.random() * 2 ** 31);
}

function withPlan(data: AppData, plan: MealPlan): AppData {
  return { ...data, mealPlans: data.mealPlans.map((item) => item.id === plan.id ? plan : item) };
}

/** Writes profile targets (and the dated target snapshot) when they differ from the current ones. */
export function applyTargetsToProfile(data: AppData, targets: { kcal: number; protein: number; carbs: number; fat: number }, today: string): AppData {
  const profile: UserProfile = { ...data.profile, calorieTarget: targets.kcal, proteinTarget: targets.protein, carbTarget: targets.carbs, fatTarget: targets.fat };
  const changed = profile.calorieTarget !== data.profile.calorieTarget || profile.proteinTarget !== data.profile.proteinTarget
    || profile.carbTarget !== data.profile.carbTarget || profile.fatTarget !== data.profile.fatTarget;
  if (!changed) return data;
  return { ...data, profile, nutritionTargetHistory: upsertTargetSnapshot(data.nutritionTargetHistory, nutritionTargetFromProfile(profile, today, detectedTimezone())) };
}

/** Recalculates the active targets from the profile, latest weight and overrides. */
export function recalculateTargets(today: string): Transform {
  return (data) => {
    const recommendation = targetRecommendation(data, today);
    return applyTargetsToProfile(data, recommendation.active, today);
  };
}

export function updateProfileAndRecalculate(changes: Partial<UserProfile>, today: string): Transform {
  return (data) => recalculateTargets(today)({ ...data, profile: { ...data.profile, ...changes } });
}

export function updateMetabolicSettings(changes: Partial<MetabolicSettings>, today: string): Transform {
  return (data) => recalculateTargets(today)({ ...data, metabolicSettings: { ...data.metabolicSettings, ...changes, overrides: { ...data.metabolicSettings.overrides, ...changes.overrides }, updatedAt: nowIso() } });
}

export function acceptSuggestedTargets(today: string): Transform {
  return (data) => {
    const cleared = { ...data, metabolicSettings: { ...data.metabolicSettings, overrides: { kcal: null, protein: null, carbs: null, fat: null, fiber: null }, updatedAt: nowIso() } };
    const next = recalculateTargets(today)(cleared);
    return { ...next, upgradeNotice: next.upgradeNotice ? { ...next.upgradeNotice, pendingTargets: null } : null };
  };
}

export function dismissUpgradeNotice(): Transform {
  return (data) => ({ ...data, upgradeNotice: data.upgradeNotice ? { ...data.upgradeNotice, dismissed: true, pendingTargets: null } : null });
}

export function updatePlanningPreferences(changes: Partial<PlanningPreferences>): Transform {
  return (data) => ({ ...data, planningPreferences: { ...data.planningPreferences, ...changes, version: 1 } });
}

/**
 * Creates a new plan from `startDate`. Meals of an earlier active plan in that range that were
 * already eaten, skipped or locked are carried over; the earlier plan is archived (kept for history).
 */
export function createPlan(startDate: string, days: number, today: string, seed = randomSeed()): Transform {
  return (data) => {
    const previous = data.mealPlans.filter((plan) => plan.status === 'active');
    const endDate = new Date(new Date(`${startDate}T12:00:00Z`).getTime() + (days - 1) * 86_400_000).toISOString().slice(0, 10);
    const keepMeals = previous.flatMap((plan) => plan.meals).filter((meal) => meal.date >= startDate && meal.date <= endDate && (meal.status !== 'planned' || meal.locked));
    const plan = generateMealPlan({ startDate, days, seed, keepMeals }, plannerContext(data, today));
    const keptIds = new Set(keepMeals.map((meal) => meal.id));
    return {
      ...data,
      mealPlans: [
        ...data.mealPlans.map((item) => item.status === 'active'
          ? { ...item, status: 'archived' as const, updatedAt: nowIso(), meals: item.meals.filter((meal) => !keptIds.has(meal.id)) }
          : item),
        plan,
      ].slice(-40),
    };
  };
}

export function regeneratePlanDay(planId: string, date: string, today: string): Transform {
  return (data) => {
    const plan = data.mealPlans.find((item) => item.id === planId);
    return plan ? withPlan(data, regenerateDay(plan, date, plannerContext(data, today), randomSeed())) : data;
  };
}

export function replacePlannedMeal(mealId: string, today: string, recipeId?: string): Transform {
  return (data) => {
    const found = findMeal(data, mealId);
    if (!found || found.meal.status !== 'planned') return data;
    return withPlan(data, replaceMeal(found.plan, mealId, plannerContext(data, today), randomSeed(), recipeId));
  };
}

export function toggleMealLock(mealId: string): Transform {
  return (data) => {
    const found = findMeal(data, mealId);
    return found ? withPlan(data, updateMeal(found.plan, mealId, { locked: !found.meal.locked })) : data;
  };
}

export function setMealServings(mealId: string, servings: number): Transform {
  return (data) => {
    const found = findMeal(data, mealId);
    if (!found || found.meal.status !== 'planned') return data;
    const value = Math.max(0.25, Math.min(3, Math.round(servings * 20) / 20));
    return withPlan(data, updateMeal(found.plan, mealId, { servings: value }));
  };
}

export function toggleFavoriteRecipe(recipeId: string): Transform {
  return (data) => ({
    ...data,
    favoriteRecipeIds: data.favoriteRecipeIds.includes(recipeId) ? data.favoriteRecipeIds.filter((id) => id !== recipeId) : [...data.favoriteRecipeIds, recipeId],
  });
}

function removeFoodLog(data: AppData, id?: string): AppData {
  return id ? { ...data, foodLog: data.foodLog.filter((entry) => entry.id !== id) } : data;
}

/**
 * Records a planned meal as eaten. The actual intake is written to the food log (with the factor
 * the user ate) so planned and confirmed intake stay separate.
 */
export function markMealEaten(mealId: string, factor = 1): Transform {
  return (data) => {
    const found = findMeal(data, mealId);
    if (!found) return data;
    const details = mealDetails(data, found.meal);
    if (!details) return data;
    const base = removeFoodLog(data, found.meal.consumedFoodLogId);
    const eaten = scaleTotals(details.nutrition.totals, factor);
    const grams = Math.max(1, details.nutrition.totalGrams * factor);
    const per100 = { calories: (eaten.kcal / grams) * 100, protein: (eaten.protein / grams) * 100, carbs: (eaten.carbs / grams) * 100, fat: (eaten.fat / grams) * 100 };
    const now = nowIso();
    const entry: FoodLogEntry = {
      id: `food_plan_${mealId}_${Date.now().toString(36)}`,
      foodId: `recipe:${details.recipe.id}`,
      date: found.meal.date,
      meal: SLOT_TO_MEAL[found.meal.slot],
      servingId: 'planned_meal',
      quantity: factor,
      createdAt: now,
      snapshot: {
        foodName: details.recipe.name,
        image: details.recipe.image ?? '',
        unit: 'g',
        amount: Math.round(grams),
        servingLabel: factor === 1 ? 'Geplande portie' : `${factor.toLocaleString('nl-NL')} × geplande portie`,
        per100,
        calculated: { calories: eaten.kcal, protein: eaten.protein, carbs: eaten.carbs, fat: eaten.fat },
        source: { provider: 'custom', providerName: details.nutrition.hasEstimates ? 'Project 73 maaltijdplan (deels geschat)' : 'Project 73 maaltijdplan', externalId: mealId, retrievedAt: now },
      },
    };
    const plan = updateMeal(found.plan, mealId, { status: 'eaten', eatenFactor: factor, eatenAt: now, consumedFoodLogId: entry.id, replacementNote: undefined });
    return { ...withPlan(base, plan), foodLog: [...base.foodLog, entry] };
  };
}

export function markMealSkipped(mealId: string): Transform {
  return (data) => {
    const found = findMeal(data, mealId);
    if (!found) return data;
    const base = removeFoodLog(data, found.meal.consumedFoodLogId);
    return withPlan(base, updateMeal(found.plan, mealId, { status: 'skipped', eatenFactor: 0, consumedFoodLogId: undefined, eatenAt: nowIso() }));
  };
}

/** "Iets anders gegeten": optional rough estimate is logged as such; nothing is invented. */
export function markMealReplaced(mealId: string, note: string, estimate?: { kcal: number; protein: number }): Transform {
  return (data) => {
    const found = findMeal(data, mealId);
    if (!found) return data;
    const base = removeFoodLog(data, found.meal.consumedFoodLogId);
    const now = nowIso();
    let entry: FoodLogEntry | null = null;
    if (estimate && estimate.kcal > 0) {
      entry = {
        id: `food_replaced_${mealId}_${Date.now().toString(36)}`,
        foodId: 'custom:replaced_meal',
        date: found.meal.date,
        meal: SLOT_TO_MEAL[found.meal.slot],
        servingId: 'estimate',
        quantity: 1,
        createdAt: now,
        snapshot: {
          foodName: note.trim() ? `Iets anders: ${note.trim().slice(0, 60)}` : 'Iets anders gegeten',
          image: '', unit: 'g', amount: 100, servingLabel: 'Eigen schatting',
          per100: { calories: estimate.kcal, protein: estimate.protein, carbs: 0, fat: 0 },
          calculated: { calories: estimate.kcal, protein: estimate.protein, carbs: 0, fat: 0 },
          source: { provider: 'custom', providerName: 'Eigen schatting', externalId: mealId, retrievedAt: now },
        },
      };
    }
    const plan = updateMeal(found.plan, mealId, { status: 'replaced', replacementNote: note.slice(0, 120), consumedFoodLogId: entry?.id, eatenAt: now });
    return { ...withPlan(base, plan), foodLog: entry ? [...base.foodLog, entry] : base.foodLog };
  };
}

export function resetMealStatus(mealId: string): Transform {
  return (data) => {
    const found = findMeal(data, mealId);
    if (!found) return data;
    const base = removeFoodLog(data, found.meal.consumedFoodLogId);
    return withPlan(base, updateMeal(found.plan, mealId, { status: 'planned', eatenFactor: undefined, eatenAt: undefined, consumedFoodLogId: undefined, replacementNote: undefined }));
  };
}

/** Copies a recipe used in an earlier plan into a day of the active plan ("hergebruik"). */
export function reuseRecipe(recipeId: string, date: string, slot: MealSlot, today: string): Transform {
  return (data) => {
    const plan = data.mealPlans.find((item) => item.status === 'active' && item.meals.some((meal) => meal.date === date));
    if (!plan) return data;
    const existing = slot === 'snack' ? undefined : plan.meals.find((meal) => meal.date === date && meal.slot === slot && meal.status === 'planned');
    if (existing) return replacePlannedMeal(existing.id, today, recipeId)(data);
    const meal: PlannedMeal = { id: `meal_${Date.now().toString(36)}`, date, slot, order: slot === 'snack' ? 4 : ['breakfast', 'lunch', 'dinner'].indexOf(slot), recipeId, servings: 1, locked: false, status: 'planned', updatedAt: nowIso() };
    return withPlan(data, { ...plan, updatedAt: nowIso(), meals: [...plan.meals, meal] });
  };
}

export function upsertPantryItem(ingredientId: string, amount: number, unit: PantryItem['unit']): Transform {
  return (data) => {
    const existing = data.pantry.find((item) => item.ingredientId === ingredientId);
    const now = nowIso();
    if (amount <= 0) return { ...data, pantry: data.pantry.filter((item) => item.ingredientId !== ingredientId) };
    const item: PantryItem = existing ? { ...existing, amount, unit, updatedAt: now } : { id: `pantry_${ingredientId}`, ingredientId, amount, unit, updatedAt: now };
    return { ...data, pantry: existing ? data.pantry.map((entry) => entry.id === existing.id ? item : entry) : [...data.pantry, item] };
  };
}

/** After shopping, surplus that keeps (non-perishable) can be added to the pantry. */
export function addSurplusToPantry(items: ShoppingItem[]): Transform {
  return (data) => items.reduce((current, item) => {
    if (item.surplusAmount <= 0) return current;
    const ingredient = getIngredient(item.ingredientId);
    if (!ingredient) return current;
    const existing = current.pantry.find((entry) => entry.ingredientId === item.ingredientId)?.amount ?? 0;
    return upsertPantryItem(item.ingredientId, Math.round(existing + item.surplusAmount), ingredient.unit)(current);
  }, data);
}

/** Stores complete Picnic nutrition labels so planning and logging use verified values. */
export function recordVerifiedNutrition(plan: ShoppingPlan): Transform {
  return (data) => {
    if (plan.source !== 'picnic') return data;
    const next = { ...data.verifiedNutrition };
    for (const item of plan.items) {
      const product = item.lines[0]?.product;
      if (item.nutritionPer100 && product) next[item.ingredientId] = { per100: item.nutritionPer100, productId: product.productId, productName: product.name, retrievedAt: plan.createdAt };
    }
    return { ...data, verifiedNutrition: next };
  };
}

export function setShoppingStatus(status: ShoppingStatusSummary | null): Transform {
  return (data) => ({ ...data, shoppingStatus: status });
}

export function addCustomRecipe(recipe: Recipe): Transform {
  return (data) => ({ ...data, customRecipes: [...data.customRecipes.filter((item) => item.id !== recipe.id), { ...recipe, createdAt: recipe.createdAt ?? nowIso() }] });
}
