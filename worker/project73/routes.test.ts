import { beforeEach, describe, expect, it } from 'vitest';
import { createInitialData } from '../../src/data/initialData';
import { getIngredient } from '../../src/data/project73/ingredients';
import { createPlan } from '../../src/lib/project73/actions';
import { consolidateRequirements } from '../../src/lib/project73/grocery';
import { activePlan, recipeMapFor } from '../../src/lib/project73/selectors';
import type { CartSnapshot, DeliverySlotView, ProductCandidate, ShoppingPlan } from '../../src/types/shopping';
import { resetRateLimits } from './http';
import { PicnicIntegrationError, type PicnicAdapter, type PicnicAuthenticator } from './picnicAdapter';
import { resetMockState, seedMockCart } from './picnicMock';
import { handleProject73, type Project73Deps, type Project73Env } from './routes';
import { resetSchemaCache } from './store';
import { createSqliteD1 } from './testing/sqliteD1';

const ORIGIN = 'https://project73.example';
const USER = 'user-test-1';
const KEY = btoa(String.fromCharCode(...new Uint8Array(32).map((_, index) => index + 1)));

function request(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  return new Request(`${ORIGIN}${path}`, { method, headers: { 'Content-Type': 'application/json', Origin: ORIGIN, ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
}

async function call(env: Project73Env, method: string, path: string, body?: unknown, deps: Project73Deps = {}, user: string | null = USER) {
  const response = await handleProject73(request(method, path, body), env, user, deps);
  if (!response) throw new Error(`No route for ${path}`);
  return { status: response.status, body: await response.json() as Record<string, unknown> };
}

function requirementsForThreeDays() {
  const data = createPlan('2026-11-02', 3, '2026-11-02', 42)(createInitialData());
  const plan = activePlan(data)!;
  return { mealPlanId: plan.id, requirements: consolidateRequirements(plan, recipeMapFor(data), getIngredient, [], { fromDate: '2026-11-02', staplesAtHome: true }) };
}

/** Scripted Picnic double, shaped like the live adapter's mapped picnic-api responses. */
function fakePicnic() {
  const products: ProductCandidate[] = [
    { productId: 's1001', name: 'Kipfilet', brand: 'Picnic', unitQuantity: '500 gram', priceCents: 699, originalPriceCents: null, unitPriceText: '€13,98/kg', imageUrl: null, isUnavailable: false, maxCount: 50, boughtBefore: true, promoLabel: null, source: 'picnic' },
    { productId: 's1002', name: 'Gerookte kipfilet', brand: 'Picnic', unitQuantity: '150 gram', priceCents: 299, originalPriceCents: null, unitPriceText: null, imageUrl: null, isUnavailable: false, maxCount: 50, boughtBefore: false, promoLabel: null, source: 'picnic' },
    { productId: 's2001', name: 'Skyr naturel', brand: 'Arla', unitQuantity: '450 gram', priceCents: 219, originalPriceCents: null, unitPriceText: null, imageUrl: null, isUnavailable: false, maxCount: 50, boughtBefore: false, promoLabel: null, source: 'picnic' },
    { productId: 's2002', name: 'Skyr naturel', brand: 'Nuts-merk', unitQuantity: '450 gram', priceCents: 199, originalPriceCents: null, unitPriceText: null, imageUrl: null, isUnavailable: false, maxCount: 50, boughtBefore: false, promoLabel: null, source: 'picnic' },
  ];
  const cart = new Map<string, number>([['s9999', 2]]);
  const calls = { startCheckout: 0, initiatePayment: 0, confirmOrder: 0, add: 0, remove: 0 };
  let paymentStatus = 'PENDING';
  let mts = 100;
  let selectedSlot: string | null = null;
  let failAuth = false;
  const slots: DeliverySlotView[] = [{ slotId: 'slot-a', windowStart: '2026-11-03T17:00:00Z', windowEnd: '2026-11-03T19:00:00Z', cutOffTime: '2026-11-02T22:00:00Z', isAvailable: true, isSelected: false, minimumOrderValueCents: 3500, source: 'picnic' }];
  const price = (id: string) => products.find((product) => product.productId === id)?.priceCents ?? 450;
  const adapter: PicnicAdapter = {
    source: 'picnic',
    async search(query) {
      if (failAuth) throw new PicnicIntegrationError('auth', 'expired');
      const word = query.toLowerCase().split(' ')[0];
      return products.filter((product) => product.name.toLowerCase().includes(word.replace(/s$/, '')));
    },
    async productDetails(productId) {
      return { productId, nutritionPer100: productId === 's2001' ? { kcal: 63, protein: 11, carbs: 4, fat: 0.2, fiber: 0 } : null, allergensContains: productId.startsWith('s2') ? ['Melk'] : [], allergensMayContain: [], retrievedAt: new Date().toISOString(), source: 'picnic' };
    },
    async getCart(): Promise<CartSnapshot> {
      const lines = [...cart.entries()].filter(([, count]) => count > 0).map(([productId, count]) => ({ productId, name: productId, count, priceCents: price(productId) }));
      return { lines, totalCents: lines.reduce((sum, line) => sum + line.count * line.priceCents, 0), totalCount: lines.reduce((sum, line) => sum + line.count, 0), mts, minimumOrderValueCents: 3500, selectedSlotId: selectedSlot, source: 'picnic' };
    },
    async addToCart(productId, count) { calls.add += 1; cart.set(productId, (cart.get(productId) ?? 0) + count); mts += 1; },
    async removeFromCart(productId, count) { calls.remove += 1; cart.set(productId, Math.max(0, (cart.get(productId) ?? 0) - count)); mts += 1; },
    async getDeliverySlots() { return slots.map((slot) => ({ ...slot, isSelected: slot.slotId === selectedSlot })); },
    async setDeliverySlot(slotId) { selectedSlot = slotId; },
    async startCheckout() { calls.startCheckout += 1; const current = await adapter.getCart(); return { orderId: 'order-1', totalCents: current.totalCents, expiresAt: null }; },
    async initiatePayment() { calls.initiatePayment += 1; return { transactionId: 'tx-1', redirectUrl: 'https://bank.example/pay' }; },
    async checkoutStatus() { return paymentStatus; },
    async confirmOrder() { calls.confirmOrder += 1; return { orderId: 'order-1' }; },
    async cancelCheckout() {},
  };
  const authCalls = { login: 0, send: 0, verify: 0, logout: 0 };
  const authenticator: PicnicAuthenticator = {
    async login(email, password) { authCalls.login += 1; if (password !== 'juist') throw new PicnicIntegrationError('auth', 'bad'); return { authKey: 'picnic-secret-auth-key', secondFactorRequired: true }; },
    async send2FACode() { authCalls.send += 1; },
    async verify2FACode(_key, code) { authCalls.verify += 1; if (code !== '123456') throw new PicnicIntegrationError('auth', 'bad code'); return 'picnic-verified-auth-key'; },
    async logout() { authCalls.logout += 1; },
  };
  return {
    adapter, authenticator, calls, authCalls, cart,
    setPaymentStatus: (value: string) => { paymentStatus = value; },
    setFailAuth: (value: boolean) => { failAuth = value; },
    deps: { liveAdapter: () => adapter, authenticator: () => authenticator } satisfies Project73Deps,
  };
}

beforeEach(() => {
  resetRateLimits();
  resetMockState();
  resetSchemaCache();
});

describe('Project 73 API — guards', () => {
  it('requires a signed-in user and same-site requests', async () => {
    const env = { DB: createSqliteD1(), PICNIC_MODE: 'mock' };
    expect((await call(env, 'GET', '/api/picnic/status', undefined, {}, null)).status).toBe(401);
    const crossSite = await handleProject73(request('POST', '/api/shopping/prepare', {}, { Origin: 'https://evil.example' }), env, USER);
    expect(crossSite?.status).toBe(403);
    expect((await call(env, 'POST', '/api/shopping/prepare', { mealPlanId: 'x' })).status).toBe(400);
  });
});

describe('Project 73 API — demo mode end to end', () => {
  it('prepares a labelled demo basket from real meal-plan requirements', async () => {
    const env = { DB: createSqliteD1(), PICNIC_MODE: 'mock' };
    const { mealPlanId, requirements } = requirementsForThreeDays();
    const result = await call(env, 'POST', '/api/shopping/prepare', { mealPlanId, requirements, staplesAtHome: true });
    expect(result.status).toBe(200);
    const plan = result.body.plan as ShoppingPlan;
    expect(plan.source).toBe('demo');
    expect(plan.items.filter((item) => item.status === 'matched').length).toBeGreaterThan(5);
    for (const item of plan.items) for (const line of item.lines) expect(line.product.source).toBe('demo');
    expect(plan.items.some((item) => item.nutritionVerified)).toBe(false);
    const chicken = plan.items.find((item) => item.ingredientId === 'kipfilet');
    if (chicken?.status === 'matched') expect(chicken.purchasedAmount).toBeGreaterThanOrEqual(chicken.netAmount);
    expect(plan.totals.costCents).toBe(plan.items.reduce((sum, item) => sum + (item.status === 'matched' ? item.costCents : 0), 0));
  });

  it('syncs the cart once, leaves unrelated items alone and replays repeated presses', async () => {
    const env = { DB: createSqliteD1(), PICNIC_MODE: 'mock' };
    seedMockCart(USER, 'demo_015', 3);
    const { mealPlanId, requirements } = requirementsForThreeDays();
    const plan = (await call(env, 'POST', '/api/shopping/prepare', { mealPlanId, requirements, staplesAtHome: true })).body.plan as ShoppingPlan;
    const preview = await call(env, 'POST', '/api/picnic/cart/preview', { shoppingPlanId: plan.id });
    expect(preview.status).toBe(200);
    const diff = preview.body.diff as { operations: unknown[]; untouched: Array<{ productId: string }> };
    expect(diff.operations.length).toBeGreaterThan(0);
    const syncBody = { shoppingPlanId: plan.id, idempotencyKey: preview.body.idempotencyKey, expectedVersion: plan.version };
    const first = await call(env, 'POST', '/api/picnic/cart/sync', syncBody);
    expect(first.body.status).toBe('synced');
    const cart = first.body.cart as CartSnapshot;
    const before = cart.totalCount;
    const second = await call(env, 'POST', '/api/picnic/cart/sync', syncBody);
    expect(second.body.replayed).toBe(true);
    const again = await call(env, 'POST', '/api/picnic/cart/preview', { shoppingPlanId: plan.id });
    expect((again.body.diff as { operations: unknown[] }).operations).toEqual([]);
    const afterCart = (await call(env, 'GET', '/api/picnic/cart?demo=1')).body.cart as CartSnapshot;
    expect(afterCart.totalCount).toBe(before);
  });

  it('never allows checkout in demo mode', async () => {
    const env = { DB: createSqliteD1(), PICNIC_MODE: 'mock', PICNIC_CHECKOUT_ENABLED: 'true' };
    const result = await call(env, 'POST', '/api/picnic/checkout/start', { shoppingPlanId: 'shop_x', idempotencyKey: 'a'.repeat(32), reviewedTotalCents: 1000, confirm: true });
    expect(result.status).toBe(409);
    expect(result.body.code).toBe('demo_mode');
  });
});

describe('Project 73 API — live Picnic flow with a mocked Picnic', () => {
  async function connected() {
    const picnic = fakePicnic();
    const db = createSqliteD1();
    const env: Project73Env = { DB: db, PICNIC_MODE: 'live', PICNIC_TOKEN_ENCRYPTION_KEY: KEY };
    expect((await call(env, 'POST', '/api/picnic/login', { email: 'kenny@example.com', password: 'fout' }, picnic.deps)).status).toBe(401);
    const login = await call(env, 'POST', '/api/picnic/login', { email: 'kenny@example.com', password: 'juist' }, picnic.deps);
    expect(login.body.status).toBe('pending_2fa');
    expect(picnic.authCalls.send).toBe(1);
    expect((await call(env, 'POST', '/api/picnic/2fa/verify', { code: '000000' }, picnic.deps)).status).toBe(401);
    expect((await call(env, 'POST', '/api/picnic/2fa/verify', { code: '123456' }, picnic.deps)).body.status).toBe('connected');
    return { picnic, env, db };
  }

  it('stores only an encrypted auth key and never returns it', async () => {
    const { env, db, picnic } = await connected();
    const row = db.raw.prepare('SELECT * FROM project73_integrations').get() as Record<string, string>;
    expect(row.encrypted_auth_key).not.toContain('picnic');
    expect(JSON.stringify(row)).not.toContain('juist');
    const status = await call(env, 'GET', '/api/picnic/status', undefined, picnic.deps);
    expect(JSON.stringify(status.body)).not.toContain('auth-key');
    expect(status.body.connection).toMatchObject({ status: 'connected' });
    expect(status.body.checkout).toMatchObject({ available: false });
  });

  it('requires a connection or an explicit demo request', async () => {
    const env: Project73Env = { DB: createSqliteD1(), PICNIC_MODE: 'live', PICNIC_TOKEN_ENCRYPTION_KEY: KEY };
    const { mealPlanId, requirements } = requirementsForThreeDays();
    expect((await call(env, 'POST', '/api/shopping/prepare', { mealPlanId, requirements, staplesAtHome: true })).body.code).toBe('picnic_not_connected');
    const demo = await call(env, 'POST', '/api/shopping/prepare', { mealPlanId, requirements, staplesAtHome: true, demo: true });
    expect((demo.body.plan as ShoppingPlan).source).toBe('demo');
  });

  it('matches real products, skips allergen conflicts and verifies labels', async () => {
    const { env, picnic } = await connected();
    const requirements = [
      { ingredientId: 'kipfilet', name: 'Kipfilet', unit: 'g', amount: 450, pantryAmount: 0, netAmount: 450, staple: false, meals: [] },
      { ingredientId: 'skyr', name: 'Skyr naturel', unit: 'g', amount: 400, pantryAmount: 0, netAmount: 400, staple: false, meals: [] },
    ];
    const plan = (await call(env, 'POST', '/api/shopping/prepare', { mealPlanId: 'plan_1', requirements, staplesAtHome: true, allergens: [] }, picnic.deps)).body.plan as ShoppingPlan;
    const chicken = plan.items.find((item) => item.ingredientId === 'kipfilet')!;
    expect(chicken.lines).toEqual([expect.objectContaining({ count: 1, product: expect.objectContaining({ productId: 's1001' }) })]);
    const skyr = plan.items.find((item) => item.ingredientId === 'skyr')!;
    expect(skyr.lines[0].product.productId).toBe('s2002');
    const withAllergy = (await call(env, 'POST', '/api/shopping/prepare', { mealPlanId: 'plan_1', requirements, staplesAtHome: true, allergens: ['melk'] }, picnic.deps)).body.plan as ShoppingPlan;
    expect(withAllergy.items.find((item) => item.ingredientId === 'skyr')!.lines).toEqual([]);
    const update = await call(env, 'PATCH', `/api/shopping/plans/${plan.id}`, { action: 'select', ingredientId: 'skyr', productId: 's2001', count: 1 }, picnic.deps);
    expect((update.body.plan as ShoppingPlan).version).toBe(2);
    expect((await call(env, 'PATCH', `/api/shopping/plans/${plan.id}`, { action: 'select', ingredientId: 'skyr', productId: 'invented', count: 1 }, picnic.deps)).body.code).toBe('unknown_product');
  });

  it('keeps unrelated cart items, is idempotent, and requires explicit, flag-gated checkout', async () => {
    const { env, picnic } = await connected();
    const requirements = [{ ingredientId: 'kipfilet', name: 'Kipfilet', unit: 'g', amount: 450, pantryAmount: 0, netAmount: 450, staple: false, meals: [] }];
    const plan = (await call(env, 'POST', '/api/shopping/prepare', { mealPlanId: 'plan_1', requirements, staplesAtHome: true }, picnic.deps)).body.plan as ShoppingPlan;
    const preview = await call(env, 'POST', '/api/picnic/cart/preview', { shoppingPlanId: plan.id }, picnic.deps);
    const sync = { shoppingPlanId: plan.id, idempotencyKey: preview.body.idempotencyKey, expectedVersion: 1 };
    await call(env, 'POST', '/api/picnic/cart/sync', sync, picnic.deps);
    await call(env, 'POST', '/api/picnic/cart/sync', sync, picnic.deps);
    expect(picnic.calls.add).toBe(1);
    expect(picnic.cart.get('s9999')).toBe(2);
    expect(picnic.cart.get('s1001')).toBe(1);

    const cartTotal = (await picnic.adapter.getCart()).totalCents;
    const start = { shoppingPlanId: plan.id, idempotencyKey: 'b'.repeat(32), reviewedTotalCents: cartTotal, confirm: true };
    expect((await call(env, 'POST', '/api/picnic/checkout/start', start, picnic.deps)).body.code).toBe('checkout_disabled');
    const enabledEnv = { ...env, PICNIC_CHECKOUT_ENABLED: 'true' };
    expect((await call(enabledEnv, 'POST', '/api/picnic/checkout/start', start, picnic.deps)).body.code).toBe('checkout_not_enabled');
    await call(enabledEnv, 'POST', '/api/picnic/checkout-settings', { checkoutEnabled: true }, picnic.deps);
    expect((await call(enabledEnv, 'POST', '/api/picnic/checkout/start', { ...start, idempotencyKey: 'c'.repeat(32) }, picnic.deps)).body.code).toBe('slot_required');
    await call(enabledEnv, 'POST', '/api/picnic/slots/select', { slotId: 'slot-a' }, picnic.deps);
    const changed = await call(enabledEnv, 'POST', '/api/picnic/checkout/start', { ...start, idempotencyKey: 'd'.repeat(32), reviewedTotalCents: cartTotal - 1 }, picnic.deps);
    expect(changed.body.code).toBe('price_changed');
    expect(picnic.calls.startCheckout).toBe(0);

    const started = await call(enabledEnv, 'POST', '/api/picnic/checkout/start', { ...start, idempotencyKey: 'e'.repeat(32) }, picnic.deps);
    expect(started.body.redirectUrl).toBe('https://bank.example/pay');
    expect((started.body.attempt as { status: string }).status).toBe('payment_pending');
    const replay = await call(enabledEnv, 'POST', '/api/picnic/checkout/start', { ...start, idempotencyKey: 'e'.repeat(32) }, picnic.deps);
    expect(replay.body.replayed).toBe(true);
    expect(picnic.calls.startCheckout).toBe(1);
    const parallel = await call(enabledEnv, 'POST', '/api/picnic/checkout/start', { ...start, idempotencyKey: 'f'.repeat(32) }, picnic.deps);
    expect(parallel.body.code).toBe('checkout_in_progress');

    const attemptId = (started.body.attempt as { attemptId: string }).attemptId;
    const pending = await call(enabledEnv, 'POST', '/api/picnic/checkout/status', { attemptId }, picnic.deps);
    expect((pending.body.attempt as { status: string; orderId: string | null })).toMatchObject({ status: 'payment_pending', orderId: null });
    picnic.setPaymentStatus('FINISHED');
    const [a, b] = await Promise.all([
      call(enabledEnv, 'POST', '/api/picnic/checkout/status', { attemptId }, picnic.deps),
      call(enabledEnv, 'POST', '/api/picnic/checkout/status', { attemptId }, picnic.deps),
    ]);
    expect(picnic.calls.confirmOrder).toBe(1);
    const statuses = [a, b].map((result) => (result.body.attempt as { status: string }).status);
    expect(statuses).toContain('confirmed');
  });

  it('marks the connection expired when Picnic rejects the key', async () => {
    const { env, picnic } = await connected();
    picnic.setFailAuth(true);
    const result = await call(env, 'POST', '/api/shopping/prepare', { mealPlanId: 'p', requirements: [{ ingredientId: 'kipfilet', name: 'Kipfilet', unit: 'g', amount: 100, pantryAmount: 0, netAmount: 100, staple: false, meals: [] }], staplesAtHome: true }, picnic.deps);
    expect(result.body.code).toBe('picnic_reauth_required');
    expect(((await call(env, 'GET', '/api/picnic/status', undefined, picnic.deps)).body.connection as { status: string }).status).toBe('expired');
  });

  it('disconnects and deletes the stored key', async () => {
    const { env, db, picnic } = await connected();
    expect((await call(env, 'POST', '/api/picnic/disconnect', {}, picnic.deps)).body.status).toBe('disconnected');
    expect(picnic.authCalls.logout).toBe(1);
    expect(db.raw.prepare('SELECT COUNT(*) AS n FROM project73_integrations').get()).toEqual({ n: 0 });
  });
});
