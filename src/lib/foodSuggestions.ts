import { foodCatalog } from './foodCatalog';
import { createFoodSnapshot, foodCanBeLogged } from './nutrition';
import type { AppData, FoodItem, Macros } from '../types/models';

export interface FoodSuggestion {
  food: FoodItem;
  servingId: string;
  quantity: number;
  amount: number;
  macros: Macros;
  reason: string;
  score: number;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function suggestFoods(data: AppData, calorieBudget: number, proteinGap: number, limit = 6): FoodSuggestion[] {
  if (calorieBudget < 40) return [];
  const frequency = new Map<string, number>();
  for (const entry of data.foodLog) frequency.set(entry.foodId, (frequency.get(entry.foodId) ?? 0) + 1);
  return foodCatalog(data).flatMap((food): FoodSuggestion[] => {
    if (!foodCanBeLogged(food) || !food.calories || food.calories <= 0) return [];
    const proteinPerGram = food.protein! / 100;
    const caloriesPerGram = food.calories / 100;
    if (proteinGap >= 20 && proteinPerGram < .08) return [];
    const serving = food.servings.find((item) => item.id === '100g' || item.id === '100ml') ?? food.servings[0];
    if (!serving) return [];
    const maxAmount = Math.min(food.unit === 'ml' ? 500 : 400, calorieBudget / caloriesPerGram);
    const proteinAmount = proteinPerGram > 0 ? proteinGap / proteinPerGram : 100;
    const desiredAmount = proteinGap > 0 ? proteinAmount : Math.min(150, maxAmount);
    const amount = Math.round(clamp(desiredAmount, Math.min(50, maxAmount), maxAmount) / 5) * 5;
    if (amount <= 0) return [];
    const quantity = amount / serving.amount;
    const snapshot = createFoodSnapshot(food, serving.id, quantity);
    if (!snapshot || snapshot.calculated.calories > calorieBudget + 1) return [];
    const preference = (data.favorites.includes(food.id) ? 28 : 0) + Math.min(24, (frequency.get(food.id) ?? 0) * 4) + Math.max(0, 12 - data.recentFoodIds.indexOf(food.id) * 2);
    const proteinFit = proteinGap > 0 ? Math.min(proteinGap, snapshot.calculated.protein) / Math.max(1, proteinGap) * 55 : 12;
    const budgetFit = (1 - snapshot.calculated.calories / calorieBudget) * 8;
    const reason = snapshot.calculated.protein >= Math.max(15, proteinGap * .7)
      ? 'Closes most of the protein gap'
      : data.favorites.includes(food.id)
        ? 'A favorite that fits the remaining budget'
        : 'High-protein option within the remaining budget';
    return [{ food, servingId: serving.id, quantity, amount, macros: snapshot.calculated, reason, score: preference + proteinFit + budgetFit }];
  }).sort((a, b) => b.score - a.score || a.food.name.localeCompare(b.food.name)).slice(0, limit);
}
