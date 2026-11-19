# Project 73 architecture

This note explains how the Project 73 features fit into the existing Project 75 app.

## Decisions

| Topic | Decision | Why |
| --- | --- | --- |
| Framework | Keep React + Vite + Cloudflare Worker + D1 on OpenAI Sites (no Next.js/Prisma/Postgres). | A deployed app with real user data, auth, sync, backups and tests already existed. Migrating would risk data and add no user value. |
| Styling | Keep the existing CSS design system; add `src/project73.css` with token-based light/dark themes. No Tailwind/shadcn. | Mixing two styling systems would be inconsistent. |
| Validation | Zod (`src/lib/project73/apiSchemas.ts`, `assistantIntents.ts`). | Request bodies, AI output and backup data are all untrusted. |
| Meal-planning data | Stored in the existing account payload (AppData v13). | Keeps offline use, revision-checked sync, merge and backups working without new sync logic. |
| Picnic / cart / orders | Server-only D1 tables. | Secrets, idempotency and authorization must be enforced on the server. |
| Numbers | Deterministic engines only. | AI may misstate nutrition, quantities or prices. |

## Data model mapping

| Requested model | Implementation |
| --- | --- |
| UserProfile | `AppData.profile` (existing) + `metabolicSettings` + `planningPreferences` |
| NutritionTargets | `profile.calorieTarget/proteinTarget/carbTarget/fatTarget` (active), `metabolicSettings.overrides`, dated history in `nutritionTargetHistory` |
| WeightEntry | `AppData.measurements` (existing `BodyMeasurement`) |
| FoodProduct | `FoodItem` (existing catalogue) and `ProductCandidate`/`ProductDetails` (Picnic) |
| Recipe / RecipeIngredient | `src/data/project73/recipes.ts` (built-in) + `AppData.customRecipes` |
| MealPlan / PlannedMeal | `AppData.mealPlans[].meals[]` |
| FoodLog | `AppData.foodLog` (existing). "Gegeten" writes a log entry; planned meals are never counted as intake. |
| PantryItem | `AppData.pantry` |
| ShoppingPlan / ShoppingItem / GroceryProductMatch | `project73_shopping_plans.payload` (`ShoppingPlan` with `items[].lines` and `alternatives`) |
| CartSyncOperation | `project73_cart_sync_operations` (unique per user + idempotency key) |
| OrderAttempt | `project73_order_attempts` (unique per user + idempotency key, compare-and-set status) |
| IntegrationSettings | `project73_integrations` (encrypted auth key, device id, checkout flag) |
| — | `project73_product_cache` (per-user search and label cache) |

## Modules

```
src/lib/project73/
  metabolism.ts       Mifflin-St Jeor, TDEE, targets, forecasts, warnings, Dutch assumptions
  weightTrend.ts      daily weights, gap-aware EWMA trend, weekly averages, observed rate
  progressCoach.ts    Dutch coaching; calorie changes only with reliable data and good adherence
  recipeMath.ts       portion scaling, kitchen rounding, nutrition from ingredients (+ verified labels)
  mealPlanner.ts      seeded planner: scoring, leftovers, locks, day balancing, replace/regenerate
  units.ts            package text parser ("4 x 125 gram", "1,5 liter", "6 stuks"), unit conversion
  grocery.ts          consolidation, pantry, product filtering/ranking, package choice, totals
  optimizer.ts        swap suggestions for surplus use or lower cost, re-priced with known products
  cartSync.ts         target-based cart diff, verification, idempotency key
  actions.ts          pure AppData transforms used by the UI (eaten/skipped/replaced, plans, pantry)
  selectors.ts        derived state for pages
  upgrade.ts          v12 → v13 migration
  assistantIntents.ts intent schema + deterministic Dutch parser
worker/project73/
  routes.ts           /api/picnic/*, /api/shopping/*
  picnicLive.ts       picnic-api 5.3.0 adapter (mapping, retries for reads only, error translation)
  picnicMock.ts       labelled demo catalogue, cart and slots
  crypto.ts           AES-GCM secret storage
  store.ts            D1 access
  assistant.ts        /api/assistant with OpenAI/Anthropic structured output + fallback
```

## Safety properties

- The Picnic password is never stored; only an AES-GCM encrypted auth key bound to the user id.
- Every Picnic call happens in the Worker; the browser only receives product data and status.
- Cart sync recomputes from a fresh cart read and sets target counts, so repeats cannot double quantities; only units the app added for the plan can be removed; a completed idempotency key replays its stored result.
- Checkout requires the server flag, a per-user opt-in, an explicit confirmation, a selected slot and an unchanged total. One attempt is active at a time, and confirmation happens once (compare-and-set). Success is reported only after Picnic confirms.
- Demo data is labelled in the payload (`source: 'demo'`) and in the UI, and demo mode refuses checkout.
- `DELETE /api/account` removes the account payload, photos (D1 + R2), Picnic key, shopping plans, operations, order attempts and cached searches.
