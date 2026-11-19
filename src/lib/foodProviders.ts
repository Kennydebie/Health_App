import type { FoodItem } from '../types/models';

export interface FoodSearchResponse {
  foods: FoodItem[];
  page: number;
  hasMore: boolean;
  providers: Array<{ id: string; available: boolean }>;
  warning?: string;
}

async function responseJson(response: Response) {
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload || typeof payload !== 'object') throw new Error(response.status === 429 ? 'Food search is busy. Please wait a moment.' : 'Online food search is temporarily unavailable.');
  return payload;
}

export async function searchFoodProviders(query: string, page: number, signal?: AbortSignal): Promise<FoodSearchResponse> {
  const response = await fetch(`/api/foods/search?q=${encodeURIComponent(query)}&page=${page}`, { signal, headers: { Accept: 'application/json' } });
  return responseJson(response) as Promise<FoodSearchResponse>;
}

export async function lookupFoodBarcode(barcode: string, signal?: AbortSignal): Promise<FoodItem> {
  const response = await fetch(`/api/foods/barcode/${encodeURIComponent(barcode)}`, { signal, headers: { Accept: 'application/json' } });
  if (response.status === 404) throw new Error('No product matched this barcode.');
  const payload = await responseJson(response) as { food?: FoodItem };
  if (!payload.food) throw new Error('This product does not contain usable food data.');
  return payload.food;
}
