/**
 * Project 73 domain types: metabolic settings, recipes, meal plans, pantry and grocery planning.
 * These live in the account payload (AppData v13) next to the existing Project 75 records.
 * Picnic credentials, cart operations and order attempts are server-only (see worker/project73).
 */

export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export type IngredientUnit = 'g' | 'ml' | 'piece';
export type CookingMethod = 'no_cook' | 'oven' | 'airfryer' | 'pan' | 'microwave' | 'stovetop';
export type GroceryCategory = 'zuivel' | 'vlees_vis' | 'eieren' | 'brood_granen' | 'groente' | 'fruit' | 'diepvries' | 'houdbaar' | 'smeersels' | 'kruiden_olie' | 'overig';

export type Allergen = 'gluten' | 'lactose' | 'melk' | 'ei' | 'vis' | 'schaaldieren' | 'pinda' | 'noten' | 'soja' | 'sesam' | 'selderij' | 'mosterd' | 'sulfiet' | 'lupine' | 'weekdieren';
export type DietTag = 'vlees' | 'vis' | 'gevogelte' | 'rund' | 'varken' | 'zuivel' | 'ei' | 'vegetarisch' | 'veganistisch';

export interface NutrientsPer100 {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
}

export interface NutritionTotals {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  fruitVegGrams: number;
}

export type NutritionSourceKind = 'reference_estimate' | 'picnic_product' | 'custom';

export interface Ingredient {
  id: string;
  name: string;
  category: GroceryCategory;
  /** The unit recipes use for this ingredient. */
  unit: IngredientUnit;
  /** Edible grams per piece (eggs, wraps, fruit). Required when unit is 'piece'; also converts piece-based packages. */
  gramsPerPiece?: number;
  /** Grams per millilitre for liquids, used to convert between g and ml packages. */
  densityGPerMl?: number;
  /** Usable fraction of a package's net weight (drained cans, peel). Defaults to 1. */
  packageYield?: number;
  /** Nutrition per 100 g (or 100 ml for liquids) of the edible, uncooked product. */
  per100: NutrientsPer100;
  nutritionSource: NutritionSourceKind;
  isFruitOrVegetable?: boolean;
  allergens: Allergen[];
  diet: DietTag[];
  /** Pantry staples (oil, spices) are only bought when the user says they are missing. */
  staple?: boolean;
  /** Rounding step for planned amounts in the ingredient unit. */
  roundTo: number;
  /** Typical days the opened product stays good; used for waste estimates. */
  shelfLifeDays: number;
  /** Search terms for supermarket matching, most specific first (Dutch). */
  searchTerms: string[];
  /** Product names must contain at least one of these (lowercase) to be a valid match. */
  matchAny?: string[];
  /** Product names containing any of these (lowercase) are rejected. */
  rejectAny?: string[];
  image?: string;
}

export interface RecipeIngredient {
  ingredientId: string;
  /** Amount for ONE serving in the ingredient's unit. */
  amount: number;
  /** Optional ingredients do not block planning and are listed separately. */
  optional?: boolean;
}

export interface Recipe {
  id: string;
  name: string;
  slots: MealSlot[];
  /** Active preparation minutes. */
  prepMinutes: number;
  /** Total minutes including oven/airfryer time. */
  totalMinutes: number;
  method: CookingMethod;
  ingredients: RecipeIngredient[];
  steps: string[];
  /** Can be cooked in a larger batch and eaten later as leftovers. */
  batchFriendly: boolean;
  tags: string[];
  image?: string;
  source: 'builtin' | 'custom' | 'ai';
  createdAt?: string;
}

export type PlannedMealStatus = 'planned' | 'eaten' | 'skipped' | 'replaced';

