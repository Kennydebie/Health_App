import type { FoodItem, FoodLogEntry, FoodLogSnapshot, Macros } from '../types/models';

export const EMPTY_MACROS: Macros = { calories: 0, protein: 0, carbs: 0, fat: 0 };

export function servingAmount(food: FoodItem, entry: Pick<FoodLogEntry, 'servingId' | 'quantity' | 'snapshot'>): number {
  if (entry.snapshot) return entry.snapshot.amount;
  const serving = food.servings.find((item) => item.id === entry.servingId) ?? food.servings[0];
  return serving.amount * entry.quantity;
}

export function entryMacros(food: FoodItem | undefined, entry: Pick<FoodLogEntry, 'servingId' | 'quantity' | 'snapshot'>): Macros {
  if (entry.snapshot) return entry.snapshot.calculated;
  if (!food || food.calories == null || food.protein == null || food.carbs == null || food.fat == null) return { ...EMPTY_MACROS };
  const ratio = servingAmount(food, entry) / 100;
  return {
    calories: food.calories * ratio,
    protein: food.protein * ratio,
    carbs: food.carbs * ratio,
    fat: food.fat * ratio,
  };
}

export function foodCanBeLogged(food: FoodItem) {
  return food.calories != null && food.protein != null && food.carbs != null && food.fat != null
    && food.calories >= 0 && food.protein >= 0 && food.carbs >= 0 && food.fat >= 0;
}

export function createFoodSnapshot(food: FoodItem, servingId: string, quantity: number): FoodLogSnapshot | null {
  if (!foodCanBeLogged(food)) return null;
  const serving = food.servings.find((item) => item.id === servingId) ?? food.servings[0];
  if (!serving || !Number.isFinite(quantity) || quantity <= 0) return null;
  const amount = serving.amount * quantity;
  const per100 = { calories: food.calories!, protein: food.protein!, carbs: food.carbs!, fat: food.fat! };
  const ratio = amount / 100;
  return {
    foodName: food.name,
    ...(food.brand ? { brand: food.brand } : {}),
    image: food.image,
    unit: food.unit,
    amount,
    servingLabel: serving.label,
    per100,
    calculated: {
      calories: per100.calories * ratio,
      protein: per100.protein * ratio,
      carbs: per100.carbs * ratio,
      fat: per100.fat * ratio,
    },
    source: food.source,
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
