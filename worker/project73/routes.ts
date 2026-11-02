import { getIngredient } from '../../src/data/project73/ingredients';
import { buildShoppingItem, conflictingAllergens, desiredCartLines, finalizeItem, shoppingTotals } from '../../src/lib/project73/grocery';
import { computeCartDiff, syncIdempotencyKey, verifyCart } from '../../src/lib/project73/cartSync';
import { cartPreviewSchema, cartSyncSchema, checkoutAttemptSchema, checkoutSettingsSchema, checkoutStartSchema, deleteAccountSchema, loginSchema, prepareShoppingSchema, selectSlotSchema, updateShoppingItemSchema, verifyCodeSchema } from '../../src/lib/project73/apiSchemas';
import type { Allergen } from '../../src/types/project73';
import type { IngredientRequirement, ProductCandidate, ProductDetails, ShoppingItem, ShoppingPlan } from '../../src/types/shopping';
import type { D1Database } from '../dataStore';
import { decryptSecret, encryptionConfigured, encryptSecret, sha256Hex } from './crypto';
import { isSameSite, json, mapWithConcurrency, rateLimited, readBody } from './http';
import { PicnicIntegrationError, type PicnicAdapter, type PicnicAuthenticator } from './picnicAdapter';
import { createLiveAdapter, createLiveAuthenticator } from './picnicLive';
import { createMockAdapter } from './picnicMock';
import * as store from './store';

export interface Project73Env {
  DB?: D1Database;
  PICNIC_MODE?: string;
  PICNIC_COUNTRY_CODE?: string;
  PICNIC_TOKEN_ENCRYPTION_KEY?: string;
  PICNIC_CHECKOUT_ENABLED?: string;
}

export interface Project73Deps {
  liveAdapter?: (options: { authKey: string; deviceId: string; countryCode: 'NL' | 'DE' | 'FR' }) => PicnicAdapter;
  authenticator?: (countryCode: 'NL' | 'DE' | 'FR', deviceId: string) => PicnicAuthenticator;
  mockAdapter?: (userId: string) => PicnicAdapter;
}

type Mode = 'live' | 'mock';

export function picnicMode(env: Project73Env): Mode {
  if (env.PICNIC_MODE === 'live') return 'live';
  if (env.PICNIC_MODE === 'mock') return 'mock';
  return encryptionConfigured(env.PICNIC_TOKEN_ENCRYPTION_KEY) ? 'live' : 'mock';
}

function countryCode(env: Project73Env): 'NL' | 'DE' | 'FR' {
  return env.PICNIC_COUNTRY_CODE === 'DE' || env.PICNIC_COUNTRY_CODE === 'FR' ? env.PICNIC_COUNTRY_CODE : 'NL';
}

function checkoutFlag(env: Project73Env) {
  return env.PICNIC_CHECKOUT_ENABLED === 'true';
}

function secretContext(userId: string) {
  return `project73:picnic:${userId}`;
}

function errorResponse(error: unknown) {
  if (error instanceof PicnicIntegrationError) {
    const status = error.kind === 'auth' ? 401 : error.kind === 'rate_limited' ? 429 : error.kind === 'not_found' ? 404 : error.kind === 'checkout_issue' ? 409 : 502;
    const code = error.kind === 'auth' ? 'picnic_reauth_required' : `picnic_${error.kind}`;
    return json({ code, message: error.message, details: error.details ?? null }, status);
  }
  return json({ code: 'internal_error', message: 'Er ging iets mis. Probeer het opnieuw.' }, 500);
}

interface ResolvedAdapter { adapter: PicnicAdapter; mode: Mode; demo: boolean }

async function resolveAdapter(env: Project73Env, deps: Project73Deps, userId: string, allowDemo: boolean): Promise<ResolvedAdapter | Response> {
  const mode = picnicMode(env);
  const mock = deps.mockAdapter ?? createMockAdapter;
  if (mode === 'mock') return { adapter: mock(userId), mode, demo: true };
  if (!env.DB) return json({ code: 'persistence_unavailable' }, 503);
  const integration = await store.getIntegration(env.DB, userId);
  if (!integration || integration.status !== 'connected' || !integration.encrypted_auth_key || !integration.key_iv) {
    if (allowDemo) return { adapter: mock(userId), mode, demo: true };
    return json({ code: integration?.status === 'expired' ? 'picnic_reauth_required' : 'picnic_not_connected', message: 'Koppel eerst je Picnic-account in Instellingen.' }, 409);
  }
  const authKey = await decryptSecret(integration.encrypted_auth_key, integration.key_iv, env.PICNIC_TOKEN_ENCRYPTION_KEY, secretContext(userId));
  const live = deps.liveAdapter ?? createLiveAdapter;
  return { adapter: live({ authKey, deviceId: integration.device_id, countryCode: countryCode(env) }), mode, demo: false };
}

