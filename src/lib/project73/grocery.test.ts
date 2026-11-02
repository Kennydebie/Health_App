import { describe, expect, it } from 'vitest';
import { getIngredient } from '../../data/project73/ingredients';
import type { MealPlan, Recipe } from '../../types/project73';
import type { CartLine, ProductCandidate } from '../../types/shopping';
import { buildShoppingItem, choosePackages, consolidateRequirements, rankCandidates, termMatches } from './grocery';
import { convertAmount, packageCoverage, parsePackageSize } from './units';
import { mealNutrition, roundAmount, scaleRecipe } from './recipeMath';
import { computeCartDiff, verifyCart } from './cartSync';

const lookup = getIngredient;

function product(productId: string, name: string, unitQuantity: string, priceCents: number, extra: Partial<ProductCandidate> = {}): ProductCandidate {
  return { productId, name, brand: null, unitQuantity, priceCents, originalPriceCents: null, unitPriceText: null, imageUrl: null, isUnavailable: false, maxCount: 50, boughtBefore: false, promoLabel: null, source: 'demo', ...extra };
}

const chickenRecipe: Recipe = { id: 'test_chicken', name: 'Kip test', slots: ['dinner'], prepMinutes: 5, totalMinutes: 10, method: 'pan', batchFriendly: false, tags: [], source: 'custom', steps: [], ingredients: [{ ingredientId: 'kipfilet', amount: 150 }, { ingredientId: 'olijfolie', amount: 5 }] };

function planWith(meals: Array<{ date: string; servings?: number; status?: 'planned' | 'eaten' }>): MealPlan {
  return {
    id: 'plan', startDate: '2026-11-02', days: 3, createdAt: '', updatedAt: '', generator: 'deterministic', seed: 1, targets: { kcal: 1800, protein: 140 }, status: 'active',
    meals: meals.map((meal, index) => ({ id: `m${index}`, date: meal.date, slot: 'dinner', order: 2, recipeId: chickenRecipe.id, servings: meal.servings ?? 1, locked: false, status: meal.status ?? 'planned', updatedAt: '' })),
  };
}

describe('unit conversion and package parsing', () => {
  it('parses common Picnic package texts', () => {
    expect(parsePackageSize('500 gram')).toMatchObject({ grams: 500, multipack: 1 });
    expect(parsePackageSize('1 kg')?.grams).toBe(1000);
    expect(parsePackageSize('1,5 liter')?.ml).toBe(1500);
    expect(parsePackageSize('4 x 125 gram')).toMatchObject({ grams: 500, multipack: 4 });
    expect(parsePackageSize('6 x 330 ml')?.ml).toBe(1980);
    expect(parsePackageSize('10 stuks')?.pieces).toBe(10);
    expect(parsePackageSize('ca. 400 gram')).toMatchObject({ grams: 400, variableWeight: true });
    expect(parsePackageSize('6 stuks, 370 gram')).toMatchObject({ pieces: 6, grams: 370 });
    expect(parsePackageSize('per stuk')?.pieces).toBe(1);
    expect(parsePackageSize('1.5 liter, In prijs verlaagd')?.ml).toBe(1500);
    expect(parsePackageSize('heerlijk vers')).toBeNull();
  });

  it('converts package sizes into the ingredient unit', () => {
    const eggs = lookup('eieren')!;
    expect(packageCoverage(parsePackageSize('10 stuks')!, eggs)).toBe(10);
    const wraps = lookup('volkoren_wraps')!;
    expect(packageCoverage(parsePackageSize('6 stuks, 370 gram')!, wraps)).toBe(6);
    const tuna = lookup('tonijn')!;
    expect(packageCoverage(parsePackageSize('3 x 145 gram')!, tuna)).toBeCloseTo(435 * 0.77, 1);
    const milk = lookup('halfvolle_melk')!;
    expect(packageCoverage(parsePackageSize('1 liter')!, milk)).toBe(1000);
    const paprika = lookup('paprika')!;
    expect(packageCoverage(parsePackageSize('3 stuks')!, paprika)).toBe(480);
    expect(convertAmount(2, 'piece', 'g', eggs)).toBe(104);
    expect(convertAmount(103, 'g', 'ml', milk)).toBeCloseTo(100, 5);
    expect(convertAmount(100, 'g', 'piece', { gramsPerPiece: undefined })).toBeNull();
  });
});

