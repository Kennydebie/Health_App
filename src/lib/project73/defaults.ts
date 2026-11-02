import type { PlanningPreferences, Project73Data } from '../../types/project73';
import { DEFAULT_METABOLIC_SETTINGS } from './metabolism';

export const DEFAULT_PLANNING_PREFERENCES: PlanningPreferences = {
  version: 1,
  horizonDays: 3,
  maxPrepMinutes: 20,
  household: 1,
  snacksPerDay: 2,
  allowLeftovers: true,
  weeklyGroceryBudgetEur: 60,
  preferredFoods: ['Eieren', 'Kip', 'Zalm', 'Mager rundergehakt', 'Skyr en magere kwark', 'Havermout', 'Rijst en pasta', 'Volkoren wraps', 'Broccoli en bimi', 'Groente en fruit', 'Hummus en tzatziki', 'Oven- en airfryermaaltijden'],
  allergens: [],
  dietaryRestrictions: [],
  dislikedIngredientIds: [],
  staplesAtHome: true,
  country: 'NL',
  supermarket: 'picnic',
  language: 'nl',
  currency: 'EUR',
  theme: 'system',
};

export function createProject73Defaults(now = new Date().toISOString()): Project73Data {
  return {
    upgradeNotice: null,
    metabolicSettings: { ...structuredClone(DEFAULT_METABOLIC_SETTINGS), updatedAt: now },
    planningPreferences: structuredClone(DEFAULT_PLANNING_PREFERENCES),
    mealPlans: [],
    customRecipes: [],
    favoriteRecipeIds: [],
    pantry: [],
    shoppingStatus: null,
  };
}