async function markExpiredOnAuthError(env: Project73Env, userId: string, error: unknown) {
  if (error instanceof PicnicIntegrationError && error.kind === 'auth' && env.DB) await store.updateIntegrationFields(env.DB, userId, { status: 'expired' });
}

// ── Connection ──────────────────────────────────────────────────────────────

async function status(env: Project73Env, userId: string) {
  const mode = picnicMode(env);
  const integration = env.DB ? await store.getIntegration(env.DB, userId) : null;
  return json({
    mode,
    countryCode: countryCode(env),
    encryptionConfigured: encryptionConfigured(env.PICNIC_TOKEN_ENCRYPTION_KEY),
    connection: integration ? { status: integration.status, connectedAt: integration.connected_at, lastCheckedAt: integration.last_checked_at } : null,
    checkout: { serverEnabled: checkoutFlag(env), userEnabled: Boolean(integration?.checkout_enabled), available: mode === 'live' && checkoutFlag(env) && Boolean(integration?.checkout_enabled) && integration?.status === 'connected' },
  });
}

async function login(request: Request, env: Project73Env, deps: Project73Deps, userId: string) {
  if (picnicMode(env) !== 'live') return json({ code: 'demo_mode', message: 'De server draait in demo-modus; koppelen kan pas met PICNIC_MODE=live.' }, 409);
  if (!env.DB) return json({ code: 'persistence_unavailable' }, 503);
  if (!encryptionConfigured(env.PICNIC_TOKEN_ENCRYPTION_KEY)) return json({ code: 'encryption_unavailable', message: 'PICNIC_TOKEN_ENCRYPTION_KEY ontbreekt op de server.' }, 503);
  if (rateLimited(`${userId}:login`, 5, 15 * 60_000)) return json({ code: 'rate_limited' }, 429);
  const body = await readBody(request, loginSchema);
  if (!body.ok) return body.response;
  const existing = await store.getIntegration(env.DB, userId);
  const deviceId = existing?.device_id ?? crypto.randomUUID().replace(/-/g, '').slice(0, 16).toUpperCase();
  const authenticator = (deps.authenticator ?? createLiveAuthenticator)(countryCode(env), deviceId);
  try {
    // The password is used once and never stored or logged.
    const result = await authenticator.login(body.value.email, body.value.password);
    const encrypted = await encryptSecret(result.authKey, env.PICNIC_TOKEN_ENCRYPTION_KEY, secretContext(userId));
    const now = new Date().toISOString();
    await store.saveIntegration(env.DB, {
      user_id: userId, provider: 'picnic', status: result.secondFactorRequired ? 'pending_2fa' : 'connected',
      encrypted_auth_key: encrypted.ciphertext, key_iv: encrypted.iv, device_id: deviceId, country_code: countryCode(env),
      checkout_enabled: existing?.checkout_enabled ?? 0, connected_at: result.secondFactorRequired ? null : now, last_checked_at: now, created_at: existing?.created_at,
    });
    if (result.secondFactorRequired) {
      await authenticator.send2FACode(result.authKey, 'SMS');
      return json({ status: 'pending_2fa', message: 'Picnic heeft een sms-code gestuurd.' });
    }
    return json({ status: 'connected' });
  } catch (error) {
    return errorResponse(error);
  }
}

async function pendingKey(env: Project73Env, userId: string) {
  if (!env.DB) return null;
  const integration = await store.getIntegration(env.DB, userId);
  if (!integration?.encrypted_auth_key || !integration.key_iv) return null;
  return { integration, authKey: await decryptSecret(integration.encrypted_auth_key, integration.key_iv, env.PICNIC_TOKEN_ENCRYPTION_KEY, secretContext(userId)) };
}

async function resend2fa(env: Project73Env, deps: Project73Deps, userId: string) {
  if (rateLimited(`${userId}:2fa`, 5, 15 * 60_000)) return json({ code: 'rate_limited' }, 429);
  const pending = await pendingKey(env, userId);
  if (!pending || pending.integration.status !== 'pending_2fa') return json({ code: 'no_pending_login' }, 409);
  try {
    await (deps.authenticator ?? createLiveAuthenticator)(countryCode(env), pending.integration.device_id).send2FACode(pending.authKey, 'SMS');
    return json({ status: 'pending_2fa' });
  } catch (error) {
    return errorResponse(error);
  }
}

