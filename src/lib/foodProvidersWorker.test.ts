import { describe, expect, it } from 'vitest';
import { normalizeOff, normalizeUsda } from '../../worker/foodProviders';

describe('food provider normalization', () => {
  it('converts kJ to kcal only when an explicit kcal value is absent', () => {
    const food = normalizeOff({ code: '12345678', product_name: 'Reference food', nutriments: { 'energy-kj_100g': 418.4, proteins_100g: 10, carbohydrates_100g: 20, fat_100g: 5 } }, '2026-08-22T00:00:00Z');
    const kcalFood = normalizeOff({ code: '87654321', product_name: 'Kcal food', nutriments: { 'energy-kcal_100g': 120, 'energy-kj_100g': 999, proteins_100g: 10, carbohydrates_100g: 20, fat_100g: 5 } }, '2026-08-22T00:00:00Z');
    expect(food?.calories).toBeCloseTo(100);
    expect(kcalFood?.calories).toBe(120);
  });

  it('keeps sodium separate and labels salt derived from sodium', () => {
    const food = normalizeOff({ code: '12345678', product_name: 'Reference food', nutriments: { 'energy-kcal_100g': 100, proteins_100g: 10, carbohydrates_100g: 20, fat_100g: 5, sodium_100g: .4 } }, '2026-08-22T00:00:00Z');
    expect(food).toMatchObject({ sodium: .4, salt: 1, saltDerivedFromSodium: true });
  });

  it('preserves missing values instead of silently treating them as zero', () => {
    const food = normalizeUsda({ fdcId: 1, description: 'Incomplete food', foodNutrients: [{ nutrientName: 'Protein', unitName: 'G', value: 4 }] }, '2026-08-22T00:00:00Z');
    expect(food).toMatchObject({ calories: null, protein: 4, carbs: null, fat: null, dataCompleteness: 'partial' });
  });
});
