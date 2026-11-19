import type { CartDiff, CartLine } from '../../types/shopping';

export interface DesiredLine { productId: string; name: string; count: number }

export interface CartDiffOptions {
  /**
   * Count products that are already in the cart (added by the user) towards the plan, so the app
   * does not add them twice. When false the plan's quantities are added on top.
   */
  countExistingItems: boolean;
}

/**
 * Computes the changes needed to bring the Picnic cart to the plan's quantities.
 *
 * - Lines the plan never touched are left alone (`untouched`).
 * - `previouslyApplied` holds the units this app added for this plan in earlier syncs; only those
 *   units can be removed. Units the user added themselves are never removed.
 * - The result is target-based: running it again on the resulting cart yields no operations, so a
 *   repeated button press can never double the quantities.
 */
export function computeCartDiff(cart: CartLine[], desired: DesiredLine[], previouslyApplied: Record<string, number>, options: CartDiffOptions = { countExistingItems: true }): CartDiff {
  const cartCounts = new Map<string, CartLine>();
  for (const line of cart) {
    const existing = cartCounts.get(line.productId);
    cartCounts.set(line.productId, existing ? { ...existing, count: existing.count + line.count } : { ...line });
  }
  const desiredMap = new Map(desired.filter((line) => line.count > 0).map((line) => [line.productId, line]));
  const productIds = new Set([...desiredMap.keys(), ...Object.keys(previouslyApplied).filter((id) => (previouslyApplied[id] ?? 0) > 0)]);
  const diff: CartDiff = { operations: [], unchanged: [], untouched: [], targetCounts: {}, appliedAfter: {}, alreadyInCart: [] };

  for (const productId of productIds) {
    const current = cartCounts.get(productId)?.count ?? 0;
    const name = desiredMap.get(productId)?.name ?? cartCounts.get(productId)?.name ?? productId;
    const ours = Math.min(Math.max(0, previouslyApplied[productId] ?? 0), current);
    const other = current - ours;
    const want = desiredMap.get(productId)?.count ?? 0;
    const target = options.countExistingItems ? Math.max(other, want) : other + want;
    diff.targetCounts[productId] = target;
    diff.appliedAfter[productId] = target - other;
    if (options.countExistingItems && other > 0 && want > 0) diff.alreadyInCart.push({ productId, name, count: Math.min(other, want) });
    if (target > current) diff.operations.push({ productId, name, action: 'add', count: target - current, fromCount: current, toCount: target });
    else if (target < current) diff.operations.push({ productId, name, action: 'remove', count: current - target, fromCount: current, toCount: target });
    else if (target > 0) diff.unchanged.push({ productId, name, count: target });
  }
  for (const [productId, line] of cartCounts) {
    if (!productIds.has(productId)) diff.untouched.push(line);
  }
  for (const key of Object.keys(diff.appliedAfter)) if (diff.appliedAfter[key] === 0) delete diff.appliedAfter[key];
  return diff;
}

/** Compares the cart after syncing with the targets; returns the products that do not match. */
export function verifyCart(cart: CartLine[], targetCounts: Record<string, number>) {
  const counts = new Map<string, number>();
  for (const line of cart) counts.set(line.productId, (counts.get(line.productId) ?? 0) + line.count);
  return Object.entries(targetCounts)
    .filter(([productId, target]) => (counts.get(productId) ?? 0) !== target)
    .map(([productId, target]) => ({ productId, expected: target, actual: counts.get(productId) ?? 0 }));
}

/** Stable key for a sync request, derived from the plan version and the operations shown. */
export async function syncIdempotencyKey(shoppingPlanId: string, version: number, diff: Pick<CartDiff, 'targetCounts'>) {
  const material = `${shoppingPlanId}:${version}:${Object.entries(diff.targetCounts).sort(([a], [b]) => a.localeCompare(b)).map(([id, count]) => `${id}=${count}`).join(',')}`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(material));
  return [...new Uint8Array(digest)].slice(0, 16).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
