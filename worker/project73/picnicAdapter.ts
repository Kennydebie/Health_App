import type { CartSnapshot, DeliverySlotView, ProductCandidate, ProductDetails, ProductSource } from '../../src/types/shopping';

/**
 * Everything the app needs from Picnic, behind one interface. The live adapter talks to Picnic
 * through picnic-api; the mock adapter serves clearly labelled demo data for development and tests.
 */
export interface PicnicAdapter {
  readonly source: ProductSource;
  search(query: string): Promise<ProductCandidate[]>;
  productDetails(productId: string): Promise<ProductDetails | null>;
  getCart(): Promise<CartSnapshot>;
  addToCart(productId: string, count: number): Promise<void>;
  removeFromCart(productId: string, count: number): Promise<void>;
  getDeliverySlots(): Promise<DeliverySlotView[]>;
  setDeliverySlot(slotId: string): Promise<void>;
  startCheckout(mts: number): Promise<{ orderId: string; totalCents: number; expiresAt: string | null }>;
  initiatePayment(orderId: string, returnUrl: string): Promise<{ transactionId: string; redirectUrl: string | null }>;
  checkoutStatus(transactionId: string): Promise<string>;
  confirmOrder(orderId: string): Promise<{ orderId: string }>;
  cancelCheckout(transactionId: string): Promise<void>;
}

export type PicnicErrorKind = 'auth' | 'not_found' | 'rate_limited' | 'unavailable' | 'checkout_issue' | 'page_format' | 'unknown';

export class PicnicIntegrationError extends Error {
  constructor(public kind: PicnicErrorKind, message: string, public details?: { title?: string; resolveKey?: string; blocking?: boolean }) {
    super(message);
  }
}

export interface PicnicLoginResult {
  authKey: string;
  secondFactorRequired: boolean;
}

export interface PicnicAuthenticator {
  login(email: string, password: string): Promise<PicnicLoginResult>;
  send2FACode(authKey: string, channel: 'SMS'): Promise<void>;
  verify2FACode(authKey: string, code: string): Promise<string>;
  logout(authKey: string): Promise<void>;
}
