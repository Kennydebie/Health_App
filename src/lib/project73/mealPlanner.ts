import type { MealPlan, MealSlot, PlannedMeal, PlanningPreferences, Recipe } from '../../types/project73';
import { addTotals, mealNutrition, type IngredientLookup, type NutritionOverrides } from './recipeMath';
import type { NutritionTotals } from '../../types/project73';
import { addDays } from './weightTrend';

export const MAIN_SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner'];
export const SLOT_ORDER: Record<MealSlot, number> = { breakfast: 0, lunch: 1, dinner: 2, snack: 3 };
export const SLOT_LABELS: Record<MealSlot, string> = { breakfast: 'Ontbijt', lunch: 'Lunch', dinner: 'Avondeten', snack: 'Tussendoor' };

const MIN_SCALE = 0.75;
const MAX_SCALE = 1.6;

export interface PlannerTargets { kcal: number; protein: number }

export interface PlannerContext {
  recipes: Recipe[];
  lookup: IngredientLookup;
  preferences: Pick<PlanningPreferences, 'allergens' | 'dietaryRestrictions' | 'dislikedIngredientIds' | 'maxPrepMinutes' | 'snacksPerDay' | 'allowLeftovers'>;
  targets: PlannerTargets;
  favoriteRecipeIds?: string[];
  pantryIngredientIds?: string[];
  /** Recipes eaten recently (previous plans), used to keep variety across weeks. */
  recentRecipeIds?: string[];
  overrides?: NutritionOverrides;
}

/** Deterministic pseudo-random generator so a plan can be reproduced from its seed. */
export function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

