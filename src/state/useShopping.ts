import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getIngredient } from '../data/project73/ingredients';
import { api, ApiError, friendlyError, type CartPreview, type OrderAttemptView, type PicnicStatus, type SyncResult } from '../lib/project73/api';
import { addSurplusToPantry, recordVerifiedNutrition, setShoppingStatus } from '../lib/project73/actions';
import { consolidateRequirements } from '../lib/project73/grocery';
import { activePlan, recipeMapFor } from '../lib/project73/selectors';
import { toDateKey } from '../lib/date';
import type { DeliverySlotView, ShoppingPlan } from '../types/shopping';
import type { ShoppingStatusSummary } from '../types/project73';
import type { AppController } from './useAppData';

export type ShoppingBusy = null | 'status' | 'prepare' | 'item' | 'preview' | 'sync' | 'slots' | 'checkout';

function newKey() {
  return crypto.randomUUID().replace(/-/g, '');
}

export function useShopping(controller: AppController) {
  const { data, apply, syncStatus } = controller;
  const [status, setStatus] = useState<PicnicStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [plan, setPlan] = useState<ShoppingPlan | null>(null);
  const [preview, setPreview] = useState<CartPreview | null>(null);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [slots, setSlots] = useState<DeliverySlotView[] | null>(null);
  const [attempt, setAttempt] = useState<OrderAttemptView | null>(null);
  const [busy, setBusy] = useState<ShoppingBusy>(null);
  const [error, setError] = useState<string | null>(null);
  const [countExistingItems, setCountExistingItems] = useState(true);
  const checkoutKey = useRef<string>(newKey());
  const loadedOnce = useRef(false);

  const mealPlan = activePlan(data);
  const isDemo = plan?.source === 'demo';
  const signedOut = syncStatus === 'auth_required' || syncStatus === 'local_only';

  const recordSummary = useCallback((next: ShoppingPlan, extra: Partial<ShoppingStatusSummary> = {}) => {
    apply(setShoppingStatus({
      shoppingPlanId: next.id,
      mealPlanId: next.mealPlanId,
      preparedAt: next.createdAt,
      source: next.source,
      totalCents: next.totals.costCents,
      consumedCostCents: next.totals.consumedCostCents,
      itemCount: next.totals.itemCount,
      unavailableCount: next.totals.unavailableCount + next.totals.noMatchCount,
      cartSyncedAt: next.cartSyncedAt ?? undefined,
      ...extra,
    }));
  }, [apply]);

  const run = useCallback(async <T,>(kind: ShoppingBusy, task: () => Promise<T>): Promise<T | null> => {
    setBusy(kind);
    setError(null);
    try {
      return await task();
    } catch (caught) {
      setError(friendlyError(caught));
      if (caught instanceof ApiError && caught.code === 'picnic_reauth_required') void api.picnicStatus().then(setStatus).catch(() => undefined);
      return null;
    } finally {
      setBusy(null);
    }
  }, []);

  const refreshStatus = useCallback(async () => {
    try {
      setStatus(await api.picnicStatus());
      setStatusError(null);
    } catch (caught) {
      setStatusError(friendlyError(caught));
    }
  }, []);

  useEffect(() => {
    if (loadedOnce.current) return;
    loadedOnce.current = true;
    void refreshStatus();
    void api.latestShoppingPlan().then((result) => {
      if (result.plan) setPlan(result.plan);
    }).catch(() => undefined);
  }, [refreshStatus]);

  const requirements = useMemo(() => {
    if (!mealPlan) return [];
    return consolidateRequirements(mealPlan, recipeMapFor(data), getIngredient, data.pantry, { fromDate: toDateKey(), staplesAtHome: data.planningPreferences.staplesAtHome });
  }, [mealPlan, data]);

  const prepare = useCallback(async (options: { demo?: boolean; mode?: 'balanced' | 'cheapest' } = {}) => {
    if (!mealPlan || !requirements.length) {
      setError('Maak eerst een maaltijdplan.');
      return null;
    }
    const days = mealPlan.days;
    const budget = data.planningPreferences.weeklyGroceryBudgetEur;
    const result = await run('prepare', () => api.prepareShopping({
      mealPlanId: mealPlan.id,
      requirements,
      mode: options.mode ?? plan?.mode ?? 'balanced',
      staplesAtHome: data.planningPreferences.staplesAtHome,
      allergens: data.planningPreferences.allergens,
      budgetCents: budget ? Math.round((budget * 100 * days) / 7) : null,
      demo: Boolean(options.demo),
    }));
    if (result) {
      setPlan(result.plan);
      setPreview(null);
      setSyncResult(null);
      checkoutKey.current = newKey();
      recordSummary(result.plan);
      apply(recordVerifiedNutrition(result.plan));
    }
    return result?.plan ?? null;
  }, [mealPlan, requirements, data.planningPreferences, plan?.mode, run, recordSummary, apply]);

  const updateItem = useCallback(async (change: Parameters<typeof api.updateShoppingItem>[1]) => {
    if (!plan) return;
    const result = await run('item', () => api.updateShoppingItem(plan.id, change));
    if (result) {
      setPlan(result.plan);
      setPreview(null);
      checkoutKey.current = newKey();
      recordSummary(result.plan);
    }
  }, [plan, run, recordSummary]);

  const loadPreview = useCallback(async () => {
    if (!plan) return;
    const result = await run('preview', () => api.cartPreview(plan.id, countExistingItems));
    if (result) setPreview(result);
  }, [plan, countExistingItems, run]);

  const sync = useCallback(async () => {
    if (!plan || !preview) return;
    const result = await run('sync', () => api.cartSync(plan.id, preview.idempotencyKey, preview.planVersion, countExistingItems));
    if (result) {
      setSyncResult(result);
      setPlan(result.plan);
      setPreview(null);
      checkoutKey.current = newKey();
      recordSummary(result.plan, { cartSyncedAt: result.plan.cartSyncedAt ?? new Date().toISOString() });
    }
  }, [plan, preview, countExistingItems, run, recordSummary]);

  const loadSlots = useCallback(async () => {
    const result = await run('slots', () => api.slots(isDemo));
    if (result) setSlots(result.slots);
  }, [isDemo, run]);

  const chooseSlot = useCallback(async (slotId: string) => {
    const result = await run('slots', () => api.selectSlot(slotId, isDemo));
    if (result) setSlots(result.slots);
  }, [isDemo, run]);

  const startCheckout = useCallback(async (reviewedTotalCents: number) => {
    if (!plan) return null;
    const result = await run('checkout', () => api.checkoutStart(plan.id, checkoutKey.current, reviewedTotalCents));
    if (!result) return null;
    setAttempt(result.attempt);
    if (result.attempt) recordSummary(plan, { order: { status: 'payment_pending', updatedAt: new Date().toISOString() } });
    return result.redirectUrl ?? null;
  }, [plan, run, recordSummary]);

  const pollAttempt = useCallback(async (attemptId: string) => {
    const result = await run('checkout', () => api.checkoutStatus(attemptId));
    if (result?.attempt) {
      setAttempt(result.attempt);
      if (plan && result.attempt.status === 'confirmed') recordSummary(plan, { order: { status: 'confirmed', updatedAt: result.attempt.updatedAt, orderId: result.attempt.orderId ?? undefined } });
    }
    return result?.attempt ?? null;
  }, [plan, run, recordSummary]);

  const cancelAttempt = useCallback(async (attemptId: string) => {
    const result = await run('checkout', () => api.checkoutCancel(attemptId));
    if (result?.attempt) setAttempt(result.attempt);
  }, [run]);

  const markHandoff = useCallback(() => {
    if (plan) recordSummary(plan, { order: { status: 'handoff', updatedAt: new Date().toISOString() } });
  }, [plan, recordSummary]);

  const moveSurplusToPantry = useCallback(() => {
    if (!plan) return;
    apply(addSurplusToPantry(plan.items.filter((item) => item.status === 'matched' && item.wasteRisk === 'none' && item.surplusAmount > 0)));
  }, [plan, apply]);

  return {
    status, statusError, refreshStatus, plan, setPlan, preview, syncResult, slots, attempt, busy, error, setError,
    countExistingItems, setCountExistingItems, requirements, mealPlan, isDemo, signedOut,
    prepare, updateItem, loadPreview, sync, loadSlots, chooseSlot, startCheckout, pollAttempt, cancelAttempt, markHandoff, moveSurplusToPantry,
  };
}

export type ShoppingController = ReturnType<typeof useShopping>;