async function verify2fa(request: Request, env: Project73Env, deps: Project73Deps, userId: string) {
  if (rateLimited(`${userId}:2fa-verify`, 8, 15 * 60_000)) return json({ code: 'rate_limited' }, 429);
  const body = await readBody(request, verifyCodeSchema);
  if (!body.ok) return body.response;
  const pending = await pendingKey(env, userId);
  if (!pending || pending.integration.status !== 'pending_2fa' || !env.DB) return json({ code: 'no_pending_login' }, 409);
  try {
    const authKey = await (deps.authenticator ?? createLiveAuthenticator)(countryCode(env), pending.integration.device_id).verify2FACode(pending.authKey, body.value.code);
    const encrypted = await encryptSecret(authKey, env.PICNIC_TOKEN_ENCRYPTION_KEY, secretContext(userId));
    const now = new Date().toISOString();
    await store.saveIntegration(env.DB, { ...pending.integration, status: 'connected', encrypted_auth_key: encrypted.ciphertext, key_iv: encrypted.iv, connected_at: now, last_checked_at: now });
    return json({ status: 'connected' });
  } catch (error) {
    return errorResponse(error);
  }
}

async function testConnection(env: Project73Env, deps: Project73Deps, userId: string) {
  const resolved = await resolveAdapter(env, deps, userId, false);
  if (resolved instanceof Response) return resolved;
  try {
    const cart = await resolved.adapter.getCart();
    if (env.DB && !resolved.demo) await store.updateIntegrationFields(env.DB, userId, { last_checked_at: new Date().toISOString(), status: 'connected' });
    return json({ ok: true, source: resolved.adapter.source, cartItems: cart.totalCount });
  } catch (error) {
    await markExpiredOnAuthError(env, userId, error);
    return errorResponse(error);
  }
}

async function disconnect(env: Project73Env, deps: Project73Deps, userId: string) {
  if (!env.DB) return json({ code: 'persistence_unavailable' }, 503);
  const pending = await pendingKey(env, userId).catch(() => null);
  if (pending) {
    try {
      await (deps.authenticator ?? createLiveAuthenticator)(countryCode(env), pending.integration.device_id).logout(pending.authKey);
    } catch {
      // The stored key is deleted regardless; a failed remote logout only means Picnic expires it later.
    }
  }
  await store.deleteIntegration(env.DB, userId);
  return json({ status: 'disconnected' });
}

async function checkoutSettings(request: Request, env: Project73Env, userId: string) {
  const body = await readBody(request, checkoutSettingsSchema);
  if (!body.ok) return body.response;
  if (!env.DB) return json({ code: 'persistence_unavailable' }, 503);
  const integration = await store.getIntegration(env.DB, userId);
  if (!integration) return json({ code: 'picnic_not_connected' }, 409);
  await store.updateIntegrationFields(env.DB, userId, { checkout_enabled: body.value.checkoutEnabled ? 1 : 0 });
  return json({ checkoutEnabled: body.value.checkoutEnabled, serverEnabled: checkoutFlag(env) });
}

// ── Shopping plans ──────────────────────────────────────────────────────────

const SEARCH_TTL_MS = 6 * 3_600_000;
const DETAILS_TTL_MS = 24 * 3_600_000;

async function cachedSearch(env: Project73Env, userId: string, adapter: PicnicAdapter, query: string) {
  if (!env.DB || adapter.source === 'demo') return adapter.search(query);
  const key = `u:${await sha256Hex(userId)}:search:${query.toLowerCase()}`;
  const cached = await store.readCache<ProductCandidate[]>(env.DB, key, SEARCH_TTL_MS);
  if (cached) return cached.value;
  const results = await adapter.search(query);
  await store.writeCache(env.DB, key, results);
  return results;
}

async function cachedDetails(env: Project73Env, userId: string, adapter: PicnicAdapter, productId: string) {
  if (!env.DB || adapter.source === 'demo') return adapter.productDetails(productId);
  const key = `u:${await sha256Hex(userId)}:product:${productId}`;
  const cached = await store.readCache<ProductDetails | null>(env.DB, key, DETAILS_TTL_MS);
  if (cached) return cached.value;
  const details = await adapter.productDetails(productId);
  await store.writeCache(env.DB, key, details);
  return details;
}

