import { describe, expect, it } from 'vitest';
import { getIngredient } from '../../data/project73/ingredients';
import { builtinRecipes } from '../../data/project73/recipes';
import { dayTotals, generateMealPlan, planDates, regenerateDay, replaceMeal, updateMeal, type PlannerContext } from './mealPlanner';
import { DEFAULT_PLANNING_PREFERENCES } from './defaults';

const context: PlannerContext = {
  recipes: builtinRecipes,
  lookup: getIngredient,
  preferences: DEFAULT_PLANNING_PREFERENCES,
  targets: { kcal: 1800, protein: 140 },
};
const recipes = new Map(builtinRecipes.map((recipe) => [recipe.id, recipe]));

describe('meal planner', () => {
  it('creates a complete three-day plan close to 1800 kcal and 140 g protein', () => {
    for (const seed of [1, 2, 3, 42, 1234]) {
      const plan = generateMealPlan({ startDate: '2026-11-02', days: 3, seed }, context);
      expect(planDates(plan)).toEqual(['2026-11-02', '2026-11-03', '2026-11-04']);
      for (const date of planDates(plan)) {
        const meals = plan.meals.filter((meal) => meal.date === date);
        expect(meals.filter((meal) => meal.slot !== 'snack').map((meal) => meal.slot)).toEqual(['breakfast', 'lunch', 'dinner']);
        const totals = dayTotals(meals, recipes, getIngredient);
        expect(Math.abs(totals.kcal - 1800)).toBeLessThan(1800 * 0.07);
        expect(totals.protein).toBeGreaterThanOrEqual(125);
      }
    }
  });

  it('is reproducible from the seed and reuses ingredients', () => {
    const a = generateMealPlan({ startDate: '2026-11-02', days: 3, seed: 7 }, context);
    const b = generateMealPlan({ startDate: '2026-11-02', days: 3, seed: 7 }, context);
    expect(a.meals.map((meal) => `${meal.date}:${meal.slot}:${meal.recipeId}:${meal.servings}`)).toEqual(b.meals.map((meal) => `${meal.date}:${meal.slot}:${meal.recipeId}:${meal.servings}`));
    const dinners = a.meals.filter((meal) => meal.slot === 'dinner').map((meal) => meal.recipeId);
    expect(new Set(dinners).size).toBe(dinners.length);
  });

  it('plans leftovers from batch-friendly dinners', () => {
    const plan = generateMealPlan({ startDate: '2026-11-02', days: 3, seed: 5 }, context);
    const leftovers = plan.meals.filter((meal) => meal.leftoverOfMealId);
    for (const leftover of leftovers) {
      const source = plan.meals.find((meal) => meal.id === leftover.leftoverOfMealId)!;
      expect(source.recipeId).toBe(leftover.recipeId);
      expect(recipes.get(source.recipeId)?.batchFriendly).toBe(true);
    }
  });

  it('respects allergens, restrictions, dislikes and prep time', () => {
    const plan = generateMealPlan({ startDate: '2026-11-02', days: 7, seed: 3 }, { ...context, preferences: { ...context.preferences, allergens: ['vis'], dietaryRestrictions: ['rund'], dislikedIngredientIds: ['hummus'], maxPrepMinutes: 10 } });
    for (const meal of plan.meals) {
      const recipe = recipes.get(meal.recipeId)!;
      expect(recipe.prepMinutes).toBeLessThanOrEqual(10);
      for (const item of recipe.ingredients) {
        const ingredient = getIngredient(item.ingredientId)!;
        expect(ingredient.allergens).not.toContain('vis');
        expect(ingredient.diet).not.toContain('rund');
        expect(ingredient.id).not.toBe('hummus');
      }
    }
  });

  it('keeps locked meals when regenerating a day', () => {
    const plan = generateMealPlan({ startDate: '2026-11-02', days: 3, seed: 11 }, context);
    const dinner = plan.meals.find((meal) => meal.date === '2026-11-03' && meal.slot === 'dinner')!;
    const locked = updateMeal(plan, dinner.id, { locked: true });
    const regenerated = regenerateDay(locked, '2026-11-03', context, 99);
    const kept = regenerated.meals.find((meal) => meal.id === dinner.id)!;
    expect(kept.recipeId).toBe(dinner.recipeId);
    expect(kept.servings).toBe(dinner.servings);
    expect(regenerated.meals.filter((meal) => meal.date === '2026-11-02')).toEqual(plan.meals.filter((meal) => meal.date === '2026-11-02'));
  });

  it('replaces one meal and rebalances the day', () => {
    const plan = generateMealPlan({ startDate: '2026-11-02', days: 3, seed: 21 }, context);
    const lunch = plan.meals.find((meal) => meal.date === '2026-11-02' && meal.slot === 'lunch')!;
    const replaced = replaceMeal(plan, lunch.id, context, 5);
    const next = replaced.meals.find((meal) => meal.id === lunch.id)!;
    expect(next.recipeId).not.toBe(lunch.recipeId);
    const totals = dayTotals(replaced.meals.filter((meal) => meal.date === '2026-11-02'), recipes, getIngredient);
    expect(Math.abs(totals.kcal - 1800)).toBeLessThan(1800 * 0.12);
  });
});
