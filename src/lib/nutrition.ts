import type { FoodItem, FoodLogEntry, Macros } from '../types/models';

export const EMPTY_MACROS: Macros = { calories: 0, protein: 0, carbs: 0, fat: 0 };

export function servingAmount(food: FoodItem, entry: Pick<FoodLogEntry, 'servingId' | 'quantity'>): number {
  const serving = food.servings.find((item) => item.id === entry.servingId) ?? food.servings[0];
  return serving.amount * entry.quantity;
}

export function entryMacros(food: FoodItem, entry: Pick<FoodLogEntry, 'servingId' | 'quantity'>): Macros {
  const ratio = servingAmount(food, entry) / 100;
  return {
    calories: food.calories * ratio,
    protein: food.protein * ratio,
    carbs: food.carbs * ratio,
    fat: food.fat * ratio,
  };
}

export function addMacros(items: Macros[]): Macros {
  return items.reduce((total, item) => ({
    calories: total.calories + item.calories,
    protein: total.protein + item.protein,
    carbs: total.carbs + item.carbs,
    fat: total.fat + item.fat,
  }), { ...EMPTY_MACROS });
}

export function roundMacro(value: number): number {
  return Math.round(value * 10) / 10;
}
