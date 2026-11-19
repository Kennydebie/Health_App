import type { Ingredient, IngredientUnit } from '../../types/project73';

export interface PackageQuantity {
  grams: number | null;
  ml: number | null;
  pieces: number | null;
  /** Number of identical sub-packages, e.g. 4 in "4 x 125 gram". */
  multipack: number;
  /** "ca. 400 gram": the weight varies per package. */
  variableWeight: boolean;
}

const UNIT_PATTERNS: Array<{ pattern: RegExp; kind: 'g' | 'ml' | 'piece'; factor: number }> = [
  { pattern: /^(kg|kilo|kilogram)$/, kind: 'g', factor: 1000 },
  { pattern: /^(g|gr|gram|grams)$/, kind: 'g', factor: 1 },
  { pattern: /^(l|liter|litre|ltr)$/, kind: 'ml', factor: 1000 },
  { pattern: /^(cl)$/, kind: 'ml', factor: 10 },
  { pattern: /^(ml|milliliter)$/, kind: 'ml', factor: 1 },
  { pattern: /^(st|st\.|stuk|stuks|stk|eieren|wraps|plakken|sneetjes|rollen|zakjes|blikken|bakjes|potten|flessen)$/, kind: 'piece', factor: 1 },
];

function parseNumber(value: string) {
  return Number(value.replace(',', '.'));
}

/**
 * Parses Picnic-style package texts such as "500 gram", "4 x 125 gram", "1,5 liter", "6 stuks",
 * "ca. 400 gram" or "10 stuks, 620 gram". Returns null when no quantity is recognised.
 */
export function parsePackageSize(text: string | null | undefined): PackageQuantity | null {
  if (!text) return null;
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').replace(/×/g, 'x').trim();
  const result: PackageQuantity = { grams: null, ml: null, pieces: null, multipack: 1, variableWeight: /(^|\s)(ca\.?|circa|±|\+\/-|gemiddeld|per kilo)(\s|$)/.test(normalized) };
  const parts = normalized.split(/,(?=\s*\D)|•|·|\|/).map((part) => part.trim()).filter(Boolean);
  let found = false;
  for (const part of parts) {
    const multi = /(\d+(?:[.,]\d+)?)\s*x\s*(\d+(?:[.,]\d+)?)\s*([a-z.]+)/.exec(part);
    if (multi) {
      const count = parseNumber(multi[1]);
      const size = parseNumber(multi[2]);
      const unit = UNIT_PATTERNS.find((item) => item.pattern.test(multi[3]));
      if (unit && count > 0 && size > 0) {
        found = true;
        result.multipack = count;
        if (unit.kind === 'g') result.grams = (result.grams ?? 0) + count * size * unit.factor;
        else if (unit.kind === 'ml') result.ml = (result.ml ?? 0) + count * size * unit.factor;
        else result.pieces = (result.pieces ?? 0) + count * size;
        continue;
      }
    }
    if (/^per stuk$/.test(part)) {
      found = true;
      result.pieces = result.pieces ?? 1;
      continue;
    }
    const single = /(\d+(?:[.,]\d+)?)\s*([a-z.]+)/.exec(part);
    if (!single) continue;
    const unit = UNIT_PATTERNS.find((item) => item.pattern.test(single[2]));
    if (!unit) continue;
    const value = parseNumber(single[1]) * unit.factor;
    if (!(value > 0)) continue;
    found = true;
    if (unit.kind === 'g' && result.grams == null) result.grams = value;
    else if (unit.kind === 'ml' && result.ml == null) result.ml = value;
    else if (unit.kind === 'piece' && result.pieces == null) result.pieces = value;
  }
  return found ? result : null;
}

/**
 * Usable amount of one package, expressed in the ingredient's own unit. Applies package yield
 * (drained cans) and converts between grams, millilitres and pieces where the ingredient allows.
 */
export function packageCoverage(pkg: PackageQuantity, ingredient: Pick<Ingredient, 'unit' | 'gramsPerPiece' | 'densityGPerMl' | 'packageYield'>): number | null {
  const yieldFactor = ingredient.packageYield ?? 1;
  if (ingredient.unit === 'g') {
    const grams = pkg.grams
      ?? (pkg.ml != null && ingredient.densityGPerMl ? pkg.ml * ingredient.densityGPerMl : null)
      ?? (pkg.ml != null ? pkg.ml : null)
      ?? (pkg.pieces != null && ingredient.gramsPerPiece ? pkg.pieces * ingredient.gramsPerPiece : null);
    return grams == null ? null : grams * yieldFactor;
  }
  if (ingredient.unit === 'ml') {
    const ml = pkg.ml ?? (pkg.grams != null ? pkg.grams / (ingredient.densityGPerMl ?? 1) : null);
    return ml == null ? null : ml * yieldFactor;
  }
  if (pkg.pieces != null) return pkg.pieces;
  if (pkg.grams != null && ingredient.gramsPerPiece) return Math.floor((pkg.grams * yieldFactor) / ingredient.gramsPerPiece);
  return null;
}

/** Converts an amount between units for one ingredient. Returns null when not convertible. */
export function convertAmount(amount: number, from: IngredientUnit, to: IngredientUnit, ingredient: Pick<Ingredient, 'gramsPerPiece' | 'densityGPerMl'>): number | null {
  if (from === to) return amount;
  const density = ingredient.densityGPerMl ?? 1;
  const toGrams = from === 'g' ? amount : from === 'ml' ? amount * density : ingredient.gramsPerPiece ? amount * ingredient.gramsPerPiece : null;
  if (toGrams == null) return null;
  if (to === 'g') return toGrams;
  if (to === 'ml') return toGrams / density;
  return ingredient.gramsPerPiece ? toGrams / ingredient.gramsPerPiece : null;
}

export function describeQuantity(amount: number, unit: IngredientUnit) {
  if (unit === 'piece') return `${amount.toLocaleString('nl-NL', { maximumFractionDigits: 1 })} st.`;
  if (unit === 'g' && amount >= 1000) return `${(amount / 1000).toLocaleString('nl-NL', { maximumFractionDigits: 2 })} kg`;
  if (unit === 'ml' && amount >= 1000) return `${(amount / 1000).toLocaleString('nl-NL', { maximumFractionDigits: 2 })} l`;
  return `${Math.round(amount).toLocaleString('nl-NL')} ${unit}`;
}
