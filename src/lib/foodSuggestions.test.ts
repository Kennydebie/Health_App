import { describe, expect, it } from 'vitest';
import { createSeedData } from '../data/seed';
import { suggestFoods } from './foodSuggestions';

describe('portion-aware food suggestions', () => {
  it('never exceeds the supplied calorie budget', () => {
    const suggestions = suggestFoods(createSeedData(), 350, 40);
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions.every((item) => item.macros.calories <= 351)).toBe(true);
  });

  it('returns no suggestion when the usable budget is tiny', () => {
    expect(suggestFoods(createSeedData(), 35, 25)).toEqual([]);
  });
});