describe('recipe scaling', () => {
  it('rounds to practical kitchen units', () => {
    expect(roundAmount(3.75, 1)).toBe(4);
    expect(roundAmount(152, 5)).toBe(150);
    expect(roundAmount(0.2, 1)).toBe(1);
    const scaled = scaleRecipe({ ...chickenRecipe, ingredients: [{ ingredientId: 'eieren', amount: 3 }, { ingredientId: 'kipfilet', amount: 125 }] }, 1.3, lookup);
    expect(scaled.map((item) => item.amount)).toEqual([4, 165]);
  });

  it('calculates nutrition from ingredient data and flags estimates', () => {
    const nutrition = mealNutrition(chickenRecipe, 1, lookup);
    expect(nutrition.totals.kcal).toBeCloseTo(150 * 1.07 + 5 * 8.84, 1);
    expect(nutrition.totals.protein).toBeCloseTo(35.4, 1);
    expect(nutrition.hasEstimates).toBe(true);
    const verified = mealNutrition(chickenRecipe, 1, lookup, { kipfilet: { kcal: 100, protein: 24, carbs: 0, fat: 1, fiber: 0 }, olijfolie: { kcal: 884, protein: 0, carbs: 0, fat: 100, fiber: 0 } });
    expect(verified.hasEstimates).toBe(false);
    expect(verified.totals.protein).toBeCloseTo(36, 5);
  });
});

describe('grocery consolidation and package rounding', () => {
  const recipes = new Map([[chickenRecipe.id, chickenRecipe]]);

  it('buys one 500 g pack for 450 g of chicken across three meals', () => {
    const requirements = consolidateRequirements(planWith([{ date: '2026-11-02' }, { date: '2026-11-03' }, { date: '2026-11-04' }]), recipes, lookup, [], { fromDate: '2026-11-02', staplesAtHome: true });
    const chicken = requirements.find((item) => item.ingredientId === 'kipfilet')!;
    expect(chicken.amount).toBe(450);
    expect(chicken.meals).toHaveLength(3);
    const item = buildShoppingItem({ requirement: chicken, ingredient: lookup('kipfilet')!, candidates: [product('s1', 'Kipfilet', '500 gram', 699)], staplesAtHome: true, mode: 'balanced' });
    expect(item.lines).toHaveLength(1);
    expect(item.lines[0].count).toBe(1);
    expect(item.surplusAmount).toBe(50);
    expect(item.consumedCostCents).toBe(Math.round(699 * 0.9));
  });

  it('skips eaten and past meals and subtracts the pantry', () => {
    const requirements = consolidateRequirements(planWith([{ date: '2026-11-01' }, { date: '2026-11-02', status: 'eaten' }, { date: '2026-11-03' }]), recipes, lookup, [{ id: 'p', ingredientId: 'kipfilet', amount: 100, unit: 'g', updatedAt: '' }], { fromDate: '2026-11-02', staplesAtHome: true });
    const chicken = requirements.find((item) => item.ingredientId === 'kipfilet')!;
    expect(chicken.amount).toBe(150);
    expect(chicken.pantryAmount).toBe(100);
    expect(chicken.netAmount).toBe(50);
  });

  it('does not buy staples when they are at home or items fully covered by the pantry', () => {
    const requirements = consolidateRequirements(planWith([{ date: '2026-11-02' }]), recipes, lookup, [{ id: 'p', ingredientId: 'kipfilet', amount: 1, unit: 'g', updatedAt: '' }], { fromDate: '2026-11-02', staplesAtHome: true });
    const oil = requirements.find((item) => item.ingredientId === 'olijfolie')!;
    expect(buildShoppingItem({ requirement: oil, ingredient: lookup('olijfolie')!, candidates: [], staplesAtHome: true, mode: 'balanced' }).status).toBe('staple_at_home');
    const covered = buildShoppingItem({ requirement: { ...oil, staple: false, netAmount: 0 }, ingredient: lookup('olijfolie')!, candidates: [], staplesAtHome: true, mode: 'balanced' });
    expect(covered.status).toBe('covered_by_pantry');
  });

  it('chooses the cheapest combination with the least waste', () => {
    const ranked = rankCandidates(lookup('kipfilet')!, [product('small', 'Kipfilet', '500 gram', 650), product('big', 'Kipfilet', '1 kg', 1150)], 900);
    const choice = choosePackages(900, ranked, true)!;
    expect(choice.lines).toHaveLength(1);
    expect(choice.lines[0].candidate.product.productId).toBe('big');
    const mixed = choosePackages(1200, ranked, true)!;
    expect(mixed.lines.map((line) => `${line.candidate.product.productId}x${line.count}`).sort()).toEqual(['bigx1', 'smallx1']);
  });

  it('rejects products that do not fit the ingredient', () => {
    const ranked = rankCandidates(lookup('kipfilet')!, [product('a', 'Gerookte kipfilet', '150 gram', 299), product('b', 'Kipfilet naturel', '300 gram', 450), product('c', 'Kip shoarma', '400 gram', 499)], 300);
    expect(ranked.map((item) => item.product.productId)).toEqual(['b']);
    expect(termMatches('Uien 1 kg', 'ui')).toBe(true);
    expect(termMatches('Fruitsalade', 'ui')).toBe(false);
    expect(rankCandidates(lookup('eieren')!, [product('e1', 'Eierkoeken', '6 stuks', 199), product('e2', 'Scharreleieren M', '10 stuks', 349)], 6).map((item) => item.product.productId)).toEqual(['e2']);
  });

  it('marks unavailable matches and offers them as alternatives', () => {
    const requirement = { ingredientId: 'zalmfilet', name: 'Zalmfilet', unit: 'g' as const, amount: 250, pantryAmount: 0, netAmount: 250, staple: false, meals: [] };
    const item = buildShoppingItem({ requirement, ingredient: lookup('zalmfilet')!, candidates: [product('z', 'Zalmfilet', '2 x 125 gram', 699, { isUnavailable: true })], staplesAtHome: true, mode: 'balanced' });
    expect(item.status).toBe('unavailable');
    expect(item.alternatives).toHaveLength(1);
    expect(buildShoppingItem({ requirement, ingredient: lookup('zalmfilet')!, candidates: null, staplesAtHome: true, mode: 'balanced' }).status).toBe('search_failed');
  });
});