async function itemForRequirement(env: Project73Env, userId: string, adapter: PicnicAdapter, requirement: IngredientRequirement, options: { mode: 'balanced' | 'cheapest'; staplesAtHome: boolean; allergens: Allergen[] }): Promise<ShoppingItem> {
  const ingredient = getIngredient(requirement.ingredientId);
  const fallback: ShoppingItem = { ingredientId: requirement.ingredientId, name: requirement.name, unit: requirement.unit, neededAmount: requirement.amount, pantryAmount: requirement.pantryAmount, netAmount: requirement.netAmount, status: 'no_match', lines: [], alternatives: [], purchasedAmount: 0, surplusAmount: 0, costCents: 0, consumedCostCents: 0, wasteRisk: 'none', manual: false, nutritionVerified: false, meals: requirement.meals, note: 'Onbekend ingrediënt.' };
  if (!ingredient) return fallback;
  const base = { requirement, ingredient, staplesAtHome: options.staplesAtHome, mode: options.mode };
  if ((requirement.staple && options.staplesAtHome) || requirement.netAmount <= 0) return buildShoppingItem({ ...base, candidates: [] });
  let candidates: ProductCandidate[] = [];
  let item: ShoppingItem | null = null;
  try {
    for (const term of ingredient.searchTerms.slice(0, 2)) {
      const results = await cachedSearch(env, userId, adapter, term);
      const known = new Set(candidates.map((candidate) => candidate.productId));
      candidates = [...candidates, ...results.filter((result) => !known.has(result.productId))];
      item = buildShoppingItem({ ...base, candidates });
      if (item.status === 'matched') break;
    }
  } catch (error) {
    if (error instanceof PicnicIntegrationError && error.kind === 'auth') throw error;
    return buildShoppingItem({ ...base, candidates: null });
  }
  if (!item || item.status !== 'matched') return item ?? buildShoppingItem({ ...base, candidates });
  // Check the label of the chosen product: allergens (hard filter) and verified nutrition.
  const rejected = new Set<string>();
  for (let attempt = 0; attempt < 3 && item.status === 'matched'; attempt += 1) {
    const productId = item.lines[0].product.productId;
    const details: ProductDetails | null = await cachedDetails(env, userId, adapter, productId).catch(() => null);
    const conflicts = conflictingAllergens(details, options.allergens);
    if (!conflicts.length) {
      const verified = details?.source === 'picnic' ? details.nutritionPer100 : null;
      return { ...item, nutritionVerified: Boolean(verified), nutritionPer100: verified, note: details ? item.note : 'Etiket kon niet worden gecontroleerd.' };
    }
    rejected.add(productId);
    item = buildShoppingItem({ ...base, candidates: candidates.filter((candidate) => !rejected.has(candidate.productId)) });
    item = { ...item, note: `Product met ${conflicts.join(', ')} overgeslagen.` };
  }
  return item;
}

async function prepareShopping(request: Request, env: Project73Env, deps: Project73Deps, userId: string) {
  if (rateLimited(`${userId}:prepare`, 20, 60 * 60_000)) return json({ code: 'rate_limited', message: 'Even wachten: te veel zoekopdrachten.' }, 429);
  const body = await readBody(request, prepareShoppingSchema);
  if (!body.ok) return body.response;
  if (!env.DB) return json({ code: 'persistence_unavailable' }, 503);
  const resolved = await resolveAdapter(env, deps, userId, body.value.demo);
  if (resolved instanceof Response) return resolved;
  try {
    const items = await mapWithConcurrency(body.value.requirements, 3, (requirement) => itemForRequirement(env, userId, resolved.adapter, requirement, body.value));
    const now = new Date().toISOString();
    const plan: ShoppingPlan = {
      id: `shop_${crypto.randomUUID()}`,
      mealPlanId: body.value.mealPlanId,
      createdAt: now,
      updatedAt: now,
      source: resolved.adapter.source,
      version: 1,
      mode: body.value.mode,
      budgetCents: body.value.budgetCents,
      items,
      totals: shoppingTotals(items),
      cartApplied: {},
      cartSyncedAt: null,
    };
    await store.saveShoppingPlan(env.DB, userId, plan);
    return json({ plan });
  } catch (error) {
    await markExpiredOnAuthError(env, userId, error);
    return errorResponse(error);
  }
}

async function readPlan(env: Project73Env, userId: string, id: string) {
  if (!env.DB) return json({ code: 'persistence_unavailable' }, 503);
  const plan = await store.getShoppingPlan(env.DB, userId, id);
  return plan ? json({ plan }) : json({ code: 'not_found' }, 404);
}

async function updatePlanItem(request: Request, env: Project73Env, userId: string, id: string) {
  const body = await readBody(request, updateShoppingItemSchema);
  if (!body.ok) return body.response;
  if (!env.DB) return json({ code: 'persistence_unavailable' }, 503);
  const plan = await store.getShoppingPlan(env.DB, userId, id);
  if (!plan) return json({ code: 'not_found' }, 404);
  const item = plan.items.find((entry) => entry.ingredientId === body.value.ingredientId);
  const ingredient = getIngredient(body.value.ingredientId);
  if (!item || !ingredient) return json({ code: 'not_found' }, 404);
  let next: ShoppingItem;
  if (body.value.action === 'remove') {
    next = { ...finalizeItem({ ...item, status: 'removed' }, [], ingredient), status: 'removed', manual: true };
  } else if (body.value.action === 'restore') {
    const candidates = [...item.lines.map((line) => line.product), ...item.alternatives.map((alternative) => alternative.product)];
    next = buildShoppingItem({ requirement: { ingredientId: item.ingredientId, name: item.name, unit: item.unit, amount: item.neededAmount, pantryAmount: item.pantryAmount, netAmount: item.netAmount, staple: Boolean(ingredient.staple), meals: item.meals }, ingredient, candidates, staplesAtHome: false, mode: plan.mode });
  } else {
    const { productId, count } = body.value;
    // Only products that came from the real search for this item can be selected.
    const candidate = item.alternatives.find((alternative) => alternative.product.productId === productId)
      ?? item.lines.map((line) => ({ product: line.product, coverage: line.coverage })).find((line) => line.product.productId === productId);
    if (!candidate) return json({ code: 'unknown_product', message: 'Kies een product uit de zoekresultaten.' }, 400);
    if (candidate.product.isUnavailable) return json({ code: 'product_unavailable', message: 'Dit product is nu niet leverbaar.' }, 409);
    next = { ...finalizeItem({ ...item, status: 'matched' }, [{ product: candidate.product, count, coverage: candidate.coverage }], ingredient), manual: true, note: undefined };
  }
  const items = plan.items.map((entry) => entry.ingredientId === item.ingredientId ? next : entry);
  const updated: ShoppingPlan = { ...plan, items, totals: shoppingTotals(items), version: plan.version + 1, updatedAt: new Date().toISOString() };
  await store.saveShoppingPlan(env.DB, userId, updated);
  return json({ plan: updated });
}

