import PicnicClient from 'picnic-api';
import type { NutrientsPer100 } from '../../src/types/project73';
import type { CartSnapshot, DeliverySlotView, ProductCandidate, ProductDetails } from '../../src/types/shopping';
import { PicnicIntegrationError, type PicnicAdapter, type PicnicAuthenticator } from './picnicAdapter';

interface LiveOptions { authKey: string; deviceId: string; countryCode: 'NL' | 'DE' | 'FR' }

/** Maps picnic-api errors to safe, typed errors. Response bodies are never passed on to the client. */
export function translatePicnicError(error: unknown): PicnicIntegrationError {
  if (error instanceof PicnicIntegrationError) return error;
  if (PicnicClient.isCheckoutIssueError(error)) {
    return new PicnicIntegrationError('checkout_issue', error.issueMessage || 'Picnic kan de bestelling nog niet afronden.', { title: error.title, resolveKey: error.resolveKey, blocking: error.blocking });
  }
  if (PicnicClient.isPicnicApiError(error)) {
    if (error.status === 401 || error.status === 403) return new PicnicIntegrationError('auth', 'Picnic-sessie verlopen of ongeldig.');
    if (error.status === 404) return new PicnicIntegrationError('not_found', 'Niet gevonden bij Picnic.');
    if (error.status === 429) return new PicnicIntegrationError('rate_limited', 'Picnic vraagt om even te wachten.');
    if (error.status >= 500) return new PicnicIntegrationError('unavailable', 'Picnic is tijdelijk niet bereikbaar.');
    return new PicnicIntegrationError('unknown', `Picnic gaf een fout (${error.status}).`);
  }
  if (PicnicClient.isUnexpectedPageFormatError(error)) return new PicnicIntegrationError('page_format', 'Picnic heeft zijn app gewijzigd; deze functie werkt tijdelijk niet.');
  if (PicnicClient.isProductNotFoundError(error)) return new PicnicIntegrationError('not_found', 'Product niet gevonden.');
  return new PicnicIntegrationError('unavailable', 'Picnic is tijdelijk niet bereikbaar.');
}

/** Retries idempotent reads on transient failures. Mutations are never retried here. */
async function withReadRetry<T>(operation: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const translated = translatePicnicError(error);
      if (translated.kind !== 'unavailable' && translated.kind !== 'rate_limited') throw translated;
      await new Promise((resolve) => setTimeout(resolve, 300 * 2 ** attempt));
    }
  }
  throw translatePicnicError(lastError);
}

async function guard<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw translatePicnicError(error);
  }
}

function parseNumberValue(value: string | null, unit: 'kcal' | 'g') {
  if (!value) return null;
  const normalized = value.replace(/\s+/g, ' ').toLowerCase();
  if (unit === 'kcal') {
    const kcal = /(\d+(?:[.,]\d+)?)\s*kcal/.exec(normalized);
    if (kcal) return Number(kcal[1].replace(',', '.'));
    const kj = /(\d+(?:[.,]\d+)?)\s*kj/.exec(normalized);
    return kj ? Math.round(Number(kj[1].replace(',', '.')) / 4.184) : null;
  }
  const grams = /(<\s*)?(\d+(?:[.,]\d+)?)\s*g/.exec(normalized);
  if (!grams) return null;
  return grams[1] ? 0 : Number(grams[2].replace(',', '.'));
}

/**
 * Reads Picnic's "Voedingswaarde" table (per 100 g/ml). Returns null unless energy, protein,
 * carbohydrates and fat are all present, so partial labels never replace reference values.
 */
export function parseNutritionRows(rows: Array<{ label: string; value: string | null }>): NutrientsPer100 | null {
  const header = rows.find((row) => row.value == null && /per\s*100/i.test(row.label));
  const anyPer100 = header || rows.some((row) => /100\s*(g|ml)/i.test(`${row.label} ${row.value ?? ''}`));
  if (!anyPer100 && rows.length) return null;
  const find = (pattern: RegExp) => rows.find((row) => pattern.test(row.label.toLowerCase()) && !/waarvan/.test(row.label.toLowerCase()));
  const kcal = parseNumberValue(find(/^energie|^energy/)?.value ?? null, 'kcal');
  const protein = parseNumberValue(find(/eiwit/)?.value ?? null, 'g');
  const carbs = parseNumberValue(find(/koolhydra/)?.value ?? null, 'g');
  const fat = parseNumberValue(find(/^vet|vetten/)?.value ?? null, 'g');
  const fiber = parseNumberValue(find(/vezel/)?.value ?? null, 'g');
  if (kcal == null || protein == null || carbs == null || fat == null) return null;
  return { kcal, protein, carbs, fat, fiber: fiber ?? 0 };
}

