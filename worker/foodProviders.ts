import type { FoodItem } from '../src/types/models';

interface FoodProviderEnv { USDA_API_KEY?: string; }
interface OffNutriments { [key: string]: unknown; }
interface OffProduct {
  code?: string; product_name?: string; product_name_en?: string; product_name_nl?: string; generic_name?: string;
  brands?: string; image_front_small_url?: string; image_front_url?: string; image_url?: string; nutriments?: OffNutriments;
  serving_size?: string; serving_quantity?: number; product_quantity?: number | string; product_quantity_unit?: string; quantity?: string;
  countries?: string; categories?: string; ingredients_text?: string; allergens?: string;
}
interface UsdaNutrient { nutrientName?: string; unitName?: string; value?: number; }
interface UsdaFood { fdcId?: number; description?: string; brandName?: string; brandOwner?: string; gtinUpc?: string; servingSize?: number; servingSizeUnit?: string; foodCategory?: string; dataType?: string; foodNutrients?: UsdaNutrient[]; }

const OFF_FIELDS = 'code,product_name,product_name_en,product_name_nl,generic_name,brands,image_front_small_url,image_front_url,image_url,nutriments,serving_size,serving_quantity,product_quantity,product_quantity_unit,quantity,countries,categories,ingredients_text,allergens';
const USER_AGENT = 'Project75/1.0 (https://project-75.xorqe.chatgpt.site)';
const cache = new Map<string, { expiresAt: number; value: unknown }>();
const CACHE_TTL = 15 * 60_000;

function numberValue(value: unknown) {
  const number = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
  return Number.isFinite(number) ? number : null;
}

function safeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function preparationFromName(name: string): FoodItem['preparation'] {
  if (/\braw\b/i.test(name)) return 'raw';
  if (/\bcooked|boiled|baked|roasted|grilled\b/i.test(name)) return 'cooked';
  if (/\bdry|uncooked\b/i.test(name)) return 'dry';
  if (/\bsmoked\b/i.test(name)) return 'smoked';
  if (/\bcanned|tin\b/i.test(name)) return 'canned';
  return undefined;
}

function quality(calories: number | null, protein: number | null, carbs: number | null, fat: number | null, hasServing: boolean) {
  if ([calories, protein, carbs, fat].every((value) => value != null)) return hasServing ? 'complete' as const : 'missing_serving' as const;
  return 'partial' as const;
}

function baseServings(unit: 'g' | 'ml', label?: string, amount?: number | null) {
  const servings = [{ id: unit === 'g' ? '100g' : '100ml', label: `100 ${unit}`, amount: 100, unit }];
  if (amount && amount > 0 && label) servings.push({ id: 'serving', label, amount, unit });
  return servings;
}

export function normalizeOff(product: OffProduct, now: string): FoodItem | null {
  const name = safeText(product.product_name_nl) || safeText(product.product_name_en) || safeText(product.product_name) || safeText(product.generic_name);
  const code = safeText(product.code);
  if (!name || !code) return null;
  const nutrients = product.nutriments ?? {};
  const energyKcal = numberValue(nutrients['energy-kcal_100g']);
  const energyKj = numberValue(nutrients['energy-kj_100g']);
  const calories = energyKcal ?? (energyKj == null ? null : energyKj / 4.184);
  const protein = numberValue(nutrients.proteins_100g);
  const carbs = numberValue(nutrients.carbohydrates_100g);
  const fat = numberValue(nutrients.fat_100g);
  const sodium = numberValue(nutrients.sodium_100g);
  const statedSalt = numberValue(nutrients.salt_100g);
  const salt = statedSalt ?? (sodium == null ? null : sodium * 2.5);
  const unit = /\bml\b/i.test(safeText(product.product_quantity_unit)) || /\bml\b/i.test(safeText(product.serving_size)) ? 'ml' as const : 'g' as const;
  const servingAmount = numberValue(product.serving_quantity);
  const servingLabel = safeText(product.serving_size) || (servingAmount ? `1 serving (${servingAmount} ${unit})` : '');
  return {
    id: `off:${code}`,
    name,
    brand: safeText(product.brands) || undefined,
    barcode: code,
    category: safeText(product.categories).split(',')[0] || 'Branded product',
    country: safeText(product.countries) || undefined,
    packageSize: safeText(product.quantity) || undefined,
    unit,
    image: safeText(product.image_front_small_url) || safeText(product.image_front_url) || safeText(product.image_url),
    servings: baseServings(unit, servingLabel || undefined, servingAmount),
    calories, protein, carbs, fat,
    fiber: numberValue(nutrients.fiber_100g), sugar: numberValue(nutrients.sugars_100g), salt, sodium,
    saltDerivedFromSodium: statedSalt == null && sodium != null,
    ingredients: safeText(product.ingredients_text) || undefined,
    allergens: safeText(product.allergens) || undefined,
    preparation: preparationFromName(name),
    dataCompleteness: quality(calories, protein, carbs, fat, Boolean(servingAmount)),
    source: { provider: 'open_food_facts', providerName: 'Open Food Facts', externalId: code, retrievedAt: now },
    isCached: true,
  };
}