// ── Cart ────────────────────────────────────────────────────────────────────

async function planAndAdapter(env: Project73Env, deps: Project73Deps, userId: string, shoppingPlanId: string) {
  if (!env.DB) return json({ code: 'persistence_unavailable' }, 503);
  const plan = await store.getShoppingPlan(env.DB, userId, shoppingPlanId);
  if (!plan) return json({ code: 'not_found' }, 404);
  const resolved = await resolveAdapter(env, deps, userId, plan.source === 'demo');
  if (resolved instanceof Response) return resolved;
  if (resolved.adapter.source !== plan.source) return json({ code: 'source_mismatch', message: 'Deze lijst is met demodata gemaakt. Maak een nieuwe lijst met je Picnic-account.' }, 409);
  return { plan, adapter: resolved.adapter };
}

async function cartPreview(request: Request, env: Project73Env, deps: Project73Deps, userId: string) {
  const body = await readBody(request, cartPreviewSchema);
  if (!body.ok) return body.response;
  const context = await planAndAdapter(env, deps, userId, body.value.shoppingPlanId);
  if (context instanceof Response) return context;
  try {
    const cart = await context.adapter.getCart();
    const diff = computeCartDiff(cart.lines, desiredCartLines(context.plan), context.plan.cartApplied, { countExistingItems: body.value.countExistingItems });
    const idempotencyKey = await syncIdempotencyKey(context.plan.id, context.plan.version, diff);
    return json({ cart, diff, idempotencyKey, planVersion: context.plan.version, source: context.adapter.source });
  } catch (error) {
    await markExpiredOnAuthError(env, userId, error);
    return errorResponse(error);
  }
}

async function cartSync(request: Request, env: Project73Env, deps: Project73Deps, userId: string) {
  if (rateLimited(`${userId}:sync`, 30, 60 * 60_000)) return json({ code: 'rate_limited' }, 429);
  const body = await readBody(request, cartSyncSchema);
  if (!body.ok) return body.response;
  const context = await planAndAdapter(env, deps, userId, body.value.shoppingPlanId);
  if (context instanceof Response) return context;
  const db = env.DB!;
  if (context.plan.version !== body.value.expectedVersion) return json({ code: 'plan_changed', message: 'De lijst is gewijzigd. Bekijk de wijzigingen opnieuw.' }, 409);
  const operationId = `sync_${crypto.randomUUID()}`;
  const existing = await store.claimSyncOperation(db, { id: operationId, user_id: userId, shopping_plan_id: context.plan.id, idempotency_key: body.value.idempotencyKey, operations: '[]' });
  if (existing) {
    if (existing.status === 'completed' && existing.result) return json({ ...JSON.parse(existing.result), replayed: true });
    if (existing.status === 'in_progress') return json({ code: 'sync_in_progress', message: 'Je mandje wordt al bijgewerkt.' }, 409);
    return json({ code: 'sync_failed_before', message: 'Deze synchronisatie mislukte eerder. Bekijk de wijzigingen opnieuw.' }, 409);
  }
  const applied: Array<{ productId: string; action: 'add' | 'remove'; count: number }> = [];
  try {
    // Always recompute from a fresh cart read: target-based, so a repeat never doubles quantities.
    const cart = await context.adapter.getCart();
    const diff = computeCartDiff(cart.lines, desiredCartLines(context.plan), context.plan.cartApplied, { countExistingItems: body.value.countExistingItems });
    let failure: string | null = null;
    for (const operation of diff.operations) {
      try {
        if (operation.action === 'add') await context.adapter.addToCart(operation.productId, operation.count);
        else await context.adapter.removeFromCart(operation.productId, operation.count);
        applied.push({ productId: operation.productId, action: operation.action, count: operation.count });
      } catch (error) {
        failure = error instanceof PicnicIntegrationError ? error.message : 'Onbekende fout';
        if (error instanceof PicnicIntegrationError && error.kind === 'auth') throw error;
        break;
      }
    }
    const after = await context.adapter.getCart();
    const mismatches = verifyCart(after.lines, diff.targetCounts);
    const afterCounts = new Map<string, number>();
    for (const line of after.lines) afterCounts.set(line.productId, (afterCounts.get(line.productId) ?? 0) + line.count);
    const cartApplied: Record<string, number> = {};
    for (const [productId, target] of Object.entries(diff.targetCounts)) {
      const other = target - (diff.appliedAfter[productId] ?? 0);
      const ours = Math.max(0, (afterCounts.get(productId) ?? 0) - other);
      if (ours > 0) cartApplied[productId] = ours;
    }
    const now = new Date().toISOString();
    const updated: ShoppingPlan = { ...context.plan, cartApplied, cartSyncedAt: now, updatedAt: now };
    await store.saveShoppingPlan(db, userId, updated);
    const result = { status: failure || mismatches.length ? 'partial' : 'synced', applied, mismatches, failure, cart: after, plan: updated, source: context.adapter.source };
    await store.finishSyncOperation(db, operationId, failure ? 'failed' : 'completed', result);
    return json(result);
  } catch (error) {
    await store.finishSyncOperation(db, operationId, 'failed', { applied, error: error instanceof Error ? error.message : 'unknown' });
    await markExpiredOnAuthError(env, userId, error);
    return errorResponse(error);
  }
}