let idCounter = 0;
export function mealId() {
  idCounter = (idCounter + 1) % 1_000_000;
  return `meal_${Date.now().toString(36)}_${idCounter.toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

/** Recipes compatible with allergens, restrictions, dislikes and the prep-time limit. */
export function eligibleRecipes(context: Pick<PlannerContext, 'recipes' | 'lookup' | 'preferences'>, slot?: MealSlot) {
  const { allergens, dietaryRestrictions, dislikedIngredientIds, maxPrepMinutes } = context.preferences;
  return context.recipes.filter((recipe) => {
    if (slot && !recipe.slots.includes(slot)) return false;
    if (recipe.prepMinutes > maxPrepMinutes) return false;
    return recipe.ingredients.every((item) => {
      const ingredient = context.lookup(item.ingredientId);
      if (!ingredient) return false;
      if (dislikedIngredientIds.includes(ingredient.id)) return Boolean(item.optional);
      if (ingredient.allergens.some((allergen) => allergens.includes(allergen))) return false;
      if (ingredient.diet.some((tag) => dietaryRestrictions.includes(tag))) return false;
      return true;
    });
  });
}

export function recipeIngredientIds(recipe: Recipe, lookup: IngredientLookup) {
  return recipe.ingredients.map((item) => item.ingredientId).filter((id) => !lookup(id)?.staple);
}

export function mealTotals(meal: Pick<PlannedMeal, 'recipeId' | 'servings'>, recipes: Map<string, Recipe>, lookup: IngredientLookup, overrides?: NutritionOverrides): NutritionTotals {
  const recipe = recipes.get(meal.recipeId);
  if (!recipe) return { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, fruitVegGrams: 0 };
  return mealNutrition(recipe, meal.servings, lookup, overrides).totals;
}

export function dayTotals(meals: PlannedMeal[], recipes: Map<string, Recipe>, lookup: IngredientLookup, overrides?: NutritionOverrides) {
  return addTotals(meals.map((meal) => mealTotals(meal, recipes, lookup, overrides)));
}

interface ScoreState {
  usedRecipeCounts: Map<string, number>;
  usedIngredients: Set<string>;
  /** Main protein sources already on the current day (eggs, meat, fish). */
  dayProteins: Set<string>;
  random: () => number;
}

const PROTEIN_CATEGORIES = new Set(['vlees_vis', 'eieren']);

export function proteinSources(recipe: Recipe, lookup: IngredientLookup) {
  return recipe.ingredients.map((item) => lookup(item.ingredientId)).filter((ingredient) => ingredient && PROTEIN_CATEGORIES.has(ingredient.category)).map((ingredient) => ingredient!.id);
}

function scoreRecipe(recipe: Recipe, slot: MealSlot, context: PlannerContext, state: ScoreState) {
  const ingredientsInRecipe = recipeIngredientIds(recipe, context.lookup);
  const reused = ingredientsInRecipe.filter((id) => state.usedIngredients.has(id)).length;
  const fresh = ingredientsInRecipe.length - reused;
  const pantryHits = ingredientsInRecipe.filter((id) => context.pantryIngredientIds?.includes(id)).length;
  const used = state.usedRecipeCounts.get(recipe.id) ?? 0;
  const nutrition = mealNutrition(recipe, 1, context.lookup, context.overrides).totals;
  const proteinDensity = nutrition.kcal > 0 ? (nutrition.protein / nutrition.kcal) * 100 : 0;
  const repeatPenalty = slot === 'breakfast' ? 0.35 : slot === 'snack' ? 0.25 : 0.95;
  const sameDayProtein = proteinSources(recipe, context.lookup).filter((id) => state.dayProteins.has(id)).length;
  return state.random() * 0.35
    - sameDayProtein * 0.45
    + (context.favoriteRecipeIds?.includes(recipe.id) ? 0.35 : 0)
    + Math.min(reused, 4) * 0.22
    - fresh * 0.08
    + pantryHits * 0.2
    - used * repeatPenalty
    - (context.recentRecipeIds?.includes(recipe.id) ? 0.12 : 0)
    + Math.min(proteinDensity, 12) * 0.012
    + ((context.preferences.maxPrepMinutes - recipe.prepMinutes) / Math.max(1, context.preferences.maxPrepMinutes)) * 0.2;
}

function pickRecipe(slot: MealSlot, context: PlannerContext, state: ScoreState, exclude: string[] = []) {
  const options = eligibleRecipes(context, slot).filter((recipe) => !exclude.includes(recipe.id));
  if (!options.length) return null;
  return options
    .map((recipe) => ({ recipe, score: scoreRecipe(recipe, slot, context, state) }))
    .sort((a, b) => b.score - a.score)[0].recipe;
}

function registerRecipe(recipe: Recipe, context: PlannerContext, state: ScoreState) {
  state.usedRecipeCounts.set(recipe.id, (state.usedRecipeCounts.get(recipe.id) ?? 0) + 1);
  for (const id of recipeIngredientIds(recipe, context.lookup)) state.usedIngredients.add(id);
  for (const id of proteinSources(recipe, context.lookup)) state.dayProteins.add(id);
}

function newMeal(date: string, slot: MealSlot, recipeId: string, order: number, extra: Partial<PlannedMeal> = {}): PlannedMeal {
  return { id: mealId(), date, slot, order, recipeId, servings: 1, locked: false, status: 'planned', updatedAt: new Date().toISOString(), ...extra };
}

/**
 * Chooses snacks and portion sizes for one day. Main meals that are not locked are scaled together
 * so the day lands on the calorie target; snack combinations are searched exhaustively to close the
 * protein gap. All numbers come from ingredient data.
 */
export function balanceDay(meals: PlannedMeal[], date: string, context: PlannerContext, state: ScoreState): PlannedMeal[] {
  const recipes = new Map(context.recipes.map((recipe) => [recipe.id, recipe]));
  const fixedMains = meals.filter((meal) => meal.slot !== 'snack' && (meal.locked || meal.status !== 'planned' || meal.leftoverOfMealId));
  const flexMains = meals.filter((meal) => meal.slot !== 'snack' && !fixedMains.includes(meal));
  const lockedSnacks = meals.filter((meal) => meal.slot === 'snack' && (meal.locked || meal.status !== 'planned'));
  const snackSlotsFree = Math.max(0, context.preferences.snacksPerDay - lockedSnacks.length);
  const snackOptions = eligibleRecipes(context, 'snack');
  const combos: Recipe[][] = [[]];
  if (snackSlotsFree >= 1) for (const a of snackOptions) combos.push([a]);
  if (snackSlotsFree >= 2) for (let i = 0; i < snackOptions.length; i += 1) for (let j = i + 1; j < snackOptions.length; j += 1) combos.push([snackOptions[i], snackOptions[j]]);

  const fixedTotals = dayTotals([...fixedMains, ...lockedSnacks], recipes, context.lookup, context.overrides);
  const flexBase = dayTotals(flexMains.map((meal) => ({ ...meal, servings: 1 })), recipes, context.lookup, context.overrides);

  const mainProteins = new Set([...fixedMains, ...flexMains].flatMap((meal) => {
    const recipe = recipes.get(meal.recipeId);
    return recipe ? proteinSources(recipe, context.lookup) : [];
  }));
  const objective = (totals: NutritionTotals, combo: Recipe[]) => {
    const repeat = combo.reduce((sum, recipe) => sum + (state.usedRecipeCounts.get(recipe.id) ?? 0), 0)
      + combo.reduce((sum, recipe) => sum + proteinSources(recipe, context.lookup).filter((id) => mainProteins.has(id)).length, 0) * 2;
    return Math.abs(totals.kcal - context.targets.kcal) / context.targets.kcal
      + Math.max(0, context.targets.protein - totals.protein) / context.targets.protein * 2.5
      + Math.max(0, totals.protein - context.targets.protein * 1.12) / context.targets.protein * 0.9
      + (totals.fruitVegGrams < 400 ? (400 - totals.fruitVegGrams) / 400 * 0.08 : 0)
      + repeat * 0.02
      + (combo.length < snackSlotsFree ? 0.01 : 0);
  };

  // Fast linear estimate per snack combination, then exact evaluation (with kitchen rounding) of the best few.
  const estimates = combos.map((combo) => {
    const snackTotals = addTotals(combo.map((recipe) => mealNutrition(recipe, 1, context.lookup, context.overrides).totals));
    const remaining = context.targets.kcal - fixedTotals.kcal - snackTotals.kcal;
    const scale = flexBase.kcal > 0 ? Math.max(MIN_SCALE, Math.min(MAX_SCALE, remaining / flexBase.kcal)) : 1;
    const estimate = addTotals([fixedTotals, snackTotals, { ...flexBase, kcal: flexBase.kcal * scale, protein: flexBase.protein * scale, fruitVegGrams: flexBase.fruitVegGrams * scale }]);
    return { combo, scale, score: objective(estimate, combo) + state.random() * 0.004 };
  }).sort((a, b) => a.score - b.score).slice(0, 8);

  const roundScale = (value: number) => Math.max(MIN_SCALE, Math.min(MAX_SCALE, Math.round(value * 20) / 20));
  let best: { combo: Recipe[]; scale: number; score: number } | null = null;
  for (const estimate of estimates) {
    const scales = new Set([-0.1, -0.05, 0, 0.05, 0.1].map((delta) => roundScale(estimate.scale + delta)));
    for (const scale of scales) {
      const trial = [
        ...fixedMains,
        ...lockedSnacks,
        ...flexMains.map((meal) => ({ ...meal, servings: scale })),
        ...estimate.combo.map((recipe) => ({ recipeId: recipe.id, servings: 1 }) as PlannedMeal),
      ];
      const score = objective(dayTotals(trial, recipes, context.lookup, context.overrides), estimate.combo);
      if (!best || score < best.score) best = { combo: estimate.combo, scale, score };
    }
  }
  const chosen = best ?? { combo: [], scale: 1, score: 0 };
  const result: PlannedMeal[] = [
    ...fixedMains,
    ...flexMains.map((meal) => ({ ...meal, servings: chosen.scale })),
    ...lockedSnacks,
    ...chosen.combo.map((recipe, index) => {
      registerRecipe(recipe, context, state);
      return newMeal(date, 'snack', recipe.id, SLOT_ORDER.snack + lockedSnacks.length + index);
    }),
  ];
  // Leftovers follow the portion of the meal they were cooked with.
  return result.map((meal) => {
    if (!meal.leftoverOfMealId || meal.locked) return meal;
    const source = result.find((item) => item.id === meal.leftoverOfMealId);
    return source ? { ...meal, servings: source.servings } : meal;
  }).sort((a, b) => a.order - b.order);
}

export interface GeneratePlanInput {
  startDate: string;
  days: number;
  seed: number;
  /** Meals to keep as they are (locked or already eaten). */
  keepMeals?: PlannedMeal[];
}

export function generateMealPlan(input: GeneratePlanInput, context: PlannerContext): MealPlan {
  const random = seededRandom(input.seed);
  const state: ScoreState = { usedRecipeCounts: new Map(), usedIngredients: new Set(), dayProteins: new Set(), random };
  const recipes = new Map(context.recipes.map((recipe) => [recipe.id, recipe]));
  const keep = input.keepMeals ?? [];
  for (const meal of keep) {
    const recipe = recipes.get(meal.recipeId);
    if (recipe) registerRecipe(recipe, context, state);
  }
  const meals: PlannedMeal[] = [];
  let previousDinner: PlannedMeal | null = null;
  let previousLunchWasLeftover = false;
  for (let day = 0; day < input.days; day += 1) {
    const date = addDays(input.startDate, day);
    state.dayProteins = new Set();
    const dayMeals: PlannedMeal[] = keep.filter((meal) => meal.date === date && meal.slot !== 'snack');
    for (const meal of dayMeals) {
      const recipe = recipes.get(meal.recipeId);
      if (recipe) for (const id of proteinSources(recipe, context.lookup)) state.dayProteins.add(id);
    }
    for (const slot of MAIN_SLOTS) {
      if (dayMeals.some((meal) => meal.slot === slot)) continue;
      const previousRecipe: Recipe | undefined = previousDinner ? recipes.get(previousDinner.recipeId) : undefined;
      if (slot === 'lunch' && context.preferences.allowLeftovers && previousDinner && previousRecipe?.batchFriendly && !previousLunchWasLeftover) {
        dayMeals.push(newMeal(date, 'lunch', previousDinner.recipeId, SLOT_ORDER.lunch, { leftoverOfMealId: previousDinner.id, servings: previousDinner.servings }));
        registerRecipe(previousRecipe, context, state);
        previousLunchWasLeftover = true;
        continue;
      }
      if (slot === 'lunch') previousLunchWasLeftover = false;
      const recipe = pickRecipe(slot, context, state);
      if (!recipe) continue;
      registerRecipe(recipe, context, state);
      dayMeals.push(newMeal(date, slot, recipe.id, SLOT_ORDER[slot]));
    }
    const keptSnacks = keep.filter((meal) => meal.date === date && meal.slot === 'snack');
    const balanced = balanceDay([...dayMeals, ...keptSnacks], date, context, state);
    meals.push(...balanced);
    previousDinner = balanced.find((meal) => meal.slot === 'dinner') ?? null;
  }
  // A leftover lunch must point to a dinner that exists in this plan.
  const ids = new Set(meals.map((meal) => meal.id));
  const now = new Date().toISOString();
  return {
    id: `plan_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    startDate: input.startDate,
    days: input.days,
    createdAt: now,
    updatedAt: now,
    generator: 'deterministic',
    seed: input.seed,
    targets: { kcal: context.targets.kcal, protein: context.targets.protein },
    status: 'active',
    meals: meals.map((meal) => meal.leftoverOfMealId && !ids.has(meal.leftoverOfMealId) ? { ...meal, leftoverOfMealId: undefined } : meal),
  };
}

