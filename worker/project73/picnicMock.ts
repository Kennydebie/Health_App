import { getIngredient } from '../../src/data/project73/ingredients';
import type { CartSnapshot, DeliverySlotView, ProductCandidate, ProductDetails } from '../../src/types/shopping';
import { normalizeText } from '../../src/lib/project73/grocery';
import { PicnicIntegrationError, type PicnicAdapter } from './picnicAdapter';

/**
 * DEMO catalogue. Names, package sizes and prices are illustrative only and are always returned
 * with `source: 'demo'`, which the interface shows as "Demo". Never presented as Picnic data.
 * Decoy products (smoked chicken, flavoured skyr, …) exercise the matching filters.
 */
const DEMO_PRODUCTS: Array<[ingredientId: string | null, name: string, unitQuantity: string, priceCents: number, unavailable?: boolean]> = [
  ['kipfilet', 'Kipfilet', '300 gram', 449], ['kipfilet', 'Kipfilet', '500 gram', 699], ['kipfilet', 'Kipfilet', '1 kg', 1249], [null, 'Gerookte kipfilet', '150 gram', 299],
  ['zalmfilet', 'Zalmfilet', '2 x 125 gram', 649], ['zalmfilet', 'Zalmfilet diepvries', '4 x 100 gram', 899], [null, 'Gerookte zalm', '100 gram', 349],
  ['rundergehakt', 'Mager rundergehakt', '300 gram', 429], ['rundergehakt', 'Mager rundergehakt', '500 gram', 649], [null, 'Half-om-half gehakt', '500 gram', 449],
  ['tonijn', 'Tonijnstukken in water', '3 x 145 gram', 549], [null, 'Tonijn in olie', '3 x 145 gram', 579],
  ['eieren', 'Scharreleieren M', '10 stuks', 349], ['eieren', 'Vrije-uitloopeieren L', '6 stuks', 279], [null, 'Eierkoeken', '6 stuks', 179],
  ['magere_kwark', 'Magere kwark', '500 gram', 139], ['magere_kwark', 'Magere kwark', '1 kg', 249], [null, 'Kwark aardbei', '500 gram', 199],
  ['skyr', 'Skyr naturel', '450 gram', 199], ['skyr', 'Skyr naturel', '1 kg', 389], [null, 'Skyr vanille', '450 gram', 219],
  ['cottage_cheese', 'Cottage cheese', '200 gram', 129],
  ['halfvolle_melk', 'Halfvolle melk', '1 liter', 119], ['halfvolle_melk', 'Halfvolle melk', '1,5 liter', 165],
  ['whey', 'Whey proteïnepoeder naturel', '450 gram', 1499],
  ['havermout', 'Havermout', '500 gram', 119], ['havermout', 'Havermout', '1 kg', 199],
  ['volkorenbrood', 'Volkorenbrood heel', '800 gram', 249],
  ['volkoren_wraps', 'Volkoren wraps', '6 stuks, 370 gram', 199],
  ['rijst', 'Basmati rijst', '400 gram', 149], ['rijst', 'Basmati rijst', '1 kg', 279], [null, 'Rijstwafels naturel', '130 gram', 119],
  ['volkoren_pasta', 'Volkoren penne', '500 gram', 129],
  ['krieltjes', 'Krieltjes', '750 gram', 219], ['krieltjes', 'Aardappelen vastkokend', '1,5 kg', 249],
  ['zoete_aardappel', 'Zoete aardappel', '500 gram', 199],
  ['broccoli', 'Broccoli', 'per stuk', 129], ['broccoli', 'Broccoliroosjes', '400 gram', 199],
  ['bimi', 'Bimi', '200 gram', 249],
  ['wokgroente', 'Wokgroenten Oosterse mix', '400 gram', 199],
  ['sperziebonen', 'Sperziebonen', '400 gram', 179],
  ['paprika', 'Paprika rood', 'per stuk', 79], ['paprika', 'Paprika mix', '3 stuks', 199], [null, 'Paprikapoeder', '40 gram', 129],
  ['ui', 'Gele uien', '1 kg', 129],
  ['tomaat', 'Cherrytomaten', '250 gram', 159], ['tomaat', 'Trostomaten', '500 gram', 189],
  ['komkommer', 'Komkommer', 'per stuk', 89],
  ['sla', 'Slamix', '150 gram', 129],
  ['spinazie', 'Spinazie', '300 gram', 179], [null, 'Spinazie à la crème', '450 gram', 189],
  ['aardbeien', 'Aardbeien', '400 gram', 299], ['aardbeien', 'Diepvries aardbeien', '500 gram', 279],
  ['blauwe_bessen', 'Blauwe bessen', '125 gram', 199], ['blauwe_bessen', 'Diepvries blauwe bessen', '300 gram', 289],
  ['banaan', 'Bananen', '5 stuks', 159],
  ['appel', 'Elstar appels', '6 stuks', 249],
  ['hummus', 'Hummus naturel', '200 gram', 179],
  ['tzatziki', 'Tzatziki', '200 gram', 179],
  ['passata', 'Passata', '500 gram', 99], ['passata', 'Passata rustica', '690 gram', 149, true],
  ['kidneybonen', 'Kidneybonen', '400 gram', 89],
  ['mais', 'Maïskorrels', '300 gram', 89],
  ['kaas_30', 'Geraspte kaas 30+', '150 gram', 199],
  ['olijfolie', 'Olijfolie extra vierge', '500 ml', 549],
  ['sojasaus', 'Sojasaus', '250 ml', 199],
  ['kruiden', 'Italiaanse kruiden', '20 gram', 129],
  ['knoflook', 'Knoflook', '3 stuks', 99],
];

