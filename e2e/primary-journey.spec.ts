import { expect, test, type Page } from '@playwright/test';

/**
 * Primary acceptance journey (section 14 of the build prompt), against the demo Picnic adapter:
 * plan meals → find groceries → review/substitute → fill cart (twice, no duplicates) →
 * choose slot → handoff (no order in demo) → eat meals → weigh in a week later.
 */

const START = new Date('2026-11-02T08:30:00+01:00');
const WEEK_LATER = new Date('2026-11-09T08:30:00+01:00');

function parseNumber(text: string) {
  return Number(text.replace(/\./g, '').replace(',', '.').replace(/[^0-9.]/g, ''));
}

async function resetServer(page: Page) {
  const response = await page.request.delete('/api/account', { data: { confirm: 'VERWIJDER' }, headers: { Origin: 'http://127.0.0.1:5173' } });
  expect(response.ok()).toBeTruthy();
}

test('Project 73 primary journey', async ({ page }) => {
  page.on('dialog', (dialog) => dialog.accept());
  await page.clock.setFixedTime(START);
  await resetServer(page);
  await page.goto('/');

  // Onboarding is prefilled with the agreed profile.
  const onboarding = page.getByRole('dialog');
  await expect(onboarding.getByLabel('Huidig gewicht (kg)')).toHaveValue('85,5');
  await expect(onboarding.getByLabel('Streefgewicht (kg)')).toHaveValue('73');
  await onboarding.getByRole('button', { name: 'Verder' }).click();
  await expect(onboarding).toContainText('1.800 kcal');
  await expect(onboarding).toContainText('140 g');
  await onboarding.getByRole('button', { name: 'Verder' }).click();
  await onboarding.getByRole('button', { name: 'Start Project 73' }).click();
  await expect(page.getByRole('heading', { name: /Goedemorgen/ })).toBeVisible();

  // Action 1: "Plan mijn maaltijden" creates three days that respect the targets.
  await page.getByRole('button', { name: 'Plan mijn maaltijden' }).first().click();
  const dayTabs = page.locator('.day-tabs-p73 button');
  await expect(dayTabs).toHaveCount(3);
  for (const tab of await dayTabs.all()) {
    const kcal = parseNumber((await tab.locator('small').innerText()).split('·')[1]);
    expect(Math.abs(kcal - 1800)).toBeLessThan(1800 * 0.07);
  }
  await expect(page.locator('.meal-card').first()).toBeVisible();

  // Action 2: "Zoek boodschappen bij Picnic" matches products (clearly labelled demo data).
  await page.getByRole('button', { name: 'Zoek boodschappen bij Picnic' }).click();
  await expect(page.getByText('Gevonden producten')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.demo-banner').first()).toBeVisible();
  const items = page.locator('.shop-items > .shop-item');
  expect(await items.count()).toBeGreaterThan(8);

  // Action 3: review and substitute a product; the total updates.
  const totalBox = page.locator('.totals-box .grand span').last();
  const before = await totalBox.innerText();
  const withAlternatives = page.locator('.shop-item details').first();
  await withAlternatives.locator('summary').click();
  const alternative = withAlternatives.locator('.alt-list button:not(.selected):not([disabled])').first();
  await alternative.click();
  await expect(totalBox).not.toHaveText(before);

  // Action 4: fill the cart; a second sync adds nothing.
  await page.getByRole('button', { name: 'Bekijk wijzigingen' }).click();
  await expect(page.locator('.diff-list li.add').first()).toBeVisible();
  await page.getByRole('button', { name: 'Vul mijn Picnic-winkelmandje' }).click();
  await expect(page.getByText(/Mandje bijgewerkt/)).toBeVisible();
  const cartText = await page.getByText(/producten · .* in je demomandje/).innerText();
  await page.getByRole('button', { name: 'Bekijk wijzigingen' }).click();
  await expect(page.getByText('Je mandje is al up-to-date')).toBeVisible();
  const cart = await page.request.get('/api/picnic/cart?demo=1');
  const { cart: snapshot } = await cart.json() as { cart: { totalCount: number } };
  expect(cartText).toContain(`${snapshot.totalCount} producten`);

  // Action 5: choose a slot; in demo mode the app offers the official handoff, never a fake order.
  await page.getByRole('button', { name: 'Toon bezorgmomenten' }).click();
  await page.locator('.slot-grid button:not([disabled])').first().click();
  await expect(page.locator('.slot-grid button.selected')).toHaveCount(1);
  await expect(page.getByRole('link', { name: 'Rond af in de Picnic-app' })).toBeVisible();
  await expect(page.getByText('Bestelling bevestigd door Picnic')).toHaveCount(0);

  // Action 6: eat today's meals (planned and actual stay separate), then weigh a week later.
  await page.getByRole('button', { name: 'Dashboard' }).first().click();
  await expect(page.getByText('0 / 1.800 kcal')).toBeVisible();
  const eatButtons = page.locator('.meal-row').getByRole('button', { name: 'Gegeten' });
  const count = await eatButtons.count();
  for (let index = 0; index < count; index += 1) await eatButtons.first().click();
  await expect(page.getByText('0 / 1.800 kcal')).toHaveCount(0);

  await page.clock.setFixedTime(WEEK_LATER);
  await page.reload();
  await page.getByLabel('Gewicht in kilogram').fill('84,8');
  await page.getByRole('button', { name: 'Weeg' }).click();
  await expect(page.locator('.weight-hero')).toContainText('Afgevallen');
  await expect(page.locator('.weight-hero .stat').first()).not.toContainText('0,0 kg');
  await page.getByRole('button', { name: 'Mijn voortgang' }).first().click();
  await expect(page.getByRole('heading', { name: 'Gewicht en trend' })).toBeVisible();
  await expect(page.locator('.coach-box')).toBeVisible();
  await expect(page.getByText(/Week van 2 nov/)).toBeVisible();
});
