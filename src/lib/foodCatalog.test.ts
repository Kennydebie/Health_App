import { describe, expect, it } from 'vitest';
import { createInitialData } from '../data/initialData';
import type { FoodItem } from '../types/models';
import { dedupeFoods, expandFoodQuery, foodQualityIssues, rankFoods } from './foodCatalog';

const providerFood = (changes: Partial<FoodItem> = {}): FoodItem => ({
  id: 'provider-1', name: 'Chicken breast', category: 'Meat', unit: 'g', image: '',
  servings: [{ id: '100g', label: '100 g', amount: 100, unit: 'g' }],
  calories: 165, protein: 31, carbs: 0, fat: 3.6, dataCompleteness: 'complete',
  source: { provider: 'open_food_facts', providerName: 'Open Food Facts', externalId: '1', retrievedAt: '2026-08-22T00:00:00Z' },
  ...changes,
});

describe('hybrid food catalog', () => {
  it('expands common Dutch food terms for bilingual search', () => {
    expect(expandFoodQuery('kipfilet')).toEqual(['kipfilet', 'chicken breast']);
  });

  it('deduplicates the same provider record and prioritizes exact complete matches', () => {
    const exact = providerFood();
    const duplicate = providerFood({ id: 'provider-copy' });
    const partial = providerFood({ id: 'provider-2', name: 'Chicken breast product', protein: null, dataCompleteness: 'partial', source: { provider: 'usda', providerName: 'USDA', externalId: '2', retrievedAt: '2026-08-22T00:00:00Z' } });
    expect(dedupeFoods([exact, duplicate, partial])).toHaveLength(2);
    expect(rankFoods([partial, exact], 'chicken breast', createInitialData())[0].id).toBe(exact.id);
  });

  it('blocks incomplete foods from silently appearing as zero nutrition', () => {
    expect(foodQualityIssues(providerFood({ calories: null, protein: null }))).toContain('Calories missing');
    expect(foodQualityIssues(providerFood({ calories: null, protein: null }))).toContain('Protein missing');
  });
});