function stateFromPlan(plan: MealPlan, context: PlannerContext, seed: number, excludeMealIds: string[] = [], dayDate?: string): ScoreState {
  const state: ScoreState = { usedRecipeCounts: new Map(), usedIngredients: new Set(), dayProteins: new Set(), random: seededRandom(seed) };
  const recipes = new Map(context.recipes.map((recipe) => [recipe.id, recipe]));
  for (const meal of plan.meals) {
    if (excludeMealIds.includes(meal.id)) continue;
    const recipe = recipes.get(meal.recipeId);
    if (recipe) registerRecipe(recipe, context, state);
  }
  state.dayProteins = new Set();
  if (dayDate) {
    for (const meal of plan.meals) {
      if (meal.date !== dayDate || excludeMealIds.includes(meal.id)) continue;
      const recipe = recipes.get(meal.recipeId);
      if (recipe) for (const id of proteinSources(recipe, context.lookup)) state.dayProteins.add(id);
    }
  }
  return state;
}

/** Regenerates one day, keeping locked/eaten meals and rebalancing portions. */
export function regenerateDay(plan: MealPlan, date: string, context: PlannerContext, seed: number): MealPlan {
  const dayMeals = plan.meals.filter((meal) => meal.date === date);
  const keep = dayMeals.filter((meal) => meal.locked || meal.status !== 'planned');
  const replaceIds = dayMeals.filter((meal) => !keep.includes(meal)).map((meal) => meal.id);
  const state = stateFromPlan(plan, context, seed, replaceIds, date);
  const next: PlannedMeal[] = [...keep.filter((meal) => meal.slot !== 'snack')];
  for (const slot of MAIN_SLOTS) {
    if (next.some((meal) => meal.slot === slot)) continue;
    const previousRecipeIds = dayMeals.filter((meal) => meal.slot === slot).map((meal) => meal.recipeId);
    const recipe = pickRecipe(slot, context, state, previousRecipeIds) ?? pickRecipe(slot, context, state);
    if (!recipe) continue;
    registerRecipe(recipe, context, state);
    next.push(newMeal(date, slot, recipe.id, SLOT_ORDER[slot]));
  }
  const balanced = balanceDay([...next, ...keep.filter((meal) => meal.slot === 'snack')], date, context, state);
  return withDayMeals(plan, date, balanced);
}

