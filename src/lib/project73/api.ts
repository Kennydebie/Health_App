import type { CartDiff, CartSnapshot, DeliverySlotView, IngredientRequirement, ShoppingPlan } from '../../types/shopping';
import type { Allergen } from '../../types/project73';
import type { AssistantReply } from './assistantIntents';

export class ApiError extends Error {
  constructor(public code: string, message: string, public status: number, public payload: Record<string, unknown> = {}) {
    super(message);
  }
}

const MESSAGES: Record<string, string> = {
  auth_required: 'Log in om deze functie te gebruiken. Je plan blijft op dit apparaat bewaard.',
  picnic_not_connected: 'Koppel eerst je Picnic-account in Instellingen, of bekijk een demo.',
  picnic_reauth_required: 'Je Picnic-sessie is verlopen. Log opnieuw in via Instellingen.',
  picnic_unavailable: 'Picnic is tijdelijk niet bereikbaar. Probeer het straks opnieuw.',
  picnic_page_format: 'Picnic heeft zijn app aangepast; deze functie werkt tijdelijk niet.',
  rate_limited: 'Even rustig aan: te veel verzoeken achter elkaar. Probeer het over een paar minuten.',
  persistence_unavailable: 'Opslag is tijdelijk niet beschikbaar.',
  demo_mode: 'In demo-modus kun je niet bestellen.',
  network: 'Geen verbinding met de server.',
};

export function friendlyError(error: unknown) {
  if (error instanceof ApiError) return error.message || MESSAGES[error.code] || 'Er ging iets mis.';
  return 'Er ging iets mis.';
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? { Accept: 'application/json' } : { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError('network', MESSAGES.network, 0);
  }
  let payload: Record<string, unknown>;
  try {
    payload = await response.json() as Record<string, unknown>;
  } catch {
    payload = {};
  }
  if (!response.ok) {
    const code = typeof payload.code === 'string' ? payload.code : `http_${response.status}`;
    const message = typeof payload.message === 'string' ? payload.message : MESSAGES[code] ?? 'Er ging iets mis.';
    throw new ApiError(code, message, response.status, payload);
  }
  return payload as T;
}

export interface PicnicStatus {
  mode: 'live' | 'mock';
  countryCode: string;
  encryptionConfigured: boolean;
  connection: { status: 'pending_2fa' | 'connected' | 'expired'; connectedAt: string | null; lastCheckedAt: string | null } | null;
  checkout: { serverEnabled: boolean; userEnabled: boolean; available: boolean };
}

export interface CartPreview {
  cart: CartSnapshot;
  diff: CartDiff;
  idempotencyKey: string;
  planVersion: number;
  source: 'picnic' | 'demo';
}

export interface SyncResult {
  status: 'synced' | 'partial';
  applied: Array<{ productId: string; action: 'add' | 'remove'; count: number }>;
  mismatches: Array<{ productId: string; expected: number; actual: number }>;
  failure: string | null;
  cart: CartSnapshot;
  plan: ShoppingPlan;
  replayed?: boolean;
}

export interface OrderAttemptView {
  attemptId: string;
  status: 'started' | 'payment_pending' | 'confirming' | 'confirmed' | 'failed' | 'cancelled' | 'price_changed';
  orderId: string | null;
  reviewedTotalCents: number;
  picnicTotalCents: number | null;
  errorCode: string | null;
  updatedAt: string;
}

export const api = {
  picnicStatus: () => request<PicnicStatus>('GET', '/api/picnic/status'),
  login: (email: string, password: string) => request<{ status: 'connected' | 'pending_2fa' }>('POST', '/api/picnic/login', { email, password }),
  resend2fa: () => request<{ status: string }>('POST', '/api/picnic/2fa/send', {}),
  verify2fa: (code: string) => request<{ status: 'connected' }>('POST', '/api/picnic/2fa/verify', { code }),
  testConnection: () => request<{ ok: boolean; source: string; cartItems: number }>('POST', '/api/picnic/test', {}),
  disconnect: () => request<{ status: string }>('POST', '/api/picnic/disconnect', {}),
  setCheckoutEnabled: (checkoutEnabled: boolean) => request<{ checkoutEnabled: boolean; serverEnabled: boolean }>('POST', '/api/picnic/checkout-settings', { checkoutEnabled }),
  prepareShopping: (input: { mealPlanId: string; requirements: IngredientRequirement[]; mode: 'balanced' | 'cheapest'; staplesAtHome: boolean; allergens: Allergen[]; budgetCents: number | null; demo: boolean }) =>
    request<{ plan: ShoppingPlan }>('POST', '/api/shopping/prepare', input),
  latestShoppingPlan: () => request<{ plan: ShoppingPlan | null }>('GET', '/api/shopping/latest'),
  updateShoppingItem: (planId: string, change: { action: 'select'; ingredientId: string; productId: string; count: number } | { action: 'remove' | 'restore'; ingredientId: string }) =>
    request<{ plan: ShoppingPlan }>('PATCH', `/api/shopping/plans/${encodeURIComponent(planId)}`, change),
  cartPreview: (shoppingPlanId: string, countExistingItems: boolean) => request<CartPreview>('POST', '/api/picnic/cart/preview', { shoppingPlanId, countExistingItems }),
  cartSync: (shoppingPlanId: string, idempotencyKey: string, expectedVersion: number, countExistingItems: boolean) =>
    request<SyncResult>('POST', '/api/picnic/cart/sync', { shoppingPlanId, idempotencyKey, expectedVersion, countExistingItems }),
  slots: (demo: boolean) => request<{ slots: DeliverySlotView[]; source: string }>('GET', `/api/picnic/slots${demo ? '?demo=1' : ''}`),
  selectSlot: (slotId: string, demo: boolean) => request<{ slots: DeliverySlotView[] }>('POST', `/api/picnic/slots/select${demo ? '?demo=1' : ''}`, { slotId }),
  checkoutStart: (shoppingPlanId: string, idempotencyKey: string, reviewedTotalCents: number) =>
    request<{ attempt: OrderAttemptView | null; redirectUrl?: string | null; replayed?: boolean }>('POST', '/api/picnic/checkout/start', { shoppingPlanId, idempotencyKey, reviewedTotalCents, confirm: true }),
  checkoutStatus: (attemptId: string) => request<{ attempt: OrderAttemptView | null; paymentStatus?: string }>('POST', '/api/picnic/checkout/status', { attemptId }),
  checkoutCancel: (attemptId: string) => request<{ attempt: OrderAttemptView | null }>('POST', '/api/picnic/checkout/cancel', { attemptId }),
  assistantStatus: () => request<{ provider: 'openai' | 'anthropic' | null; model: string | null }>('GET', '/api/assistant/status'),
  assistant: (message: string, context: unknown) => request<AssistantReply>('POST', '/api/assistant', { message, context }),
  deleteAccount: () => request<{ deleted: boolean }>('DELETE', '/api/account', { confirm: 'VERWIJDER' }),
};
