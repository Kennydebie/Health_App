import type { MealPlan, PantryItem, Recipe } from '../../types/project73';
import type { ProductCandidate, ShoppingItem, ShoppingPlan } from '../../types/shopping';
import { buildShoppingItem, consolidateRequirements, shoppingTotals } from './grocery';
import { dayTotals, eligibleRecipes, replaceMeal, type PlannerContext } from './mealPlanner';

export interface SwapSuggestion {
  mealId: string;
  date: string;
  fromRecipeId: string;
  toRecipeId: string;
  fromName: string;
  toName: string;
  reason: string;
  costDeltaCents: number;
  wasteDeltaCents: number;
  newTotalCents: number;
  dayKcal: number;
  dayProtein: number;
  plan: MealPlan;
}

interface EvaluateInput {
  plan: MealPlan;
  shopping: ShoppingPlan;
  context: PlannerContext;
  pantry: PantryItem[];
  fromDate: string;
  staplesAtHome: boolean;
}

function candidatesFor(item: ShoppingItem): ProductCandidate[] {
  const seen = new Map<string, ProductCandidate>();
  for (const line of item.lines) seen.set(line.product.productId, line.product);
  for (const alternative of item.alternatives) seen.set(alternative.product.productId, alternative.product);
  return [...seen.values()];
}

/** Re-prices a meal plan with product data that was already fetched. Returns null when an ingredient has no known products. */
export function repriceWithKnownProducts(plan: MealPlan, input: Omit<EvaluateInput, 'plan'>) {
  const recipes = new Map(input.context.recipes.map((recipe) => [recipe.id, recipe]));
  const requirements = consolidateRequirements(plan, recipes, input.context.lookup, input.pantry, { fromDate: input.fromDate, staplesAtHome: input.staplesAtHome });
  const known = new Map(input.shopping.items.map((item) => [item.ingredientId, item]));
  const items: ShoppingItem[] = [];
  for (const requirement of requirements) {
    const ingredient = input.context.lookup(requirement.ingredientId);
    if (!ingredient) return null;
    const previous = known.get(requirement.ingredientId);
    const needsProducts = !(requirement.staple && input.staplesAtHome) && requirement.netAmount > 0;
    if (needsProducts && (!previous || !candidatesFor(previous).length)) return null;
    items.push(buildShoppingItem({ requirement, ingredient, candidates: previous ? candidatesFor(previous) : [], staplesAtHome: input.staplesAtHome, mode: input.shopping.mode }));
  }
  return { items, totals: shoppingTotals(items) };
}

function perishableSurplusCents(items: ShoppingItem[]) {
  return items.filter((item) => item.wasteRisk !== 'none').reduce((sum, item) => sum + (item.costCents - item.consumedCostCents), 0);
}

/**
 * Suggests meal swaps that use up surplus from packages already in the basket (goal 'waste') or
 * lower the basket total (goal 'cost'), while keeping the day close to the calorie and protein
 * targets. Only ingredients with known supermarket products are considered.
 */
export function suggestSwaps(input: EvaluateInput, goal: 'waste' | 'cost', limit = 3): SwapSuggestion[] {
  const recipes = new Map(input.context.recipes.map((recipe) => [recipe.id, recipe]));
  const baseline = { items: input.shopping.items, totals: input.shopping.totals };
  const baselineWaste = perishableSurplusCents(baseline.items);
  const surplusIngredients = new Set(input.shopping.items.filter((item) => item.wasteRisk !== 'none').map((item) => item.ingredientId));
  if (goal === 'waste' && !surplusIngredients.size) return [];
  const suggestions: SwapSuggestion[] = [];
  const meals = input.plan.meals.filter((meal) => meal.status === 'planned' && !meal.locked && !meal.leftoverOfMealId && meal.slot !== 'snack' && meal.date >= input.fromDate);
  for (const meal of meals) {
    const current = recipes.get(meal.recipeId);
    if (!current) continue;
    const options = eligibleRecipes(input.context, meal.slot).filter((recipe: Recipe) => recipe.id !== meal.recipeId
      && (goal === 'cost' || recipe.ingredients.some((item) => surplusIngredients.has(item.ingredientId))));
    for (const recipe of options) {
      const plan = replaceMeal(input.plan, meal.id, input.context, input.plan.seed + 7, recipe.id);
      const priced = repriceWithKnownProducts(plan, input);
      if (!priced) continue;
      const day = dayTotals(plan.meals.filter((item) => item.date === meal.date), recipes, input.context.lookup, input.context.overrides);
      if (day.protein < input.context.targets.protein - 15 || Math.abs(day.kcal - input.context.targets.kcal) > input.context.targets.kcal * 0.08) continue;
      const costDeltaCents = priced.totals.costCents - baseline.totals.costCents;
      const wasteDeltaCents = perishableSurplusCents(priced.items) - baselineWaste;
      if (goal === 'waste' && !(wasteDeltaCents < -25 && costDeltaCents <= 75)) continue;
      if (goal === 'cost' && !(costDeltaCents < -50)) continue;
      const used = recipe.ingredients.map((item) => input.shopping.items.find((shoppingItem) => shoppingItem.ingredientId === item.ingredientId && shoppingItem.wasteRisk !== 'none')?.name).filter(Boolean);
      suggestions.push({
        mealId: meal.id,
        date: meal.date,
        fromRecipeId: current.id,
        toRecipeId: recipe.id,
        fromName: current.name,
        toName: recipe.name,
        reason: goal === 'waste' && used.length ? `Gebruikt je overgebleven ${used.join(', ').toLowerCase()}` : 'Goedkoper met dezelfde eiwitten',
        costDeltaCents,
        wasteDeltaCents,
        newTotalCents: priced.totals.costCents,
        dayKcal: day.kcal,
        dayProtein: day.protein,
        plan,
      });
    }
  }
  return suggestions
    .sort((a, b) => (goal === 'waste' ? a.wasteDeltaCents + a.costDeltaCents * 0.5 - (b.wasteDeltaCents + b.costDeltaCents * 0.5) : a.costDeltaCents - b.costDeltaCents))
    .filter((suggestion, index, list) => list.findIndex((item) => item.mealId === suggestion.mealId) === index)
    .slice(0, limit);
}