describe('cart synchronisation', () => {
  const desired = [{ productId: 's1', name: 'Kipfilet', count: 1 }, { productId: 's2', name: 'Skyr', count: 2 }];

  it('adds only what is missing and leaves unrelated items alone', () => {
    const cart: CartLine[] = [{ productId: 'x', name: 'Koffie', count: 1, priceCents: 500 }, { productId: 's2', name: 'Skyr', count: 1, priceCents: 199 }];
    const diff = computeCartDiff(cart, desired, {});
    expect(diff.untouched.map((line) => line.productId)).toEqual(['x']);
    expect(diff.operations).toEqual([
      { productId: 's1', name: 'Kipfilet', action: 'add', count: 1, fromCount: 0, toCount: 1 },
      { productId: 's2', name: 'Skyr', action: 'add', count: 1, fromCount: 1, toCount: 2 },
    ]);
    expect(diff.alreadyInCart).toEqual([{ productId: 's2', name: 'Skyr', count: 1 }]);
    expect(diff.appliedAfter).toEqual({ s1: 1, s2: 1 });
  });

  it('is idempotent: syncing twice changes nothing the second time', () => {
    const cart: CartLine[] = [{ productId: 'x', name: 'Koffie', count: 1, priceCents: 500 }];
    const first = computeCartDiff(cart, desired, {});
    const afterFirst: CartLine[] = [...cart, { productId: 's1', name: 'Kipfilet', count: 1, priceCents: 699 }, { productId: 's2', name: 'Skyr', count: 2, priceCents: 199 }];
    expect(verifyCart(afterFirst, first.targetCounts)).toEqual([]);
    const second = computeCartDiff(afterFirst, desired, first.appliedAfter);
    expect(second.operations).toEqual([]);
  });

  it('only removes units this app added', () => {
    const cart: CartLine[] = [{ productId: 's1', name: 'Kipfilet', count: 3, priceCents: 699 }];
    const diff = computeCartDiff(cart, [], { s1: 1 });
    expect(diff.operations).toEqual([{ productId: 's1', name: 'Kipfilet', action: 'remove', count: 1, fromCount: 3, toCount: 2 }]);
  });

  it('can add on top of existing items when asked', () => {
    const cart: CartLine[] = [{ productId: 's2', name: 'Skyr', count: 1, priceCents: 199 }];
    const diff = computeCartDiff(cart, desired, {}, { countExistingItems: false });
    expect(diff.targetCounts.s2).toBe(3);
  });
});
