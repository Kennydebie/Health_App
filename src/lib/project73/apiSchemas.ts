import { z } from 'zod';

const allergen = z.enum(['gluten', 'lactose', 'melk', 'ei', 'vis', 'schaaldieren', 'pinda', 'noten', 'soja', 'sesam', 'selderij', 'mosterd', 'sulfiet', 'lupine', 'weekdieren']);
const id = z.string().min(1).max(120).regex(/^[A-Za-z0-9_:.-]+$/);

export const requirementSchema = z.object({
  ingredientId: id,
  name: z.string().min(1).max(80),
  unit: z.enum(['g', 'ml', 'piece']),
  amount: z.number().nonnegative().max(100_000),
  pantryAmount: z.number().nonnegative().max(100_000),
  netAmount: z.number().nonnegative().max(100_000),
  staple: z.boolean(),
  meals: z.array(z.object({ mealId: id, date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), recipeName: z.string().max(120), amount: z.number().nonnegative() })).max(60),
});

export const prepareShoppingSchema = z.object({
  mealPlanId: id,
  requirements: z.array(requirementSchema).min(1).max(80),
  mode: z.enum(['balanced', 'cheapest']).default('balanced'),
  staplesAtHome: z.boolean(),
  allergens: z.array(allergen).max(15).default([]),
  budgetCents: z.number().int().nonnegative().max(1_000_000).nullable().default(null),
  /** Explicitly request demo data when no Picnic account is connected. */
  demo: z.boolean().default(false),
});

export const updateShoppingItemSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('select'), ingredientId: id, productId: id, count: z.number().int().min(1).max(30) }),
  z.object({ action: z.literal('remove'), ingredientId: id }),
  z.object({ action: z.literal('restore'), ingredientId: id }),
]);

export const loginSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(1).max(200),
});

export const verifyCodeSchema = z.object({ code: z.string().regex(/^\d{4,8}$/) });

export const cartPreviewSchema = z.object({ shoppingPlanId: id, countExistingItems: z.boolean().default(true) });
export const cartSyncSchema = cartPreviewSchema.extend({ idempotencyKey: z.string().regex(/^[a-f0-9]{16,64}$/), expectedVersion: z.number().int().positive() });

export const selectSlotSchema = z.object({ slotId: z.string().min(1).max(200) });

export const checkoutSettingsSchema = z.object({ checkoutEnabled: z.boolean() });

export const checkoutStartSchema = z.object({
  shoppingPlanId: id,
  idempotencyKey: z.string().regex(/^[a-f0-9-]{16,64}$/),
  reviewedTotalCents: z.number().int().positive().max(1_000_000),
  confirm: z.literal(true),
});

export const checkoutAttemptSchema = z.object({ attemptId: id });

export const deleteAccountSchema = z.object({ confirm: z.literal('VERWIJDER') });

export const assistantRequestSchema = z.object({
  message: z.string().min(1).max(600),
  context: z.object({
    today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    kcalTarget: z.number().positive().max(6000),
    proteinTarget: z.number().positive().max(400),
    horizonDays: z.number().int().min(1).max(14),
    pantry: z.array(z.string().max(60)).max(60),
    plannedRecipes: z.array(z.object({ mealId: id, date: z.string(), slot: z.string(), recipeName: z.string().max(120) })).max(60),
    availableRecipes: z.array(z.object({ id, name: z.string().max(120), slots: z.array(z.string()) })).max(200),
    weightTrend: z.string().max(400).optional(),
  }),
});