async function readCart(env: Project73Env, deps: Project73Deps, userId: string, demo: boolean) {
  const resolved = await resolveAdapter(env, deps, userId, demo);
  if (resolved instanceof Response) return resolved;
  try {
    return json({ cart: await resolved.adapter.getCart() });
  } catch (error) {
    await markExpiredOnAuthError(env, userId, error);
    return errorResponse(error);
  }
}

// ── Delivery slots ──────────────────────────────────────────────────────────

async function slots(env: Project73Env, deps: Project73Deps, userId: string, demo: boolean) {
  const resolved = await resolveAdapter(env, deps, userId, demo);
  if (resolved instanceof Response) return resolved;
  try {
    return json({ slots: await resolved.adapter.getDeliverySlots(), source: resolved.adapter.source });
  } catch (error) {
    await markExpiredOnAuthError(env, userId, error);
    return errorResponse(error);
  }
}

async function selectSlot(request: Request, env: Project73Env, deps: Project73Deps, userId: string, demo: boolean) {
  const body = await readBody(request, selectSlotSchema);
  if (!body.ok) return body.response;
  const resolved = await resolveAdapter(env, deps, userId, demo);
  if (resolved instanceof Response) return resolved;
  try {
    const available = await resolved.adapter.getDeliverySlots();
    if (!available.some((slot) => slot.slotId === body.value.slotId && slot.isAvailable)) return json({ code: 'slot_unavailable', message: 'Dit tijdvak is niet meer beschikbaar.' }, 409);
    await resolved.adapter.setDeliverySlot(body.value.slotId);
    return json({ slots: await resolved.adapter.getDeliverySlots(), source: resolved.adapter.source });
  } catch (error) {
    await markExpiredOnAuthError(env, userId, error);
    return errorResponse(error);
  }
}

// ── Checkout ────────────────────────────────────────────────────────────────

function attemptView(row: store.OrderAttemptRow) {
  return { attemptId: row.id, status: row.status, orderId: row.status === 'confirmed' ? row.picnic_order_id : null, reviewedTotalCents: row.reviewed_total_cents, picnicTotalCents: row.picnic_total_cents, errorCode: row.error_code, updatedAt: row.updated_at };
}

