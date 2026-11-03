import type { Allergen, Ingredient, MealPlan, PantryItem, Recipe } from '../../types/project73';
import type { IngredientRequirement, ProductCandidate, ProductDetails, RankedCandidate, ShoppingItem, ShoppingPlan, ShoppingTotals } from '../../types/shopping';
import { scaleRecipe, type IngredientLookup } from './recipeMath';
import { convertAmount, packageCoverage, parsePackageSize } from './units';

export interface RequirementOptions {
  fromDate: string;
  staplesAtHome: boolean;
}

/** Sums ingredient amounts over all planned (not yet eaten) meals from `fromDate`. */
export function consolidateRequirements(plan: MealPlan, recipes: Map<string, Recipe>, lookup: IngredientLookup, pantry: PantryItem[], options: RequirementOptions): IngredientRequirement[] {
  const byIngredient = new Map<string, IngredientRequirement>();
  for (const meal of plan.meals) {
    if (meal.status !== 'planned' || meal.date < options.fromDate) continue;
    const recipe = recipes.get(meal.recipeId);
    if (!recipe) continue;
    for (const item of scaleRecipe(recipe, meal.servings, lookup)) {
      if (item.optional) continue;
      const existing = byIngredient.get(item.ingredient.id) ?? {
        ingredientId: item.ingredient.id,
        name: item.ingredient.name,
        unit: item.ingredient.unit,
        amount: 0,
        pantryAmount: 0,
        netAmount: 0,
        staple: Boolean(item.ingredient.staple),
        meals: [],
      };
      existing.amount += item.amount;
      existing.meals.push({ mealId: meal.id, date: meal.date, recipeName: recipe.name, amount: item.amount });
      byIngredient.set(item.ingredient.id, existing);
    }
  }
  return [...byIngredient.values()].map((requirement) => {
    const ingredient = lookup(requirement.ingredientId);
    const inPantry = pantry
      .filter((item) => item.ingredientId === requirement.ingredientId)
      .reduce((sum, item) => sum + (ingredient ? convertAmount(item.amount, item.unit, requirement.unit, ingredient) ?? 0 : 0), 0);
    const pantryAmount = Math.min(requirement.amount, inPantry);
    const amount = Number(requirement.amount.toFixed(2));
    return { ...requirement, amount, pantryAmount: Number(pantryAmount.toFixed(2)), netAmount: Number(Math.max(0, amount - pantryAmount).toFixed(2)) };
  }).sort((a, b) => (lookup(a.ingredientId)?.category ?? '').localeCompare(lookup(b.ingredientId)?.category ?? '') || a.name.localeCompare(b.name, 'nl'));
}

export function normalizeText(value: string) {
  return value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
}