/** Replaces one meal with the best alternative for its slot and rebalances the day. */
export function replaceMeal(plan: MealPlan, mealIdToReplace: string, context: PlannerContext, seed: number, recipeId?: string): MealPlan {
  const target = plan.meals.find((meal) => meal.id === mealIdToReplace);
  if (!target) return plan;
  const state = stateFromPlan(plan, context, seed, [target.id], target.date);
  const recipe = recipeId
    ? context.recipes.find((item) => item.id === recipeId) ?? null
    : pickRecipe(target.slot, context, state, [target.recipeId]);
  if (!recipe) return plan;
  registerRecipe(recipe, context, state);
  const dayMeals = plan.meals.filter((meal) => meal.date === target.date);
  const replaced = dayMeals.map((meal) => meal.id === target.id
    ? { ...meal, recipeId: recipe.id, servings: 1, leftoverOfMealId: undefined, status: 'planned' as const, updatedAt: new Date().toISOString() }
    : meal);
  // Leftovers of the replaced dinner stop being leftovers.
  const detached = plan.meals.map((meal) => meal.leftoverOfMealId === target.id ? { ...meal, leftoverOfMealId: undefined } : meal);
  const keepSnacks = replaced.filter((meal) => meal.slot === 'snack');
  const balanced = balanceDay(
    [...replaced.filter((meal) => meal.slot !== 'snack'), ...keepSnacks.map((meal) => ({ ...meal, locked: true }))],
    target.date,
    { ...context, preferences: { ...context.preferences, snacksPerDay: 0 } },
    state,
  ).map((meal) => meal.slot === 'snack' ? { ...meal, locked: keepSnacks.find((snack) => snack.id === meal.id)?.locked ?? false } : meal);
  return withDayMeals({ ...plan, meals: detached }, target.date, balanced);
}

export function withDayMeals(plan: MealPlan, date: string, dayMeals: PlannedMeal[]): MealPlan {
  return {
    ...plan,
    updatedAt: new Date().toISOString(),
    meals: [...plan.meals.filter((meal) => meal.date !== date), ...dayMeals].sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order),
  };
}

export function updateMeal(plan: MealPlan, id: string, changes: Partial<PlannedMeal>): MealPlan {
  return {
    ...plan,
    updatedAt: new Date().toISOString(),
    meals: plan.meals.map((meal) => meal.id === id ? { ...meal, ...changes, updatedAt: new Date().toISOString() } : meal),
  };
}

export function planDates(plan: Pick<MealPlan, 'startDate' | 'days'>) {
  return Array.from({ length: plan.days }, (_, index) => addDays(plan.startDate, index));
}