const catalog: Array<ProductCandidate & { ingredientId: string | null }> = DEMO_PRODUCTS.map(([ingredientId, name, unitQuantity, priceCents, unavailable], index) => ({
  productId: `demo_${index.toString().padStart(3, '0')}`,
  ingredientId,
  name,
  brand: 'Demo',
  unitQuantity,
  priceCents,
  originalPriceCents: null,
  unitPriceText: null,
  imageUrl: ingredientId ? getIngredient(ingredientId)?.image ?? null : null,
  isUnavailable: Boolean(unavailable),
  maxCount: 50,
  boughtBefore: false,
  promoLabel: null,
  source: 'demo',
}));

const ALLERGEN_NAMES: Record<string, string> = { gluten: 'Gluten', lactose: 'Lactose', melk: 'Melk', ei: 'Ei', vis: 'Vis', soja: 'Soja', sesam: 'Sesam' };

interface MockState { cart: Map<string, number>; mts: number; selectedSlotId: string | null }
const states = new Map<string, MockState>();

function stateFor(userId: string): MockState {
  const existing = states.get(userId);
  if (existing) return existing;
  const created: MockState = { cart: new Map(), mts: 1, selectedSlotId: null };
  states.set(userId, created);
  return created;
}

export function resetMockState(userId?: string) {
  if (userId) states.delete(userId);
  else states.clear();
}

function demoSlots(selected: string | null, now = new Date()): DeliverySlotView[] {
  const slots: DeliverySlotView[] = [];
  for (let day = 1; day <= 3; day += 1) {
    for (const [start, end] of [[8, 9], [17, 19], [20, 22]]) {
      const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + day));
      const iso = (hour: number) => new Date(date.getTime() + (hour - 1) * 3_600_000).toISOString();
      const slotId = `demo_slot_${day}_${start}`;
      slots.push({ slotId, windowStart: iso(start), windowEnd: iso(end), cutOffTime: iso(start - 12), isAvailable: !(day === 1 && start === 8), isSelected: selected === slotId, minimumOrderValueCents: 3500, source: 'demo' });
    }
  }
  return slots;
}

export function createMockAdapter(userId: string): PicnicAdapter {
  const state = stateFor(userId);
  const priceOf = (productId: string) => catalog.find((item) => item.productId === productId);
  return {
    source: 'demo',
    async search(query) {
      const words = normalizeText(query).split(' ').filter((word) => word.length > 1);
      return catalog
        .filter((product) => {
          const name = normalizeText(product.name);
          return words.some((word) => name.includes(word) || name.includes(word.replace(/en$/, '')));
        })
        .map((product) => {
          const { ingredientId, ...candidate } = product;
          void ingredientId;
          return candidate;
        });
    },
    async productDetails(productId) {
      const product = catalog.find((item) => item.productId === productId);
      if (!product) return null;
      const ingredient = product.ingredientId ? getIngredient(product.ingredientId) : null;
      return {
        productId,
        // Demo products never claim a verified nutrition label.
        nutritionPer100: null,
        allergensContains: (ingredient?.allergens ?? []).map((allergen) => ALLERGEN_NAMES[allergen] ?? allergen),
        allergensMayContain: [],
        retrievedAt: new Date().toISOString(),
        source: 'demo',
      } satisfies ProductDetails;
    },
    async getCart() {
      const lines = [...state.cart.entries()].filter(([, count]) => count > 0).map(([productId, count]) => {
        const product = priceOf(productId);
        return { productId, name: product?.name ?? productId, count, priceCents: product?.priceCents ?? 0, unitQuantity: product?.unitQuantity, imageUrl: product?.imageUrl ?? null, isUnavailable: product?.isUnavailable };
      });
      return {
        lines,
        totalCents: lines.reduce((sum, line) => sum + line.count * line.priceCents, 0),
        totalCount: lines.reduce((sum, line) => sum + line.count, 0),
        mts: state.mts,
        minimumOrderValueCents: 3500,
        selectedSlotId: state.selectedSlotId,
        source: 'demo',
      } satisfies CartSnapshot;
    },
    async addToCart(productId, count) {
      if (!priceOf(productId)) throw new PicnicIntegrationError('not_found', 'Product niet gevonden.');
      state.cart.set(productId, (state.cart.get(productId) ?? 0) + count);
      state.mts += 1;
    },
    async removeFromCart(productId, count) {
      state.cart.set(productId, Math.max(0, (state.cart.get(productId) ?? 0) - count));
      state.mts += 1;
    },
    async getDeliverySlots() {
      return demoSlots(state.selectedSlotId);
    },
    async setDeliverySlot(slotId) {
      if (!demoSlots(null).some((slot) => slot.slotId === slotId && slot.isAvailable)) throw new PicnicIntegrationError('not_found', 'Tijdvak niet beschikbaar.');
      state.selectedSlotId = slotId;
    },
    async startCheckout() {
      throw new PicnicIntegrationError('unavailable', 'Afrekenen kan niet in demo-modus.');
    },
    async initiatePayment() {
      throw new PicnicIntegrationError('unavailable', 'Afrekenen kan niet in demo-modus.');
    },
    async checkoutStatus() {
      throw new PicnicIntegrationError('unavailable', 'Afrekenen kan niet in demo-modus.');
    },
    async confirmOrder() {
      throw new PicnicIntegrationError('unavailable', 'Afrekenen kan niet in demo-modus.');
    },
    async cancelCheckout() {
      // Nothing to cancel in demo mode.
    },
  };
}

/** Seeds the demo cart with an unrelated item, used by tests to prove it is never removed. */
export function seedMockCart(userId: string, productId: string, count: number) {
  stateFor(userId).cart.set(productId, count);
}

export const DEMO_CATALOG_SIZE = catalog.length;