export function createLiveAdapter(options: LiveOptions): PicnicAdapter {
  const client = new PicnicClient({ countryCode: options.countryCode, authKey: options.authKey, deviceId: options.deviceId });
  const image = (imageId: string | null) => imageId ? client.catalog.getImageUrl(imageId, 'small') : null;
  return {
    source: 'picnic',
    async search(query) {
      const results = await withReadRetry(() => client.catalog.getSearchResults(query));
      const byId = new Map<string, ProductCandidate>();
      for (const section of results.products?.sections ?? []) {
        for (const tile of section.products) {
          const existing = byId.get(tile.id);
          const boughtBefore = section.type === 'RFY' || Boolean(existing?.boughtBefore);
          byId.set(tile.id, {
            productId: tile.id,
            name: [tile.namePrefix, tile.name].filter(Boolean).join(' '),
            brand: tile.brand,
            unitQuantity: tile.unitQuantity,
            priceCents: tile.displayPrice,
            originalPriceCents: tile.originalPrice,
            unitPriceText: tile.unitPrice,
            imageUrl: image(tile.imageId),
            isUnavailable: tile.isUnavailable,
            maxCount: 50,
            boughtBefore,
            promoLabel: tile.labels.find((label) => label.type === 'PROMO')?.text ?? null,
            source: 'picnic',
          });
        }
      }
      return [...byId.values()].slice(0, 30);
    },
    async productDetails(productId) {
      const product = await withReadRetry(() => client.catalog.getProduct(productId));
      return {
        productId,
        nutritionPer100: parseNutritionRows(product.nutritionRows),
        allergensContains: product.allergenGroups.contains.map((badge) => badge.text),
        allergensMayContain: product.allergenGroups.mayContain.map((badge) => badge.text),
        retrievedAt: new Date().toISOString(),
        source: 'picnic',
      } satisfies ProductDetails;
    },
    async getCart() {
      const cart = await withReadRetry(() => client.cart.getCart());
      return {
        lines: cart.items.map((item) => ({
          productId: item.productId,
          name: item.name,
          count: item.quantity,
          priceCents: item.quantity > 0 ? Math.round(item.displayPrice / item.quantity) : item.displayPrice,
          unitQuantity: item.unitQuantity,
          imageUrl: image(item.imageId),
          isUnavailable: item.isUnavailable,
        })),
        totalCents: cart.totalPrice,
        totalCount: cart.totalCount,
        mts: cart.mts,
        minimumOrderValueCents: cart.minimumOrderValue,
        selectedSlotId: cart.selectedSlot?.slotId ?? null,
        source: 'picnic',
      } satisfies CartSnapshot;
    },
    async addToCart(productId, count) {
      await guard(() => client.cart.addProductToCart(productId, count));
    },
    async removeFromCart(productId, count) {
      await guard(() => client.cart.removeProductFromCart(productId, count));
    },
    async getDeliverySlots() {
      const slots = await withReadRetry(() => client.cart.getDeliverySlots());
      return slots.slots.map((slot) => ({
        slotId: slot.slotId,
        windowStart: slot.windowStart,
        windowEnd: slot.windowEnd,
        cutOffTime: slot.cutOffTime,
        isAvailable: slot.isAvailable,
        isSelected: slot.isSelected,
        minimumOrderValueCents: slot.minimumOrderValue,
        source: 'picnic',
      } satisfies DeliverySlotView));
    },
    async setDeliverySlot(slotId) {
      await guard(() => client.cart.setDeliverySlot(slotId));
    },
    async startCheckout(mts) {
      const result = await guard(() => client.checkout.startCheckout({ mts }));
      return { orderId: result.order_id, totalCents: result.total_price, expiresAt: result.transaction_expiry ?? null };
    },
    async initiatePayment(orderId, returnUrl) {
      const result = await guard(() => client.checkout.initiatePayment(orderId, returnUrl));
      return { transactionId: result.transaction_id, redirectUrl: result.action?.redirect_url ?? result.issuer_authentication_url ?? null };
    },
    async checkoutStatus(transactionId) {
      const status = await withReadRetry(() => client.checkout.getCheckoutStatus(transactionId));
      return status.checkout_status;
    },
    async confirmOrder(orderId) {
      const confirmation = await guard(() => client.checkout.confirmOrder(orderId));
      return { orderId: confirmation.order_id };
    },
    async cancelCheckout(transactionId) {
      await guard(() => client.checkout.cancelCheckout(transactionId));
    },
  };
}

export function createLiveAuthenticator(countryCode: 'NL' | 'DE' | 'FR', deviceId: string): PicnicAuthenticator {
  return {
    async login(email, password) {
      const client = new PicnicClient({ countryCode, deviceId });
      try {
        const result = await client.auth.login(email, password);
        return { authKey: result.authKey, secondFactorRequired: result.secondFactorAuthenticationRequired };
      } catch (error) {
        const translated = translatePicnicError(error);
        if (translated.kind === 'auth' || translated.kind === 'unknown') throw new PicnicIntegrationError('auth', 'Inloggen bij Picnic is mislukt. Controleer je e-mailadres en wachtwoord.');
        throw translated;
      }
    },
    async send2FACode(authKey, channel) {
      const client = new PicnicClient({ countryCode, deviceId, authKey });
      await guard(() => client.auth.generate2FACode(channel));
    },
    async verify2FACode(authKey, code) {
      const client = new PicnicClient({ countryCode, deviceId, authKey });
      const result = await guard(() => client.auth.verify2FACode(code));
      return result.authKey || authKey;
    },
    async logout(authKey) {
      const client = new PicnicClient({ countryCode, deviceId, authKey });
      await guard(() => client.auth.logout());
    },
  };
}
