import { describe, expect, it, vi } from 'vitest';

class FakeApiError extends Error {
  constructor(public status: number) { super(`status ${status}`); }
}

const getSearchResults = vi.fn();
const getCart = vi.fn();
const getProduct = vi.fn();

vi.mock('picnic-api', () => {
  class PicnicClient {
    static isPicnicApiError = (error: unknown) => error instanceof FakeApiError;
    static isCheckoutIssueError = () => false;
    static isUnexpectedPageFormatError = () => false;
    static isProductNotFoundError = () => false;
    catalog = { getSearchResults, getProduct, getImageUrl: (id: string, size: string) => `https://static.example/${id}/${size}.png` };
    cart = { getCart };
    checkout = {};
    auth = {};
  }
  return { default: PicnicClient };
});

const { createLiveAdapter, parseNutritionRows } = await import('./picnicLive');

describe('live Picnic adapter mapping (picnic-api 5.x shapes)', () => {
  it('flattens search sections and marks previously bought products', async () => {
    const tile = (id: string, name: string, extra = {}) => ({ id, name, namePrefix: null, brand: 'Picnic', qualityCue: null, imageId: `img-${id}`, displayPrice: 699, originalPrice: null, unitPrice: '€13,98/kg', priceRanges: null, unitQuantity: '500 gram', labels: [], isUnavailable: false, numberOfOrders: 12, ...extra });
    getSearchResults.mockResolvedValueOnce({
      query: 'kipfilet', correctedQuery: null, recipes: [],
      products: { sections: [
        { id: 'Opnieuw bestellen', type: 'RFY', title: 'Opnieuw bestellen', products: [tile('s1', 'Kipfilet')] },
        { id: 'Kip', type: 'VISUAL', title: null, products: [tile('s1', 'Kipfilet'), tile('s2', 'Kipfilet', { labels: [{ position: 'topLeft', type: 'PROMO', text: '2e halve prijs' }], isUnavailable: true })] },
      ], visualFilters: [], powerFilters: [], textualFilters: [], productIdsByFacetId: {}, sortingOptions: [], selectedSorting: 'RELEVANCE' },
    });
    const adapter = createLiveAdapter({ authKey: 'k', deviceId: 'D', countryCode: 'NL' });
    const results = await adapter.search('kipfilet');
    expect(results.map((item) => item.productId)).toEqual(['s1', 's2']);
    expect(results[0]).toMatchObject({ boughtBefore: true, priceCents: 699, source: 'picnic', imageUrl: 'https://static.example/img-s1/small.png' });
    expect(results[1]).toMatchObject({ isUnavailable: true, promoLabel: '2e halve prijs' });
  });

  it('maps the cart with per-unit prices and the modification timestamp', async () => {
    getCart.mockResolvedValueOnce({ id: 'cart', mts: 1730000000, items: [{ id: 'l1', productId: 's1', name: 'Kipfilet', unitQuantity: '500 gram', imageId: null, quantity: 2, maxCount: 50, displayPrice: 1398, originalPrice: null, priceColor: null, priceRanges: null, labels: [], basePrice: null, freshness: null, characteristics: [], isUnavailable: false }], totalCount: 2, totalPrice: 1597, discount: 0, promotionSavings: 0, membershipSavings: 0, deposits: [], depositTotal: 0, fees: [], minimumOrderValue: 3500, selectedSlot: { slotId: 'slot', state: 'EXPLICIT', windowStart: null, windowEnd: null, isExplicitSelection: true }, recipes: [] });
    const cart = await createLiveAdapter({ authKey: 'k', deviceId: 'D', countryCode: 'NL' }).getCart();
    expect(cart).toMatchObject({ mts: 1730000000, totalCents: 1597, selectedSlotId: 'slot', minimumOrderValueCents: 3500 });
    expect(cart.lines[0]).toMatchObject({ productId: 's1', count: 2, priceCents: 699 });
  });

  it('translates expired keys into a re-login error', async () => {
    getCart.mockRejectedValueOnce(new FakeApiError(401));
    await expect(createLiveAdapter({ authKey: 'k', deviceId: 'D', countryCode: 'NL' }).getCart()).rejects.toMatchObject({ kind: 'auth' });
  });

  it('reads the Voedingswaarde table only when it is complete', () => {
    const rows = [
      { label: 'Per 100 g', value: null },
      { label: 'Energie', value: '448 kJ / 107 kcal' },
      { label: 'Vetten', value: '1,4 g' },
      { label: 'waarvan verzadigd', value: '0,4 g' },
      { label: 'Koolhydraten', value: '< 0,5 g' },
      { label: 'Eiwitten', value: '23,6 g' },
      { label: 'Zout', value: '0,15 g' },
    ];
    expect(parseNutritionRows(rows)).toEqual({ kcal: 107, protein: 23.6, carbs: 0, fat: 1.4, fiber: 0 });
    expect(parseNutritionRows(rows.filter((row) => row.label !== 'Eiwitten'))).toBeNull();
    expect(parseNutritionRows([{ label: 'Per 100 g', value: null }, { label: 'Energie', value: '420 kJ' }, { label: 'Vet', value: '1 g' }, { label: 'Koolhydraten', value: '2 g' }, { label: 'Eiwit', value: '10 g' }])?.kcal).toBe(100);
  });
});
