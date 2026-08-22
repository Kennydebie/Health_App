import { foods } from '../data/foods';
import type { AppData, FoodItem, FoodLogEntry } from '../types/models';
import { foodCanBeLogged } from './nutrition';

const DUTCH_SYNONYMS: Record<string, string> = {
  kipfilet: 'chicken breast', kip: 'chicken', rundergehakt: 'minced beef', gehakt: 'minced beef',
  zalm: 'salmon', zalmfilet: 'salmon fillet', 'magere kwark': 'low fat quark', kwark: 'quark',
  yoghurt: 'yogurt', sperziebonen: 'green beans', bloemkool: 'cauliflower', aardappelen: 'potato',
  aardappel: 'potato', havermout: 'oats', pindakaas: 'peanut butter', 'halfvolle melk': 'semi skimmed milk',
  melk: 'milk', eiwitpoeder: 'protein powder', slagroom: 'whipping cream', tomatenpuree: 'tomato paste',
  tomatenpassata: 'tomato passata', olijfolie: 'olive oil', volkoren: 'whole grain', hüttenkäse: 'cottage cheese',
};

export function normalizeFoodQuery(value: string) {
  return value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

export function expandFoodQuery(query: string) {
  const normalized = normalizeFoodQuery(query);
  const translated = DUTCH_SYNONYMS[normalized]
    ?? Object.entries(DUTCH_SYNONYMS).reduce((value, [dutch, english]) => value.replace(new RegExp(`\\b${dutch}\\b`, 'g'), english), normalized);
  return translated === normalized ? [normalized] : [normalized, translated];
}

export function foodCatalog(data: Pick<AppData, 'foodLibrary'>) {
  const byId = new Map(foods.map((food) => [food.id, food]));
  for (const food of data.foodLibrary) byId.set(food.id, food);
  return [...byId.values()];
}

export function resolveFood(data: Pick<AppData, 'foodLibrary'>, foodId: string) {
  return data.foodLibrary.find((food) => food.id === foodId) ?? foods.find((food) => food.id === foodId);
}

export function foodForEntry(data: Pick<AppData, 'foodLibrary'>, entry: FoodLogEntry): FoodItem | undefined {
  const resolved = resolveFood(data, entry.foodId);
  if (resolved || !entry.snapshot) return resolved;
  const perServingAmount = entry.quantity > 0 ? entry.snapshot.amount / entry.quantity : entry.snapshot.amount;
  return {
    id: entry.foodId,
    name: entry.snapshot.foodName,
    brand: entry.snapshot.brand,
    category: 'Saved food',
    unit: entry.snapshot.unit,
    image: entry.snapshot.image,
    servings: [{ id: entry.servingId, label: entry.snapshot.servingLabel, amount: perServingAmount, unit: entry.snapshot.unit }],
    ...entry.snapshot.per100,
    dataCompleteness: 'complete',
    source: entry.snapshot.source,
  };
}

export function foodQualityIssues(food: FoodItem) {
  const issues: string[] = [];
  if (!food.name.trim()) issues.push('Missing product name');
  if (!food.servings.length || food.servings.some((serving) => serving.amount <= 0)) issues.push('Missing or invalid serving size');
  for (const [label, value] of [['Calories', food.calories], ['Protein', food.protein], ['Carbohydrates', food.carbs], ['Fat', food.fat]] as const) {
    if (value == null) issues.push(`${label} missing`);
    else if (value < 0) issues.push(`${label} cannot be negative`);
  }
  if (food.calories != null && food.calories > 950) issues.push('Calories per 100 appear unusually high');
  if ([food.protein, food.carbs, food.fat].some((value) => value != null && value > 100)) issues.push('A macro exceeds 100 g per 100');
  return issues;
}

function nutritionDistance(a: FoodItem, b: FoodItem) {
  if (!foodCanBeLogged(a) || !foodCanBeLogged(b)) return Infinity;
  return Math.abs(a.calories! - b.calories!) + Math.abs(a.protein! - b.protein!) * 4 + Math.abs(a.carbs! - b.carbs!) + Math.abs(a.fat! - b.fat!) * 2;
}

export function dedupeFoods(items: FoodItem[]) {
  const result: FoodItem[] = [];
  for (const item of items) {
    const duplicate = result.find((current) => item.barcode && current.barcode === item.barcode
      || item.source?.provider === current.source?.provider && item.source?.externalId === current.source?.externalId
      || normalizeFoodQuery(item.name) === normalizeFoodQuery(current.name) && normalizeFoodQuery(item.brand ?? '') === normalizeFoodQuery(current.brand ?? '') && nutritionDistance(item, current) < 8);
    if (!duplicate) result.push(item);
  }
  return result;
}

export function rankFoods(items: FoodItem[], query: string, data: Pick<AppData, 'favorites' | 'recentFoodIds' | 'foodLog'>) {
  const queries = expandFoodQuery(query);
  const normalized = queries[0];
  const frequency = new Map<string, number>();
  for (const entry of data.foodLog) frequency.set(entry.foodId, (frequency.get(entry.foodId) ?? 0) + 1);
  const score = (food: FoodItem) => {
    const name = normalizeFoodQuery(food.name);
    const brand = normalizeFoodQuery(food.brand ?? '');
    let value = 0;
    if (queries.includes(name)) value += 120;
    if (queries.some((item) => name.startsWith(item))) value += 75;
    if (queries.some((item) => name.includes(item))) value += 52;
    if (brand && brand.includes(normalized)) value += 28;
    if (!food.brand) value += 18;
    if (food.country && /netherlands|belgium|germany|europe/i.test(food.country)) value += 14;
    if (foodCanBeLogged(food)) value += 18;
    if (food.servings.length > 1) value += 5;
    if (food.image) value += 3;
    if (data.favorites.includes(food.id)) value += 35;
    const recentIndex = data.recentFoodIds.indexOf(food.id);
    if (recentIndex >= 0) value += 24 - Math.min(20, recentIndex * 3);
    value += Math.min(30, (frequency.get(food.id) ?? 0) * 4);
    return value;
  };
  return [...dedupeFoods(items)].sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name));
}

export function searchLocalFoods(data: Pick<AppData, 'foodLibrary' | 'favorites' | 'recentFoodIds' | 'foodLog'>, query: string) {
  const terms = expandFoodQuery(query);
  const matches = foodCatalog(data).filter((food) => {
    const haystack = normalizeFoodQuery(`${food.name} ${food.brand ?? ''} ${food.category} ${food.preparation ?? ''}`);
    return terms.some((term) => term.split(' ').every((token) => haystack.includes(token)));
  });
  return rankFoods(matches, query, data);
}