function tokens(value: string) {
  return normalizeText(value).split(/[^a-z0-9+']+/).filter(Boolean);
}

export function termMatches(name: string, term: string) {
  const normalizedName = normalizeText(name);
  const normalizedTerm = normalizeText(term);
  if (normalizedTerm.includes(' ') || /[^a-z0-9]/.test(normalizedTerm)) return normalizedName.includes(normalizedTerm);
  return tokens(name).some((token) => token === normalizedTerm
    || (normalizedTerm.length <= 3 ? token === `${normalizedTerm}en` || token === `${normalizedTerm}s` : token.startsWith(normalizedTerm)));
}

/** Allergen names as Picnic shows them (Dutch), mapped to the app's allergen keys. */
const ALLERGEN_WORDS: Record<Allergen, string[]> = {
  gluten: ['gluten', 'tarwe', 'rogge', 'gerst', 'spelt', 'haver'],
  lactose: ['lactose'],
  melk: ['melk', 'lactose'],
  ei: ['ei', 'eieren'],
  vis: ['vis'],
  schaaldieren: ['schaaldieren', 'garnaal', 'kreeft', 'krab'],
  pinda: ['pinda', "pinda's", 'aardnoten'],
  noten: ['noten', 'amandel', 'hazelnoot', 'walnoot', 'cashew', 'pecan', 'pistache'],
  soja: ['soja'],
  sesam: ['sesam'],
  selderij: ['selderij'],
  mosterd: ['mosterd'],
  sulfiet: ['sulfiet', 'zwaveldioxide'],
  lupine: ['lupine'],
  weekdieren: ['weekdieren', 'mossel', 'oester', 'inktvis'],
};

export function conflictingAllergens(details: Pick<ProductDetails, 'allergensContains'> | null | undefined, avoid: Allergen[]): Allergen[] {
  if (!details || !avoid.length) return [];
  const listed = details.allergensContains.map(normalizeText).join(' | ');
  return avoid.filter((allergen) => ALLERGEN_WORDS[allergen].some((word) => termMatches(listed, word)));
}

export function isAcceptableProduct(ingredient: Ingredient, product: Pick<ProductCandidate, 'name' | 'brand'>) {
  const name = `${product.name}`;
  if (ingredient.rejectAny?.some((term) => termMatches(name, term))) return false;
  if (ingredient.matchAny?.length && !ingredient.matchAny.some((term) => termMatches(name, term))) return false;
  return true;
}

/** Filters and scores search results for one ingredient. Only real search results are ranked. */
export function rankCandidates(ingredient: Ingredient, products: ProductCandidate[], netAmount: number): RankedCandidate[] {
  const ranked: RankedCandidate[] = [];
  for (const product of products) {
    if (!isAcceptableProduct(ingredient, product)) continue;
    const pkg = parsePackageSize(product.unitQuantity);
    const coverage = pkg ? packageCoverage(pkg, ingredient) : null;
    if (!coverage || coverage <= 0 || product.priceCents <= 0) continue;
    const reasons: string[] = [];
    let score = 0;
    const name = normalizeText(`${product.brand ?? ''} ${product.name}`);
    if (ingredient.searchTerms[0] && name.includes(normalizeText(ingredient.searchTerms[0]))) { score += 3; reasons.push('Past precies bij het ingrediënt'); }
    else if (ingredient.searchTerms.some((term) => name.includes(normalizeText(term)))) score += 1.5;
    if (product.boughtBefore) { score += 1.5; reasons.push('Eerder door jou gekocht'); }
    const need = Math.max(netAmount, ingredient.roundTo);
    const count = Math.max(1, Math.ceil(need / coverage - 1e-9));
    const surplusFraction = (count * coverage - need) / (count * coverage);
    score -= surplusFraction * 1.5;
    if (surplusFraction < 0.15) reasons.push('Weinig over na je plan');
    if (product.promoLabel) { score += 0.2; reasons.push(product.promoLabel); }
    if (pkg?.variableWeight) score -= 0.2;
    ranked.push({ product, coverage, score, reasons });
  }
  const unitPrices = ranked.map((item) => item.product.priceCents / item.coverage);
  const cheapest = Math.min(...unitPrices);
  return ranked
    .map((item, index) => {
      const relative = unitPrices[index] / cheapest - 1;
      const priceScore = -Math.min(2, relative);
      return { ...item, score: item.score + priceScore, reasons: relative < 0.05 ? [...item.reasons, 'Laagste prijs per eenheid'] : item.reasons };
    })
    .sort((a, b) => Number(a.product.isUnavailable) - Number(b.product.isUnavailable) || b.score - a.score);
}

export interface PackageChoice {
  lines: Array<{ candidate: RankedCandidate; count: number }>;
  purchased: number;
  costCents: number;
}

/**
 * Picks package counts that cover `need` at the lowest cost, penalising perishable surplus.
 * One 500 g pack covers 450 g; it never buys one pack per meal.
 */
export function choosePackages(need: number, options: RankedCandidate[], perishable: boolean, maxPerProduct = 12): PackageChoice | null {
  const available = options.filter((option) => !option.product.isUnavailable);
  if (need <= 0 || !available.length) return null;
  let best: (PackageChoice & { objective: number }) | null = null;
  const consider = (lines: Array<{ candidate: RankedCandidate; count: number }>) => {
    const purchased = lines.reduce((sum, line) => sum + line.count * line.candidate.coverage, 0);
    if (purchased + 1e-9 < need) return;
    if (lines.some((line) => line.count > Math.min(maxPerProduct, line.candidate.product.maxCount || maxPerProduct))) return;
    const costCents = lines.reduce((sum, line) => sum + line.count * line.candidate.product.priceCents, 0);
    const surplusValue = lines.reduce((sum, line) => sum + (line.candidate.product.priceCents / line.candidate.coverage), 0) / lines.length * (purchased - need);
    const objective = costCents + (perishable ? surplusValue * 0.5 : surplusValue * 0.1) + (lines.length - 1) * 15;
    if (!best || objective < best.objective - 1e-6) best = { lines, purchased, costCents, objective };
  };
  for (const option of available) {
    consider([{ candidate: option, count: Math.max(1, Math.ceil(need / option.coverage - 1e-9)) }]);
  }
  for (let i = 0; i < available.length; i += 1) {
    for (let j = 0; j < available.length; j += 1) {
      if (i === j || available[i].coverage <= available[j].coverage) continue;
      const big = available[i];
      const small = available[j];
      for (let bigCount = 1; bigCount <= 4; bigCount += 1) {
        const rest = need - bigCount * big.coverage;
        if (rest <= 0) break;
        consider([{ candidate: big, count: bigCount }, { candidate: small, count: Math.ceil(rest / small.coverage - 1e-9) }]);
      }
    }
  }
  if (!best) return null;
  const { objective: _objective, ...choice } = best as PackageChoice & { objective: number };
  void _objective;
  return choice;
}

export interface ShoppingItemInput {
  requirement: IngredientRequirement;
  ingredient: Ingredient;
  candidates: ProductCandidate[] | null;
  staplesAtHome: boolean;
  mode: 'balanced' | 'cheapest';
  details?: ProductDetails | null;
}

export function buildShoppingItem({ requirement, ingredient, candidates, staplesAtHome, mode, details }: ShoppingItemInput): ShoppingItem {
  const base: ShoppingItem = {
    ingredientId: requirement.ingredientId,
    name: requirement.name,
    unit: requirement.unit,
    neededAmount: requirement.amount,
    pantryAmount: requirement.pantryAmount,
    netAmount: requirement.netAmount,
    status: 'matched',
    lines: [],
    alternatives: [],
    purchasedAmount: 0,
    surplusAmount: 0,
    costCents: 0,
    consumedCostCents: 0,
    wasteRisk: 'none',
    manual: false,
    nutritionVerified: Boolean(details?.nutritionPer100),
    meals: requirement.meals,
  };
  if (requirement.staple && staplesAtHome) return { ...base, status: 'staple_at_home', note: 'Basisvoorraad: je gaf aan dat je dit in huis hebt.' };
  if (requirement.netAmount <= 0) return { ...base, status: 'covered_by_pantry', note: 'Genoeg in je voorraad.' };
  if (candidates == null) return { ...base, status: 'search_failed', note: 'Zoeken bij de supermarkt mislukte. Probeer het opnieuw.' };
  const ranked = rankCandidates(ingredient, candidates, requirement.netAmount);
  if (!ranked.length) return { ...base, status: 'no_match', note: 'Geen passend product gevonden.' };
  const availableRanked = ranked.filter((item) => !item.product.isUnavailable);
  if (!availableRanked.length) return { ...base, status: 'unavailable', alternatives: ranked.slice(0, 5), note: 'Alle passende producten zijn nu niet leverbaar.' };
  const topScore = availableRanked[0].score;
  const options = mode === 'cheapest' ? availableRanked.slice(0, 8) : availableRanked.filter((item) => item.score >= topScore - 1).slice(0, 3);
  const perishable = ingredient.shelfLifeDays <= 7;
  const choice = choosePackages(requirement.netAmount, options, perishable);
  if (!choice) return { ...base, status: 'unavailable', alternatives: ranked.slice(0, 5), note: 'Benodigde hoeveelheid is niet te bestellen.' };
  return finalizeItem({ ...base, alternatives: ranked.slice(0, 6) }, choice.lines.map((line) => ({ product: line.candidate.product, count: line.count, coverage: line.candidate.coverage })), ingredient);
}

/** Recomputes cost, surplus and waste for an item with chosen package lines. */
export function finalizeItem(item: ShoppingItem, lines: ShoppingItem['lines'], ingredient: Pick<Ingredient, 'shelfLifeDays' | 'roundTo'>): ShoppingItem {
  const purchasedAmount = lines.reduce((sum, line) => sum + line.count * line.coverage, 0);
  const costCents = lines.reduce((sum, line) => sum + line.count * line.product.priceCents, 0);
  const surplusAmount = Math.max(0, purchasedAmount - item.netAmount);
  const usedFraction = purchasedAmount > 0 ? Math.min(1, item.netAmount / purchasedAmount) : 0;
  const perishable = ingredient.shelfLifeDays <= 7;
  const surplusShare = purchasedAmount > 0 ? surplusAmount / purchasedAmount : 0;
  const wasteRisk: ShoppingItem['wasteRisk'] = !perishable || surplusAmount <= ingredient.roundTo ? 'none' : surplusShare >= 0.3 ? 'high' : 'low';
  const status = lines.length ? 'matched' : item.status === 'matched' ? 'removed' : item.status;
  return { ...item, status, lines, purchasedAmount, surplusAmount, costCents, consumedCostCents: Math.round(costCents * usedFraction), wasteRisk };
}

export function shoppingTotals(items: ShoppingItem[]): ShoppingTotals {
  const active = items.filter((item) => item.status === 'matched');
  const costCents = active.reduce((sum, item) => sum + item.costCents, 0);
  const consumedCostCents = active.reduce((sum, item) => sum + item.consumedCostCents, 0);
  return {
    costCents,
    consumedCostCents,
    surplusCostCents: costCents - consumedCostCents,
    itemCount: active.length,
    packageCount: active.reduce((sum, item) => sum + item.lines.reduce((lineSum, line) => lineSum + line.count, 0), 0),
    unavailableCount: items.filter((item) => item.status === 'unavailable').length,
    noMatchCount: items.filter((item) => item.status === 'no_match' || item.status === 'search_failed').length,
  };
}

/** Desired cart counts per product for a shopping plan. */
export function desiredCartLines(plan: Pick<ShoppingPlan, 'items'>) {
  const lines = new Map<string, { productId: string; name: string; count: number; priceCents: number }>();
  for (const item of plan.items) {
    if (item.status !== 'matched') continue;
    for (const line of item.lines) {
      const current = lines.get(line.product.productId);
      lines.set(line.product.productId, { productId: line.product.productId, name: line.product.name, priceCents: line.product.priceCents, count: (current?.count ?? 0) + line.count });
    }
  }
  return [...lines.values()];
}

export function formatEuro(cents: number) {
  return (cents / 100).toLocaleString('nl-NL', { style: 'currency', currency: 'EUR' });
}