function nutrient(food: UsdaFood, matcher: RegExp) {
  const item = food.foodNutrients?.find((value) => matcher.test(value.nutrientName ?? '') && (!/energy/i.test(value.nutrientName ?? '') || /kcal/i.test(value.unitName ?? '')));
  return numberValue(item?.value);
}

export function normalizeUsda(food: UsdaFood, now: string): FoodItem | null {
  if (!food.fdcId || !safeText(food.description)) return null;
  const calories = nutrient(food, /^Energy$/i);
  const protein = nutrient(food, /^Protein$/i);
  const carbs = nutrient(food, /Carbohydrate, by difference/i);
  const fat = nutrient(food, /Total lipid \(fat\)/i);
  const servingUnit = safeText(food.servingSizeUnit).toLowerCase();
  const unit = servingUnit.includes('ml') ? 'ml' as const : 'g' as const;
  const servingAmount = numberValue(food.servingSize);
  const description = safeText(food.description).replace(/\s+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
  return {
    id: `usda:${food.fdcId}`,
    name: description,
    brand: safeText(food.brandName) || safeText(food.brandOwner) || undefined,
    barcode: safeText(food.gtinUpc) || undefined,
    category: safeText(food.foodCategory) || (food.dataType === 'Branded' ? 'Branded product' : 'Generic food'),
    country: 'United States', unit, image: '',
    servings: baseServings(unit, servingAmount ? `1 serving (${servingAmount} ${unit})` : undefined, servingAmount),
    calories, protein, carbs, fat,
    fiber: nutrient(food, /Fiber, total dietary/i), sugar: nutrient(food, /Sugars, total/i), sodium: nutrient(food, /^Sodium/i),
    preparation: preparationFromName(description),
    dataCompleteness: quality(calories, protein, carbs, fat, Boolean(servingAmount)),
    source: { provider: 'usda', providerName: 'USDA FoodData Central', externalId: String(food.fdcId), retrievedAt: now },
    isCached: true,
  };
}

async function cachedFetch<T>(key: string, factory: () => Promise<T>) {
  const current = cache.get(key);
  if (current && current.expiresAt > Date.now()) return current.value as T;
  const value = await factory();
  cache.set(key, { expiresAt: Date.now() + CACHE_TTL, value });
  if (cache.size > 250) cache.delete(cache.keys().next().value ?? '');
  return value;
}

async function fetchJson(url: string) {
  const response = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`Provider returned ${response.status}`);
  return response.json();
}

async function searchOff(query: string, page: number) {
  const params = new URLSearchParams({ search_terms: query, search_simple: '1', action: 'process', json: '1', page: String(page), page_size: '24', fields: OFF_FIELDS, cc: 'nl', lc: 'nl' });
  const payload = await cachedFetch(`off:${query}:${page}`, () => fetchJson(`https://world.openfoodfacts.org/cgi/search.pl?${params}`)) as { products?: OffProduct[]; count?: number; page_size?: number };
  const now = new Date().toISOString();
  return { foods: (payload.products ?? []).map((item) => normalizeOff(item, now)).filter((item): item is FoodItem => Boolean(item)), hasMore: page * (payload.page_size ?? 24) < (payload.count ?? 0) };
}

async function searchUsda(query: string, page: number, apiKey: string) {
  const params = new URLSearchParams({ api_key: apiKey, query, pageNumber: String(page), pageSize: '20', dataType: 'Foundation,SR Legacy,FNDDS,Branded' });
  const payload = await cachedFetch(`usda:${query}:${page}`, () => fetchJson(`https://api.nal.usda.gov/fdc/v1/foods/search?${params}`)) as { foods?: UsdaFood[]; totalPages?: number };
  const now = new Date().toISOString();
  return { foods: (payload.foods ?? []).map((item) => normalizeUsda(item, now)).filter((item): item is FoodItem => Boolean(item)), hasMore: page < (payload.totalPages ?? 0) };
}

function dedupe(items: FoodItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.barcode ? `barcode:${item.barcode}` : `${item.source?.provider}:${item.source?.externalId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function searchExternalFoods(query: string, page: number, env: FoodProviderEnv) {
  const providers = [
    { id: 'open_food_facts', promise: searchOff(query, page) },
    ...(env.USDA_API_KEY ? [{ id: 'usda', promise: searchUsda(query, page, env.USDA_API_KEY) }] : []),
  ];
  const settled = await Promise.allSettled(providers.map((provider) => provider.promise));
  const foods: FoodItem[] = [];
  let hasMore = false;
  const statuses = providers.map((provider, index) => {
    const result = settled[index];
    if (result.status === 'fulfilled') { foods.push(...result.value.foods); hasMore ||= result.value.hasMore; }
    return { id: provider.id, available: result.status === 'fulfilled' };
  });
  return { foods: dedupe(foods), page, hasMore, providers: statuses, warning: statuses.some((item) => !item.available) ? 'One food source is temporarily unavailable. Local and cached foods are still shown.' : undefined };
}

export async function lookupExternalBarcode(barcode: string) {
  const payload = await cachedFetch(`barcode:${barcode}`, () => fetchJson(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=${OFF_FIELDS}&cc=nl&lc=nl`)) as { status?: number; product?: OffProduct };
  if (payload.status !== 1 || !payload.product) return null;
  return normalizeOff(payload.product, new Date().toISOString());
}