async function checkoutStart(request: Request, env: Project73Env, deps: Project73Deps, userId: string) {
  if (picnicMode(env) !== 'live') return json({ code: 'demo_mode', message: 'In demo-modus kun je niet bestellen. Rond je bestelling af in de Picnic-app.' }, 409);
  if (!checkoutFlag(env)) return json({ code: 'checkout_disabled', message: 'Direct bestellen staat uit op de server. Rond je bestelling af in de Picnic-app.' }, 409);
  if (rateLimited(`${userId}:checkout`, 10, 60 * 60_000)) return json({ code: 'rate_limited' }, 429);
  const body = await readBody(request, checkoutStartSchema);
  if (!body.ok) return body.response;
  if (!env.DB) return json({ code: 'persistence_unavailable' }, 503);
  const integration = await store.getIntegration(env.DB, userId);
  if (!integration?.checkout_enabled) return json({ code: 'checkout_not_enabled', message: 'Zet “Direct bestellen” eerst aan in Instellingen.' }, 409);
  const context = await planAndAdapter(env, deps, userId, body.value.shoppingPlanId);
  if (context instanceof Response) return context;
  if (context.adapter.source !== 'picnic') return json({ code: 'demo_mode' }, 409);
  const attemptId = `order_${crypto.randomUUID()}`;
  const existing = await store.claimOrderAttempt(env.DB, { id: attemptId, user_id: userId, shopping_plan_id: context.plan.id, idempotency_key: body.value.idempotencyKey, reviewed_total_cents: body.value.reviewedTotalCents });
  if (existing) return json({ attempt: attemptView(existing), replayed: true });
  const other = await store.activeOrderAttempt(env.DB, userId, attemptId);
  if (other) {
    await store.transitionOrderAttempt(env.DB, attemptId, ['started'], 'failed', { error_code: 'checkout_in_progress' });
    return json({ code: 'checkout_in_progress', message: 'Er loopt al een bestelling. Rond die eerst af.', attempt: attemptView(other) }, 409);
  }
  try {
    const cart = await context.adapter.getCart();
    if (!cart.selectedSlotId) {
      await store.transitionOrderAttempt(env.DB, attemptId, ['started'], 'failed', { error_code: 'slot_required' });
      return json({ code: 'slot_required', message: 'Kies eerst een bezorgmoment.' }, 409);
    }
    if (cart.mts == null || cart.totalCents !== body.value.reviewedTotalCents) {
      await store.transitionOrderAttempt(env.DB, attemptId, ['started'], 'price_changed', { picnic_total_cents: cart.totalCents });
      return json({ code: 'price_changed', message: 'Het totaalbedrag bij Picnic is gewijzigd. Controleer je mandje opnieuw.', picnicTotalCents: cart.totalCents }, 409);
    }
    const checkout = await context.adapter.startCheckout(cart.mts);
    if (checkout.totalCents !== body.value.reviewedTotalCents) {
      await store.transitionOrderAttempt(env.DB, attemptId, ['started'], 'price_changed', { picnic_total_cents: checkout.totalCents, picnic_order_id: checkout.orderId });
      return json({ code: 'price_changed', message: 'Picnic rekent een ander totaal. Er is niets besteld.', picnicTotalCents: checkout.totalCents }, 409);
    }
    const returnUrl = `${new URL(request.url).origin}/?picnicCheckout=${encodeURIComponent(attemptId)}`;
    const payment = await context.adapter.initiatePayment(checkout.orderId, returnUrl);
    await store.transitionOrderAttempt(env.DB, attemptId, ['started'], 'payment_pending', { picnic_order_id: checkout.orderId, transaction_id: payment.transactionId, picnic_total_cents: checkout.totalCents });
    const row = await store.getOrderAttempt(env.DB, userId, attemptId);
    return json({ attempt: row ? attemptView(row) : null, redirectUrl: payment.redirectUrl });
  } catch (error) {
    await store.transitionOrderAttempt(env.DB, attemptId, ['started'], 'failed', { error_code: error instanceof PicnicIntegrationError ? error.kind : 'unknown' });
    await markExpiredOnAuthError(env, userId, error);
    return errorResponse(error);
  }
}

async function checkoutStatus(request: Request, env: Project73Env, deps: Project73Deps, userId: string) {
  const body = await readBody(request, checkoutAttemptSchema);
  if (!body.ok) return body.response;
  if (!env.DB) return json({ code: 'persistence_unavailable' }, 503);
  const attempt = await store.getOrderAttempt(env.DB, userId, body.value.attemptId);
  if (!attempt) return json({ code: 'not_found' }, 404);
  if (attempt.status !== 'payment_pending' || !attempt.transaction_id || !attempt.picnic_order_id) return json({ attempt: attemptView(attempt) });
  const resolved = await resolveAdapter(env, deps, userId, false);
  if (resolved instanceof Response) return resolved;
  try {
    const paymentStatus = await resolved.adapter.checkoutStatus(attempt.transaction_id);
    if (paymentStatus !== 'FINISHED') return json({ attempt: attemptView(attempt), paymentStatus });
    // Only one request may confirm; the others see "confirming" and poll again.
    if (!await store.transitionOrderAttempt(env.DB, attempt.id, ['payment_pending'], 'confirming')) {
      const latest = await store.getOrderAttempt(env.DB, userId, attempt.id);
      return json({ attempt: latest ? attemptView(latest) : null });
    }
    try {
      const confirmation = await resolved.adapter.confirmOrder(attempt.picnic_order_id);
      await store.transitionOrderAttempt(env.DB, attempt.id, ['confirming'], 'confirmed', { picnic_order_id: confirmation.orderId, confirmed_at: new Date().toISOString() });
    } catch (error) {
      await store.transitionOrderAttempt(env.DB, attempt.id, ['confirming'], 'failed', { error_code: 'confirm_failed' });
      throw error;
    }
    const latest = await store.getOrderAttempt(env.DB, userId, attempt.id);
    return json({ attempt: latest ? attemptView(latest) : null, paymentStatus });
  } catch (error) {
    await markExpiredOnAuthError(env, userId, error);
    return errorResponse(error);
  }
}

