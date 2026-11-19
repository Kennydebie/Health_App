import type { Ingredient, IngredientUnit, NutrientsPer100, NutritionTotals, Recipe } from '../../types/project73';

export const EMPTY_TOTALS: NutritionTotals = { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, fruitVegGrams: 0 };

export type IngredientLookup = (id: string) => Ingredient | undefined;
/** Verified per-100 nutrition from a matched supermarket product, keyed by ingredient id. */
export type NutritionOverrides = Record<string, NutrientsPer100 | undefined>;

export interface ScaledIngredient {
  ingredient: Ingredient;
  amount: number;
  unit: IngredientUnit;
  optional: boolean;
}

/** Converts an amount in the ingredient's unit to grams (or ml for liquids, matching per100). */
export function nutritionBaseAmount(ingredient: Ingredient, amount: number) {
  if (ingredient.unit === 'piece') return amount * (ingredient.gramsPerPiece ?? 0);
  return amount;
}

export function roundAmount(amount: number, step: number, keepAtLeastOneStep = true) {
  if (amount <= 0) return 0;
  const rounded = Math.round(amount / step) * step;
  if (rounded === 0 && keepAtLeastOneStep) return step;
  return Number(rounded.toFixed(3));
}

/** Ingredient amounts for a number of servings, rounded to practical kitchen steps. */
export function scaleRecipe(recipe: Recipe, servings: number, lookup: IngredientLookup): ScaledIngredient[] {
  return recipe.ingredients.flatMap((item) => {
    const ingredient = lookup(item.ingredientId);
    if (!ingredient) return [];
    return [{ ingredient, amount: roundAmount(item.amount * servings, ingredient.roundTo), unit: ingredient.unit, optional: Boolean(item.optional) }];
  });
}

export function nutritionForAmount(per100: NutrientsPer100, baseAmount: number, isFruitOrVegetable = false): NutritionTotals {
  const ratio = baseAmount / 100;
  return {
    kcal: per100.kcal * ratio,
    protein: per100.protein * ratio,
    carbs: per100.carbs * ratio,
    fat: per100.fat * ratio,
    fiber: per100.fiber * ratio,
    fruitVegGrams: isFruitOrVegetable ? baseAmount : 0,
  };
}

export function addTotals(items: NutritionTotals[]): NutritionTotals {
  return items.reduce((sum, item) => ({
    kcal: sum.kcal + item.kcal,
    protein: sum.protein + item.protein,
    carbs: sum.carbs + item.carbs,
    fat: sum.fat + item.fat,
    fiber: sum.fiber + item.fiber,
    fruitVegGrams: sum.fruitVegGrams + item.fruitVegGrams,
  }), { ...EMPTY_TOTALS });
}

export function scaleTotals(totals: NutritionTotals, factor: number): NutritionTotals {
  return {
    kcal: totals.kcal * factor,
    protein: totals.protein * factor,
    carbs: totals.carbs * factor,
    fat: totals.fat * factor,
    fiber: totals.fiber * factor,
    fruitVegGrams: totals.fruitVegGrams * factor,
  };
}

export interface MealNutrition {
  totals: NutritionTotals;
  ingredients: Array<ScaledIngredient & { totals: NutritionTotals; verified: boolean }>;
  /** True when at least one ingredient uses reference values instead of a matched product label. */
  hasEstimates: boolean;
  totalGrams: number;
}

export function mealNutrition(recipe: Recipe, servings: number, lookup: IngredientLookup, overrides: NutritionOverrides = {}): MealNutrition {
  const scaled = scaleRecipe(recipe, servings, lookup);
  const detailed = scaled.map((item) => {
    const verifiedPer100 = overrides[item.ingredient.id];
    const per100 = verifiedPer100 ?? item.ingredient.per100;
    const base = nutritionBaseAmount(item.ingredient, item.amount);
    return { ...item, totals: nutritionForAmount(per100, base, item.ingredient.isFruitOrVegetable), verified: Boolean(verifiedPer100) };
  });
  return {
    totals: addTotals(detailed.map((item) => item.totals)),
    ingredients: detailed,
    hasEstimates: detailed.some((item) => !item.verified && item.ingredient.per100.kcal > 0),
    totalGrams: detailed.reduce((sum, item) => sum + nutritionBaseAmount(item.ingredient, item.amount), 0),
  };
}

export function formatAmount(amount: number, unit: IngredientUnit) {
  const value = amount.toLocaleString('nl-NL', { maximumFractionDigits: amount < 10 && unit !== 'piece' ? 1 : 0 });
  if (unit === 'piece') return `${value} st.`;
  return `${value} ${unit}`;
}
