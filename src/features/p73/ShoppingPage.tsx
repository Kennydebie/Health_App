import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, CalendarClock, Check, CircleSlash, ExternalLink, Leaf, PackageCheck, PiggyBank, RefreshCw, Search, ShieldCheck, ShoppingBasket, Undo2, Wallet } from 'lucide-react';
import type { AppController } from '../../state/useAppData';
import type { ShoppingController } from '../../state/useShopping';
import type { Page } from '../../components/AppShell';
import { FoodImage } from '../../components/FoodImage';
import { toDateKey } from '../../lib/date';
import { getIngredient } from '../../data/project73/ingredients';
import { suggestSwaps, type SwapSuggestion } from '../../lib/project73/optimizer';
import { plannerContext } from '../../lib/project73/selectors';
import { describeQuantity } from '../../lib/project73/units';
import { euro, nlNumber, shortDate, timeWindow } from '../../lib/project73/format';
import type { ShoppingItem } from '../../types/shopping';
import { DemoBanner, Notice, Spinner } from './ui';

const STATUS_TEXT: Record<ShoppingItem['status'], string> = {
  matched: '', unavailable: 'Niet leverbaar', no_match: 'Geen passend product', covered_by_pantry: 'In voorraad', staple_at_home: 'Basisvoorraad', removed: 'Niet bestellen', search_failed: 'Zoeken mislukt',
};

const PICNIC_APP_URL = 'https://picnic.app/nl/';

function ItemRow({ item, shopping }: { item: ShoppingItem; shopping: ShoppingController }) {
  const line = item.lines[0];
  const product = line?.product;
  const inactive = item.status !== 'matched';
  return (
    <div className={`shop-item${inactive ? ' muted' : ''}`}>
      <FoodImage src={product?.imageUrl ?? getIngredient(item.ingredientId)?.image ?? ''} alt={product?.name ?? item.name} />
      <div className="shop-item__main">
        <strong>{product ? product.name : item.name}{product?.brand && product.source === 'picnic' ? <span className="muted"> · {product.brand}</span> : null}{product?.source === 'demo' ? <span className="pill demo" style={{ marginLeft: 6, minHeight: 18, fontSize: 10 }}>DEMO</span> : null}</strong>
        <span>
          Nodig: {describeQuantity(item.neededAmount, item.unit)}{item.pantryAmount > 0 ? ` (−${describeQuantity(item.pantryAmount, item.unit)} voorraad)` : ''}
          {item.status === 'matched' ? <> · Koopt: {item.lines.map((entry) => `${entry.count}× ${entry.product.unitQuantity}`).join(' + ')}</> : null}
        </span>
        {item.status === 'matched' && item.surplusAmount > 0 ? <span>Over: {describeQuantity(item.surplusAmount, item.unit)}{item.wasteRisk === 'high' ? ' · ⚠ risico op weggooien' : item.wasteRisk === 'low' ? ' · beetje over' : ' · blijft goed'}</span> : null}
        {inactive ? <span className={`pill ${item.status === 'unavailable' || item.status === 'no_match' || item.status === 'search_failed' ? 'warn' : ''}`} style={{ justifySelf: 'start' }}>{STATUS_TEXT[item.status]}</span> : null}
        {item.note ? <span className="small">{item.note}</span> : null}
      </div>
      <div className="shop-item__price">
        {item.status === 'matched' ? <><strong>{euro(item.costCents)}</strong><span className="muted small">{euro(item.consumedCostCents)} opgegeten</span></> : null}
        <div className="p73-row" style={{ gap: 4 }}>
          {item.status === 'matched' ? <button type="button" className="p73-btn ghost small" disabled={shopping.busy === 'item'} onClick={() => void shopping.updateItem({ action: 'remove', ingredientId: item.ingredientId })}><CircleSlash size={14} />Niet nodig</button> : null}
          {item.status === 'removed' ? <button type="button" className="p73-btn ghost small" disabled={shopping.busy === 'item'} onClick={() => void shopping.updateItem({ action: 'restore', ingredientId: item.ingredientId })}><Undo2 size={14} />Terugzetten</button> : null}
        </div>
      </div>
      {item.alternatives.length > (item.status === 'matched' ? 1 : 0) ? (
        <details>
          <summary>{item.status === 'matched' ? 'Ander product kiezen' : 'Vervangers bekijken'} ({item.alternatives.length})</summary>
          <div className="alt-list">
            {item.alternatives.map((alternative) => {
              const count = Math.max(1, Math.ceil(item.netAmount / alternative.coverage - 1e-9));
              const selected = line?.product.productId === alternative.product.productId;
              return (
                <button key={alternative.product.productId} type="button" className={selected ? 'selected' : ''} disabled={alternative.product.isUnavailable || shopping.busy === 'item'} onClick={() => void shopping.updateItem({ action: 'select', ingredientId: item.ingredientId, productId: alternative.product.productId, count })}>
                  <span><strong>{alternative.product.name}</strong> <span className="muted">{alternative.product.unitQuantity}{alternative.product.isUnavailable ? ' · niet leverbaar' : ''}{alternative.product.boughtBefore ? ' · eerder gekocht' : ''}</span></span>
                  <span>{count}× {euro(alternative.product.priceCents)}</span>
                </button>
              );
            })}
          </div>
        </details>
      ) : null}
    </div>
  );
}