async function checkoutCancel(request: Request, env: Project73Env, deps: Project73Deps, userId: string) {
  const body = await readBody(request, checkoutAttemptSchema);
  if (!body.ok) return body.response;
  if (!env.DB) return json({ code: 'persistence_unavailable' }, 503);
  const attempt = await store.getOrderAttempt(env.DB, userId, body.value.attemptId);
  if (!attempt) return json({ code: 'not_found' }, 404);
  if (attempt.status === 'payment_pending' && attempt.transaction_id) {
    const resolved = await resolveAdapter(env, deps, userId, false);
    if (!(resolved instanceof Response)) {
      try {
        await resolved.adapter.cancelCheckout(attempt.transaction_id);
      } catch (error) {
        return errorResponse(error);
      }
    }
  }
  await store.transitionOrderAttempt(env.DB, attempt.id, ['started', 'payment_pending'], 'cancelled');
  const latest = await store.getOrderAttempt(env.DB, userId, attempt.id);
  return json({ attempt: latest ? attemptView(latest) : null });
}

// ── Account data deletion ───────────────────────────────────────────────────

export async function deleteProject73Data(request: Request, env: Project73Env, deps: Project73Deps, userId: string) {
  const body = await readBody(request, deleteAccountSchema);
  if (!body.ok) return body.response;
  if (!env.DB) return json({ code: 'persistence_unavailable' }, 503);
  await disconnect(env, deps, userId);
  await store.deleteProject73UserData(env.DB, userId, `u:${await sha256Hex(userId)}:`);
  return null;
}

/** Routes /api/picnic/* and /api/shopping/*. Returns null for other paths. */
export async function handleProject73(request: Request, env: Project73Env, userId: string | null, deps: Project73Deps = {}): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname;
  if (!path.startsWith('/api/picnic') && !path.startsWith('/api/shopping')) return null;
  if (!userId) return json({ code: 'auth_required', message: 'Log in om boodschappen te gebruiken.' }, 401);
  if (request.method !== 'GET' && !isSameSite(request)) return json({ code: 'forbidden' }, 403);
  const demo = url.searchParams.get('demo') === '1';
  try {
    if (path === '/api/picnic/status' && request.method === 'GET') return await status(env, userId);
    if (path === '/api/picnic/login' && request.method === 'POST') return await login(request, env, deps, userId);
    if (path === '/api/picnic/2fa/send' && request.method === 'POST') return await resend2fa(env, deps, userId);
    if (path === '/api/picnic/2fa/verify' && request.method === 'POST') return await verify2fa(request, env, deps, userId);
    if (path === '/api/picnic/test' && request.method === 'POST') return await testConnection(env, deps, userId);
    if (path === '/api/picnic/disconnect' && request.method === 'POST') return await disconnect(env, deps, userId);
    if (path === '/api/picnic/checkout-settings' && request.method === 'POST') return await checkoutSettings(request, env, userId);
    if (path === '/api/picnic/cart' && request.method === 'GET') return await readCart(env, deps, userId, demo);
    if (path === '/api/picnic/cart/preview' && request.method === 'POST') return await cartPreview(request, env, deps, userId);
    if (path === '/api/picnic/cart/sync' && request.method === 'POST') return await cartSync(request, env, deps, userId);
    if (path === '/api/picnic/slots' && request.method === 'GET') return await slots(env, deps, userId, demo);
    if (path === '/api/picnic/slots/select' && request.method === 'POST') return await selectSlot(request, env, deps, userId, demo);
    if (path === '/api/picnic/checkout/start' && request.method === 'POST') return await checkoutStart(request, env, deps, userId);
    if (path === '/api/picnic/checkout/status' && request.method === 'POST') return await checkoutStatus(request, env, deps, userId);
    if (path === '/api/picnic/checkout/cancel' && request.method === 'POST') return await checkoutCancel(request, env, deps, userId);
    if (path === '/api/shopping/prepare' && request.method === 'POST') return await prepareShopping(request, env, deps, userId);
    if (path === '/api/shopping/latest' && request.method === 'GET') {
      if (!env.DB) return json({ code: 'persistence_unavailable' }, 503);
      return json({ plan: await store.latestShoppingPlan(env.DB, userId) });
    }
    const planMatch = /^\/api\/shopping\/plans\/([A-Za-z0-9_-]+)$/.exec(path);
    if (planMatch && request.method === 'GET') return await readPlan(env, userId, planMatch[1]);
    if (planMatch && request.method === 'PATCH') return await updatePlanItem(request, env, userId, planMatch[1]);
    return json({ code: 'not_found' }, 404);
  } catch (error) {
    return errorResponse(error);
  }
}
