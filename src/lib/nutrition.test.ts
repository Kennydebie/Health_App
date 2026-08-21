import { describe, expect, it } from 'vitest';
import { foodMap } from '../data/foods';
import { entryMacros, servingAmount } from './nutrition';

describe('nutrition calculations', () => {
  it('calculates 120 g and 180 g banana from the stored serving multiplier', () => {
    const banana = foodMap.get('banana')!;
    const first = { servingId: '100g', quantity: 1.2 };
    const edited = { servingId: '100g', quantity: 1.8 };

    expect(servingAmount(banana, first)).toBe(120);
    expect(Math.round(entryMacros(banana, first).calories)).toBe(107);
    expect(servingAmount(banana, edited)).toBe(180);
    expect(Math.round(entryMacros(banana, edited).calories)).toBe(160);
  });

  it('maps a medium banana to a realistic 118 g serving', () => {
    const banana = foodMap.get('banana')!;
    const entry = { servingId: 'medium', quantity: 1 };
    expect(servingAmount(banana, entry)).toBe(118);
    expect(Math.round(entryMacros(banana, entry).calories)).toBe(105);
  });
});