export function ShoppingPage({ controller, shopping, navigate, intent, clearIntent, checkoutReturn, clearCheckoutReturn }: {
  controller: AppController;
  shopping: ShoppingController;
  navigate: (page: Page, sub?: string) => void;
  intent: string;
  clearIntent: () => void;
  checkoutReturn: string | null;
  clearCheckoutReturn: () => void;
}) {
  const { data } = controller;
  const today = toDateKey();
  const { plan, status, mealPlan, requirements, preview, syncResult, slots, attempt, busy, error } = shopping;
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [swapApplied, setSwapApplied] = useState(false);
  const pollCount = useRef(0);
  const live = status?.mode === 'live';
  const connected = status?.connection?.status === 'connected';
  const needsDemoChoice = live && !connected;
  const planIsCurrent = Boolean(plan && mealPlan && plan.mealPlanId === mealPlan.id);

  useEffect(() => {
    if (intent !== 'prepare' || !status) return;
    clearIntent();
    if (!mealPlan || !requirements.length || shopping.signedOut) return;
    if (planIsCurrent) return;
    if (needsDemoChoice) return;
    void shopping.prepare();
  }, [intent, status, mealPlan, requirements.length, planIsCurrent, needsDemoChoice, shopping, clearIntent]);

  useEffect(() => {
    if (!checkoutReturn) return;
    let cancelled = false;
    const poll = async () => {
      const result = await shopping.pollAttempt(checkoutReturn);
      pollCount.current += 1;
      if (cancelled) return;
      if (result && (result.status === 'payment_pending' || result.status === 'confirming') && pollCount.current < 20) window.setTimeout(() => void poll(), 3000);
      else clearCheckoutReturn();
    };
    void poll();
    return () => { cancelled = true; };
    // Poll once per return; the shopping controller is stable enough for this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkoutReturn]);

  const suggestions = useMemo<SwapSuggestion[]>(() => {
    if (!plan || !mealPlan || !planIsCurrent) return [];
    const input = { plan: mealPlan, shopping: plan, context: plannerContext(data, today), pantry: data.pantry, fromDate: today, staplesAtHome: data.planningPreferences.staplesAtHome };
    const waste = suggestSwaps(input, 'waste', 2);
    const budgetCents = plan.budgetCents;
    const cost = budgetCents != null && plan.totals.consumedCostCents > budgetCents ? suggestSwaps(input, 'cost', 2) : [];
    return [...waste, ...cost.filter((item) => !waste.some((other) => other.mealId === item.mealId))];
  }, [plan, mealPlan, planIsCurrent, data, today]);

  const applySwap = (suggestion: SwapSuggestion) => {
    controller.apply((current) => ({ ...current, mealPlans: current.mealPlans.map((item) => item.id === suggestion.plan.id ? suggestion.plan : item) }));
    setSwapApplied(true);
  };

  const groups = useMemo(() => {
    const items = plan?.items ?? [];
    return {
      buy: items.filter((item) => item.status === 'matched'),
      problems: items.filter((item) => item.status === 'unavailable' || item.status === 'no_match' || item.status === 'search_failed'),
      skipped: items.filter((item) => item.status === 'covered_by_pantry' || item.status === 'staple_at_home' || item.status === 'removed'),
    };
  }, [plan]);

  const cartTotal = syncResult?.cart.totalCents ?? preview?.cart.totalCents ?? null;
  const selectedSlot = slots?.find((slot) => slot.isSelected) ?? null;
  const checkoutAvailable = Boolean(status?.checkout.available && plan?.source === 'picnic');
  const steps = [
    { label: 'Plan', done: Boolean(mealPlan) },
    { label: 'Producten', done: Boolean(plan && planIsCurrent) },
    { label: 'Mandje', done: Boolean(plan?.cartSyncedAt) },
    { label: 'Bezorgmoment', done: Boolean(selectedSlot) },
    { label: 'Bestellen', done: attempt?.status === 'confirmed' || data.shoppingStatus?.order?.status === 'handoff' },
  ];
  const currentStep = steps.findIndex((step) => !step.done);

  if (!mealPlan) {
    return (
      <section className="page p73">
        <header className="p73-title"><div><p className="p73-kicker">Boodschappen</p><h1>Eerst een plan</h1><p>De boodschappenlijst volgt uit je maaltijdplan.</p></div></header>
        <div className="p73-card"><div className="empty-p73"><ShoppingBasket size={34} /><h3>Nog geen maaltijden gepland</h3><p>Plan je maaltijden; daarna zoekt de app de juiste producten bij Picnic.</p><button type="button" className="p73-btn primary" onClick={() => navigate('plan', 'plan')}>Naar mijn voedingsplan</button></div></div>
      </section>
    );
  }

  return (
    <section className="page p73">
      <header className="p73-title">
        <div>
          <p className="p73-kicker">Boodschappen</p>
          <h1>{plan && planIsCurrent ? `${groups.buy.length} producten, ${euro(plan.totals.costCents)}` : 'Boodschappen voor je plan'}</h1>
          <p>De app telt je ingrediënten op, zoekt echte Picnic-producten en kiest verpakkingen met zo min mogelijk verspilling. Jij keurt alles goed.</p>
        </div>
        <div className="shop-steps" aria-label="Stappen">{steps.map((step, index) => <span key={step.label} className={step.done ? 'done' : index === currentStep ? 'current' : ''}>{step.done ? <Check size={13} /> : `${index + 1}.`} {step.label}</span>)}</div>
      </header>

      {shopping.signedOut ? <Notice tone="warn" title="Niet ingelogd">Log in om producten te zoeken en je mandje te vullen. Je boodschappenlijst hieronder werkt ook zonder account.</Notice> : null}
      {status?.mode === 'mock' ? <DemoBanner>De server draait in demo-modus. Producten en prijzen zijn voorbeelden; er wordt niets bij Picnic besteld.</DemoBanner> : null}
      {needsDemoChoice && !plan ? <Notice tone="info" title="Picnic nog niet gekoppeld">Koppel je account in Instellingen om echte producten en prijzen te zien, of bekijk eerst een demo.</Notice> : null}
      {status?.connection?.status === 'expired' ? <Notice tone="warn" title="Picnic-sessie verlopen">Log opnieuw in via Instellingen → Picnic.</Notice> : null}
      {error ? <Notice tone="bad" title="Dat lukte niet">{error}</Notice> : null}

      <div className="p73-grid">
        <div className="p73-span-8 p73-stack" style={{ gap: 18 }}>
          <article className="p73-card">
            <div className="p73-card-head">
              <div><h2>{plan && planIsCurrent ? 'Gevonden producten' : 'Jouw boodschappenlijst'}</h2><p>{requirements.length} ingrediënten voor {mealPlan.days} dagen{data.pantry.length ? ', voorraad al afgetrokken' : ''}.</p></div>
              <div className="segmented" aria-label="Optimaliseren voor">
                {(['balanced', 'cheapest'] as const).map((mode) => <button key={mode} type="button" className={(plan?.mode ?? 'balanced') === mode ? 'active' : ''} onClick={() => void shopping.prepare({ mode, demo: plan?.source === 'demo' })} disabled={!plan || busy != null}>{mode === 'balanced' ? 'Beste match' : 'Goedkoopst'}</button>)}
              </div>
            </div>
            {plan?.source === 'demo' && planIsCurrent ? <div style={{ marginBottom: 12 }}><DemoBanner /></div> : null}

            {!plan || !planIsCurrent ? (
              <>
                <ul className="ingredient-list" style={{ marginBottom: 16 }}>
                  {requirements.map((requirement) => <li key={requirement.ingredientId}><span>{requirement.name}{requirement.staple && data.planningPreferences.staplesAtHome ? <span className="muted"> · basisvoorraad</span> : null}</span><span>{describeQuantity(requirement.netAmount, requirement.unit)}{requirement.pantryAmount > 0 ? ` (van ${describeQuantity(requirement.amount, requirement.unit)})` : ''}</span></li>)}
                </ul>
                <div className="p73-row">
                  {!needsDemoChoice ? <button type="button" className="p73-btn primary" disabled={busy === 'prepare' || shopping.signedOut} onClick={() => void shopping.prepare()}>{busy === 'prepare' ? <Spinner /> : <Search size={16} />}Zoek boodschappen bij Picnic</button> : (
                    <>
                      <button type="button" className="p73-btn primary" onClick={() => navigate('settings', 'picnic')}>Koppel Picnic</button>
                      <button type="button" className="p73-btn secondary" disabled={busy === 'prepare' || shopping.signedOut} onClick={() => void shopping.prepare({ demo: true })}>{busy === 'prepare' ? <Spinner /> : null}Bekijk demo</button>
                    </>
                  )}
                </div>
                {busy === 'prepare' ? <p className="muted small" style={{ marginTop: 10 }}>Producten zoeken en verpakkingen vergelijken…</p> : null}
              </>
            ) : (
              <div className="shop-items">
                {groups.buy.map((item) => <ItemRow key={item.ingredientId} item={item} shopping={shopping} />)}
                {groups.problems.length ? <><h3 style={{ margin: '10px 0 2px' }}>Niet gevonden of niet leverbaar</h3>{groups.problems.map((item) => <ItemRow key={item.ingredientId} item={item} shopping={shopping} />)}</> : null}
                {groups.skipped.length ? <details><summary className="muted small" style={{ cursor: 'pointer' }}>Niet nodig om te kopen ({groups.skipped.length})</summary><div className="shop-items" style={{ marginTop: 8 }}>{groups.skipped.map((item) => <ItemRow key={item.ingredientId} item={item} shopping={shopping} />)}</div></details> : null}
                <div className="p73-row"><button type="button" className="p73-btn ghost small" onClick={() => void shopping.prepare({ demo: plan.source === 'demo' })} disabled={busy != null}><RefreshCw size={14} />Opnieuw zoeken</button><span className="muted small">Gezocht op {shortDate(plan.createdAt.slice(0, 10))} om {new Date(plan.createdAt).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}</span></div>
              </div>
            )}
          </article>

          {plan && planIsCurrent && suggestions.length ? (
            <article className="p73-card">
              <div className="p73-card-head"><div><h2>Slimmer combineren</h2><p>Kleine wissels die overgebleven verpakkingen opmaken of de lijst goedkoper maken. Voeding wordt opnieuw doorgerekend.</p></div><Leaf size={20} color="var(--accent)" /></div>
              <div className="p73-stack">
                {suggestions.map((suggestion) => (
                  <div key={suggestion.mealId + suggestion.toRecipeId} className="meal-row" style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}>
                    <div className="meal-row__body">
                      <span className="meal-row__slot">{shortDate(suggestion.date)} · {suggestion.reason}</span>
                      <span className="meal-row__name">{suggestion.fromName} → {suggestion.toName}</span>
                      <span className="meal-row__meta">{suggestion.costDeltaCents <= 0 ? `${euro(-suggestion.costDeltaCents)} goedkoper` : `${euro(suggestion.costDeltaCents)} duurder`} · {suggestion.wasteDeltaCents < 0 ? `${euro(-suggestion.wasteDeltaCents)} minder verspilling` : 'gelijke verspilling'} · dag {nlNumber(suggestion.dayKcal)} kcal / {nlNumber(suggestion.dayProtein)} g eiwit</span>
                    </div>
                    <button type="button" className="p73-btn secondary small" onClick={() => applySwap(suggestion)}>Toepassen</button>
                  </div>
                ))}
              </div>
            </article>
          ) : null}
          {swapApplied ? <Notice tone="good" title="Plan aangepast">Werk je boodschappenlijst bij om de nieuwe producten te zoeken.<br /><button type="button" className="p73-btn primary small" style={{ marginTop: 8 }} onClick={() => { setSwapApplied(false); void shopping.prepare({ demo: plan?.source === 'demo' }); }}>Lijst bijwerken</button></Notice> : null}
        </div>

        <aside className="p73-span-4 p73-stack" style={{ gap: 18, alignContent: 'start' }}>
          {plan && planIsCurrent ? (
            <article className="p73-card">
              <h2>Overzicht</h2>
              <div className="totals-box" style={{ marginTop: 12 }}>
                <div><span>Producten ({plan.totals.packageCount} verpakkingen)</span><span>{euro(plan.totals.costCents)}</span></div>
                <div className="muted"><span>Waarvan je opeet in dit plan</span><span>{euro(plan.totals.consumedCostCents)}</span></div>
                <div className="muted"><span>Blijft over (voorraad/restjes)</span><span>{euro(plan.totals.surplusCostCents)}</span></div>
                {plan.budgetCents != null ? <div className={plan.totals.consumedCostCents > plan.budgetCents ? '' : 'muted'}><span>Budget voor {mealPlan.days} dagen (opgegeten)</span><span>{euro(plan.budgetCents)}</span></div> : null}
                <div className="grand"><span>Totaal producten</span><span>{euro(plan.totals.costCents)}</span></div>
              </div>
              {plan.budgetCents != null && plan.totals.consumedCostCents > plan.budgetCents ? <div style={{ marginTop: 10 }}><Notice tone="warn" title="Boven je budget">Wat je in dit plan opeet kost meer dan je budget. Kies “Goedkoopst” of pas een wissel toe.</Notice></div> : null}
              {plan.totals.unavailableCount + plan.totals.noMatchCount > 0 ? <p className="muted small" style={{ margin: '10px 0 0' }}>{plan.totals.unavailableCount + plan.totals.noMatchCount} ingrediënt(en) zonder product. Kies een vervanger of koop elders.</p> : null}
              <p className="muted small" style={{ margin: '10px 0 0' }}>Bezorgkosten en statiegeld rekent Picnic in je mandje; je ziet het echte totaal vóór het bestellen.</p>
            </article>
          ) : null}

          {plan && planIsCurrent ? (
            <article className="p73-card">
              <div className="p73-card-head"><div><h2>Picnic-mandje</h2><p>Eerst zie je precies wat er verandert.</p></div><ShoppingBasket size={20} color="var(--muted)" /></div>
              <label className="switch" style={{ paddingTop: 0 }}><span>Tel wat al in je mandje ligt mee<p>Voorkomt dubbele producten.</p></span><input type="checkbox" checked={shopping.countExistingItems} onChange={(event) => shopping.setCountExistingItems(event.target.checked)} /></label>
              {!preview ? <button type="button" className="p73-btn secondary block" style={{ marginTop: 10 }} disabled={busy != null || shopping.signedOut} onClick={() => void shopping.loadPreview()}>{busy === 'preview' ? <Spinner /> : null}Bekijk wijzigingen</button> : (
                <div className="p73-stack" style={{ marginTop: 10 }}>
                  {preview.diff.operations.length ? (
                    <ul className="diff-list">
                      {preview.diff.operations.map((operation) => <li key={operation.productId} className={operation.action}><span>{operation.name}</span><b>{operation.action === 'add' ? `+${operation.count}` : `−${operation.count}`} ({operation.fromCount} → {operation.toCount})</b></li>)}
                    </ul>
                  ) : <Notice tone="good" title="Je mandje is al up-to-date" />}
                  {preview.diff.alreadyInCart.length ? <p className="muted small" style={{ margin: 0 }}>Al in je mandje en meegeteld: {preview.diff.alreadyInCart.map((item) => `${item.count}× ${item.name}`).join(', ')}.</p> : null}
                  {preview.diff.untouched.length ? <p className="muted small" style={{ margin: 0 }}>{preview.diff.untouched.length} ander(e) product(en) in je mandje blijven onaangeroerd.</p> : null}
                  {preview.diff.operations.some((operation) => operation.action === 'remove') ? <Notice tone="warn" title="Er wordt iets verwijderd">Alleen producten die de app eerder voor dit plan toevoegde. Jouw eigen producten blijven staan.</Notice> : null}
                  <button type="button" className="p73-btn primary block" disabled={busy != null || !preview.diff.operations.length} onClick={() => void shopping.sync()}>{busy === 'sync' ? <Spinner /> : <PackageCheck size={16} />}Vul mijn Picnic-winkelmandje</button>
                </div>
              )}
              {syncResult ? (
                <div style={{ marginTop: 12 }}>
                  {syncResult.status === 'synced' ? <Notice tone="good" title={syncResult.replayed ? 'Al gedaan: niets dubbel toegevoegd' : `Mandje bijgewerkt${plan.source === 'demo' ? ' (demo)' : ''}`}>{syncResult.cart.totalCount} producten · {euro(syncResult.cart.totalCents)} in je {plan.source === 'demo' ? 'demomandje' : 'Picnic-mandje'}.</Notice>
                    : <Notice tone="warn" title="Mandje deels bijgewerkt">{syncResult.failure ?? `${syncResult.mismatches.length} product(en) wijken af. Controleer je mandje.`}</Notice>}
                  {plan.items.some((item) => item.status === 'matched' && item.wasteRisk === 'none' && item.surplusAmount > 0) ? <button type="button" className="p73-btn ghost small" style={{ marginTop: 8 }} onClick={shopping.moveSurplusToPantry}>Houdbare restjes naar mijn voorraad</button> : null}
                </div>
              ) : null}
            </article>
          ) : null}

          {plan && planIsCurrent && plan.cartSyncedAt ? (
            <article className="p73-card">
              <div className="p73-card-head"><div><h2>Bezorgmoment</h2><p>Echte beschikbaarheid van {plan.source === 'demo' ? 'de demo' : 'Picnic'}.</p></div><CalendarClock size={20} color="var(--muted)" /></div>
              {!slots ? <button type="button" className="p73-btn secondary block" disabled={busy != null} onClick={() => void shopping.loadSlots()}>{busy === 'slots' ? <Spinner /> : null}Toon bezorgmomenten</button> : (
                <div className="slot-grid">
                  {slots.slice(0, 12).map((slot) => {
                    const slotTime = timeWindow(slot.windowStart, slot.windowEnd);
                    return <button key={slot.slotId} type="button" disabled={!slot.isAvailable || busy != null} className={slot.isSelected ? 'selected' : ''} onClick={() => void shopping.chooseSlot(slot.slotId)}><strong>{slotTime.day}</strong><small>{slotTime.time}{!slot.isAvailable ? ' · vol' : ''}</small></button>;
                  })}
                  {!slots.length ? <p className="muted">Geen bezorgmomenten beschikbaar.</p> : null}
                </div>
              )}
            </article>
          ) : null}

          {plan && planIsCurrent && plan.cartSyncedAt ? (
            <article className="p73-card">
              <div className="p73-card-head"><div><h2>Bestellen</h2><p>{checkoutAvailable ? 'Direct bestellen staat aan.' : 'Rond je bestelling af in de Picnic-app.'}</p></div><ShieldCheck size={20} color="var(--muted)" /></div>
              {attempt?.status === 'confirmed' ? <Notice tone="good" title="Bestelling bevestigd door Picnic">Bestelnummer {attempt.orderId}. Je vindt de bestelling ook in de Picnic-app.</Notice>
                : attempt && (attempt.status === 'payment_pending' || attempt.status === 'confirming') ? <Notice tone="info" title="Wacht op betaling">Rond de betaling af bij je bank. Daarna bevestigt de app de bestelling bij Picnic.<br /><button type="button" className="p73-btn secondary small" style={{ marginTop: 8 }} onClick={() => void shopping.pollAttempt(attempt.attemptId)}>Status controleren</button> <button type="button" className="p73-btn ghost small" style={{ marginTop: 8 }} onClick={() => void shopping.cancelAttempt(attempt.attemptId)}>Annuleren</button></Notice>
                : attempt && ['failed', 'cancelled', 'price_changed'].includes(attempt.status) ? <Notice tone="warn" title={attempt.status === 'price_changed' ? 'Prijs gewijzigd: er is niets besteld' : attempt.status === 'cancelled' ? 'Bestelling geannuleerd' : 'Bestellen is niet gelukt'}>Controleer je mandje en probeer het opnieuw, of rond af in de Picnic-app.</Notice> : null}
              {checkoutAvailable && attempt?.status !== 'confirmed' ? (
                <div className="p73-stack" style={{ marginTop: 10 }}>
                  <div className="totals-box">
                    <div><span>Totaal volgens Picnic</span><span>{cartTotal != null ? euro(cartTotal) : '—'}</span></div>
                    <div className="muted"><span>Bezorgmoment</span><span>{selectedSlot ? `${timeWindow(selectedSlot.windowStart, selectedSlot.windowEnd).day} ${timeWindow(selectedSlot.windowStart, selectedSlot.windowEnd).time}` : 'nog niet gekozen'}</span></div>
                  </div>
                  <label className="switch"><span>Ik heb het overzicht gecontroleerd<p>Je betaalt via je eigen bank. Zonder jouw akkoord bij de bank wordt er niets besteld.</p></span><input type="checkbox" checked={confirmChecked} onChange={(event) => setConfirmChecked(event.target.checked)} /></label>
                  <button type="button" className="p73-btn primary block" disabled={!confirmChecked || !selectedSlot || cartTotal == null || busy != null} onClick={async () => {
                    const redirect = await shopping.startCheckout(cartTotal ?? 0);
                    if (redirect) window.location.assign(redirect);
                  }}>{busy === 'checkout' ? <Spinner /> : <Wallet size={16} />}Bestelling goedkeuren</button>
                </div>
              ) : null}
              {!checkoutAvailable ? (
                <div className="p73-stack" style={{ marginTop: 10 }}>
                  {plan.source === 'demo' ? <Notice tone="info" title="Demo">In demo-modus wordt er nooit besteld.</Notice> : null}
                  <a className="p73-btn primary block" href={PICNIC_APP_URL} target="_blank" rel="noreferrer" onClick={shopping.markHandoff}><ExternalLink size={16} />Rond af in de Picnic-app</a>
                  <p className="muted small" style={{ margin: 0 }}>Je mandje staat klaar in je Picnic-account. Let op: dit is nog <strong>geen</strong> bestelling. Je bestelt pas als je in de Picnic-app afrekent.</p>
                  {live && connected ? <button type="button" className="p73-btn ghost small" onClick={() => navigate('settings', 'picnic')}>Direct bestellen inschakelen <ArrowRight size={13} /></button> : null}
                </div>
              ) : null}
            </article>
          ) : null}

          {!plan || !planIsCurrent ? (
            <article className="p73-card">
              <h2>Zo werkt het</h2>
              <ol className="steps" style={{ color: 'var(--muted)' }}>
                <li>De app zoekt per ingrediënt echte producten en prijzen.</li>
                <li>Verpakkingen worden slim gecombineerd: 450 g kip = één pak van 500 g.</li>
                <li>Je ziet precies wat er in je mandje verandert; niets gaat er dubbel in.</li>
                <li>Je kiest een bezorgmoment en keurt de bestelling zelf goed.</li>
              </ol>
              <div className="p73-row" style={{ marginTop: 8 }}><PiggyBank size={16} color="var(--muted)" /><span className="muted small">Budget: {data.planningPreferences.weeklyGroceryBudgetEur ? `${euro(data.planningPreferences.weeklyGroceryBudgetEur * 100)} per week` : 'geen'}</span></div>
            </article>
          ) : null}
        </aside>
      </div>
    </section>
  );
}