export interface PlannedMeal {
  id: string;
  date: string;
  slot: MealSlot;
  /** Order within the day (breakfast 0 … snacks 3+). */
  order: number;
  recipeId: string;
  /** Serving multiplier (1 = the recipe's standard serving). */
  servings: number;
  locked: boolean;
  /** When this meal is eaten from a batch cooked for another meal (leftovers). */
  leftoverOfMealId?: string;
  status: PlannedMealStatus;
  /** Fraction of the planned meal that was eaten (0.5 = half, 1.25 = larger). */
  eatenFactor?: number;
  eatenAt?: string;
  /** The food log entry that records the actual intake. */
  consumedFoodLogId?: string;
  replacementNote?: string;
  updatedAt: string;
}

export interface MealPlan {
  id: string;
  startDate: string;
  days: number;
  createdAt: string;
  updatedAt: string;
  generator: 'deterministic' | 'ai_assisted';
  seed: number;
  targets: { kcal: number; protein: number };
  status: 'active' | 'archived';
  meals: PlannedMeal[];
}

export interface PantryItem {
  id: string;
  ingredientId: string;
  amount: number;
  unit: IngredientUnit;
  updatedAt: string;
  note?: string;
}

export interface MetabolicSettings {
  version: 1;
  activityFactor: number;
  /** Desired timeframe in months to reach the target weight. */
  timeframeMonths: number;
  previousGoalWeightKg: number | null;
  /** Which forecast drives the calorie target suggestion. */
  pace: 'timeframe' | 'target';
  /** Desired weekly loss bounds in kg. */
  desiredLossKgPerWeek: [number, number];
  strengthSessionsPerWeek: number;
  primaryObjective: string;
  secondaryObjective: string;
  /** User overrides; null means "use the suggestion". */
  overrides: { kcal: number | null; protein: number | null; carbs: number | null; fat: number | null; fiber: number | null };
  updatedAt: string;
}

export interface PlanningPreferences {
  version: 1;
  horizonDays: number;
  maxPrepMinutes: number;
  household: number;
  snacksPerDay: 0 | 1 | 2;
  allowLeftovers: boolean;
  weeklyGroceryBudgetEur: number | null;
  preferredFoods: string[];
  allergens: Allergen[];
  /** Diet tags to avoid, e.g. ['varken'] or ['vlees', 'gevogelte', 'rund', 'varken'] for pescatarian. */
  dietaryRestrictions: DietTag[];
  dislikedIngredientIds: string[];
  /** Assume oil, salt, pepper and dried herbs are at home. */
  staplesAtHome: boolean;
  country: 'NL';
  supermarket: 'picnic';
  language: 'nl';
  currency: 'EUR';
  theme: 'system' | 'light' | 'dark';
}

export interface ShoppingStatusSummary {
  shoppingPlanId: string;
  mealPlanId: string;
  preparedAt: string;
  source: 'demo' | 'picnic';
  totalCents: number;
  consumedCostCents: number;
  itemCount: number;
  unavailableCount: number;
  cartSyncedAt?: string;
  order?: { status: 'handoff' | 'payment_pending' | 'confirmed' | 'failed'; updatedAt: string; orderId?: string };
}

export interface UpgradeNotice {
  fromVersion: number;
  at: string;
  changes: string[];
  /** Target suggestions the user still has to accept or reject (their own values were kept). */
  pendingTargets: { kcal: number; protein: number; carbs: number; fat: number } | null;
  dismissed: boolean;
}

export interface VerifiedNutrition {
  per100: NutrientsPer100;
  productName: string;
  productId: string;
  retrievedAt: string;
}

export interface Project73Data {
  upgradeNotice: UpgradeNotice | null;
  /** Nutrition labels of matched Picnic products, per ingredient. Replaces reference estimates. */
  verifiedNutrition: Record<string, VerifiedNutrition>;
  metabolicSettings: MetabolicSettings;
  planningPreferences: PlanningPreferences;
  mealPlans: MealPlan[];
  customRecipes: Recipe[];
  favoriteRecipeIds: string[];
  pantry: PantryItem[];
  shoppingStatus: ShoppingStatusSummary | null;
}
