import { describe, expect, it } from 'vitest';
import { createInitialData } from '../../data/initialData';
import { getNutritionTotals } from '../selectors';
import { createPlan, markMealEaten, markMealReplaced, markMealSkipped, resetMealStatus, setMealServings, toggleMealLock, updateMetabolicSettings, upsertPantryItem, acceptSuggestedTargets } from './actions';
import { activePlan, mealsOn, plannedDayTotals } from './selectors';

const today = '2026-11-02';

function planned() {
  return createPlan(today, 3, today, 42)(createInitialData());
}

describe('Project 73 actions', () => {
  it('creates a three-day plan and keeps planned intake out of the food log', () => {
    const data = planned();
    expect(activePlan(data)?.days).toBe(3);
    expect(mealsOn(data, today).length).toBeGreaterThanOrEqual(3);
    expect(data.foodLog).toHaveLength(0);
    expect(plannedDayTotals(data, today).kcal).toBeGreaterThan(1600);
    expect(getNutritionTotals(data, today).calories).toBe(0);
  });

  it('records "Gegeten", half portions, skips and undo separately from the plan', () => {
    let data = planned();
    const [breakfast, lunch, dinner] = mealsOn(data, today);
    data = markMealEaten(breakfast.id)(data);
    expect(data.foodLog).toHaveLength(1);
    const full = getNutritionTotals(data, today).calories;
    expect(full).toBeGreaterThan(200);
    data = markMealEaten(breakfast.id, 0.5)(data);
    expect(data.foodLog).toHaveLength(1);
    expect(getNutritionTotals(data, today).calories).toBeCloseTo(full / 2, 0);
    data = markMealSkipped(lunch.id)(data);
    expect(mealsOn(data, today).find((meal) => meal.id === lunch.id)?.status).toBe('skipped');
    data = markMealReplaced(dinner.id, 'Pizza bij vrienden', { kcal: 900, protein: 35 })(data);
    expect(data.foodLog).toHaveLength(2);
    data = resetMealStatus(dinner.id)(data);
    expect(data.foodLog).toHaveLength(1);
    expect(mealsOn(data, today).find((meal) => meal.id === dinner.id)?.status).toBe('planned');
  });

  it('carries eaten and locked meals into a new plan and archives the old one', () => {
    let data = planned();
    const [breakfast] = mealsOn(data, today);
    const dinnerTomorrow = mealsOn(data, '2026-11-03').find((meal) => meal.slot === 'dinner')!;
    data = markMealEaten(breakfast.id)(data);
    data = toggleMealLock(dinnerTomorrow.id)(data);
    data = createPlan(today, 3, today, 7)(data);
    expect(data.mealPlans.filter((plan) => plan.status === 'active')).toHaveLength(1);
    expect(data.mealPlans.filter((plan) => plan.status === 'archived')).toHaveLength(1);
    const plan = activePlan(data)!;
    expect(plan.meals.find((meal) => meal.id === breakfast.id)?.status).toBe('eaten');
    expect(plan.meals.find((meal) => meal.id === dinnerTomorrow.id)?.recipeId).toBe(dinnerTomorrow.recipeId);
  });

  it('adjusts portions within safe bounds', () => {
    let data = planned();
    const [breakfast] = mealsOn(data, today);
    data = setMealServings(breakfast.id, 9)(data);
    expect(mealsOn(data, today)[0].servings).toBe(3);
  });

  it('recalculates targets from overrides and back to the suggestion', () => {
    let data = createInitialData();
    data = updateMetabolicSettings({ overrides: { kcal: 1700, protein: 150, carbs: null, fat: null, fiber: null } }, today)(data);
    expect(data.profile.calorieTarget).toBe(1700);
    expect(data.profile.proteinTarget).toBe(150);
    data = acceptSuggestedTargets(today)(data);
    expect(data.profile.calorieTarget).toBe(1800);
    expect(data.nutritionTargetHistory.at(-1)?.caloriesKcal).toBe(1800);
  });

  it('keeps a pantry inventory', () => {
    let data = upsertPantryItem('rijst', 500, 'g')(createInitialData());
    data = upsertPantryItem('eieren', 6, 'piece')(data);
    expect(data.pantry).toHaveLength(2);
    data = upsertPantryItem('rijst', 0, 'g')(data);
    expect(data.pantry.map((item) => item.ingredientId)).toEqual(['eieren']);
  });
});
