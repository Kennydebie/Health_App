import { lazy, Suspense, useMemo, useState } from 'react';
import { ChefHat, Clock3, Flame, Heart, Lock, LockOpen, RefreshCw, Search, Shuffle, Sparkles } from 'lucide-react';
import type { AppController } from '../../state/useAppData';
import type { ShoppingController } from '../../state/useShopping';
import type { Page } from '../../components/AppShell';
import { FoodImage } from '../../components/FoodImage';
import { Modal } from '../../components/Modal';
import { PageSkeleton } from '../../components/Visuals';
import { toDateKey } from '../../lib/date';
import { createPlan, regeneratePlanDay, replacePlannedMeal, reuseRecipe, setMealServings, toggleFavoriteRecipe, toggleMealLock } from '../../lib/project73/actions';
import { activePlan, allRecipes, mealDetails, mealsOn, plannedDayTotals, plannerContext } from '../../lib/project73/selectors';
import { eligibleRecipes, planDates, SLOT_LABELS } from '../../lib/project73/mealPlanner';
import { formatAmount } from '../../lib/project73/recipeMath';
import { dayLabel, nlNumber, shortDate } from '../../lib/project73/format';
import type { MealSlot, PlannedMeal } from '../../types/project73';
import { EatenControls } from './MealRow';
import { Notice, TargetBar } from './ui';

const FoodPage = lazy(() => import('../FoodPage').then((module) => ({ default: module.FoodPage })));

const METHOD_LABELS: Record<string, string> = { no_cook: 'Zonder koken', oven: 'Oven', airfryer: 'Airfryer', pan: 'Pan', microwave: 'Magnetron', stovetop: 'Kookplaat' };

function availabilityFor(shopping: ShoppingController, ingredientId: string) {
  const item = shopping.plan?.items.find((entry) => entry.ingredientId === ingredientId);
  if (!item) return null;
  if (item.status === 'matched') return { tone: 'good', label: item.lines[0] ? `${item.lines[0].product.name}${shopping.isDemo ? ' (demo)' : ''}` : 'Gevonden' };
  if (item.status === 'covered_by_pantry') return { tone: 'good', label: 'In voorraad' };
  if (item.status === 'staple_at_home') return { tone: '', label: 'Basisvoorraad' };
  if (item.status === 'unavailable') return { tone: 'bad', label: 'Niet leverbaar' };
  if (item.status === 'removed') return { tone: '', label: 'Niet bestellen' };
  return { tone: 'warn', label: 'Geen match' };
}

function MealCard({ meal, controller, shopping, onChoose }: { meal: PlannedMeal; controller: AppController; shopping: ShoppingController; onChoose: () => void }) {
  const { data } = controller;
  const today = toDateKey();
  const details = mealDetails(data, meal);
  if (!details) return null;
  const { recipe, nutrition } = details;
  const favorite = data.favoriteRecipeIds.includes(recipe.id);
  const editable = meal.status === 'planned';
  const leftover = Boolean(meal.leftoverOfMealId);
  return (
    <article className="meal-card fade-in">
      <div className="meal-card__top">
        <FoodImage src={recipe.image ?? ''} alt={recipe.name} />
        <div style={{ minWidth: 0 }}>
          <div className="p73-row between">
            <span className="meal-row__slot">{SLOT_LABELS[meal.slot]}{leftover ? ' · restje van gisteren' : ''}</span>
            <button type="button" className="p73-btn ghost small icon" aria-pressed={favorite} aria-label={favorite ? 'Verwijder uit favorieten' : 'Bewaar als favoriet'} onClick={() => controller.apply(toggleFavoriteRecipe(recipe.id))}><Heart size={16} fill={favorite ? 'currentColor' : 'none'} color={favorite ? 'var(--favorite)' : undefined} /></button>
          </div>
          <h3>{recipe.name}</h3>
          <div className="macro-line">
            <span><b>{nlNumber(nutrition.totals.kcal)}</b> kcal</span>
            <span><b>{nlNumber(nutrition.totals.protein)}</b> g eiwit</span>
            <span><b>{nlNumber(nutrition.totals.carbs)}</b> g kh</span>
            <span><b>{nlNumber(nutrition.totals.fat)}</b> g vet</span>
          </div>
          <div className="macro-line" style={{ marginTop: 6 }}>
            <span><Clock3 size={13} style={{ verticalAlign: '-2px' }} /> {leftover ? 'Opwarmen' : `${recipe.prepMinutes} min actief${recipe.totalMinutes > recipe.prepMinutes ? ` · ${recipe.totalMinutes} min totaal` : ''}`}</span>
            <span><Flame size={13} style={{ verticalAlign: '-2px' }} /> {METHOD_LABELS[recipe.method]}</span>
            {nutrition.hasEstimates ? <span className="pill warn" title="Berekend met standaardwaarden. Na koppeling met een Picnic-product gebruikt de app het echte etiket.">Deels geschat</span> : <span className="pill good">Etiket</span>}
          </div>
        </div>
      </div>
      <div className="p73-row between">
        <div className="p73-row" style={{ gap: 6 }}>
          <div className="portion-stepper" aria-label="Portiegrootte">
            <button type="button" disabled={!editable || leftover} onClick={() => controller.apply(setMealServings(meal.id, meal.servings - 0.25))} aria-label="Kleinere portie">−</button>
            <span className="num">{nlNumber(meal.servings, 2).replace(/,?0+$/, '')}×</span>
            <button type="button" disabled={!editable || leftover} onClick={() => controller.apply(setMealServings(meal.id, meal.servings + 0.25))} aria-label="Grotere portie">+</button>
          </div>
          <button type="button" className="p73-btn ghost small" disabled={!editable} aria-pressed={meal.locked} onClick={() => controller.apply(toggleMealLock(meal.id))}>{meal.locked ? <Lock size={14} /> : <LockOpen size={14} />}{meal.locked ? 'Vast' : 'Vastzetten'}</button>
          <button type="button" className="p73-btn ghost small" disabled={!editable || meal.locked} onClick={() => controller.apply(replacePlannedMeal(meal.id, today))}><Shuffle size={14} />Vervang</button>
          <button type="button" className="p73-btn ghost small" disabled={!editable || meal.locked} onClick={onChoose}><Search size={14} />Kies zelf</button>
        </div>
        <EatenControls meal={meal} controller={controller} />
      </div>
      <details>
        <summary>Ingrediënten en bereiding</summary>
        <ul className="ingredient-list">
          {nutrition.ingredients.map((item) => {
            const availability = availabilityFor(shopping, item.ingredient.id);
            return (
              <li key={item.ingredient.id}>
                <span>{item.ingredient.name}{item.verified ? ' ✓' : ''}{availability ? <> · <span className={`pill ${availability.tone}`} style={{ minHeight: 20, fontSize: 11 }}>{availability.label}</span></> : null}</span>
                <span>{formatAmount(item.amount, item.unit)}{item.unit === 'piece' && item.ingredient.gramsPerPiece ? ` (≈${Math.round(item.amount * item.ingredient.gramsPerPiece)} g)` : ''}</span>
              </li>
            );
          })}
        </ul>
        <ol className="steps">{recipe.steps.map((step) => <li key={step}>{step}</li>)}</ol>
        <p className="muted small" style={{ margin: '8px 0 0' }}>Hoeveelheden zijn rauw of droog gewogen, voor {nlNumber(meal.servings, 2).replace(/,?0+$/, '')} portie. {recipe.batchFriendly ? 'Kook gerust een extra portie voor morgen.' : ''}</p>
      </details>
    </article>
  );
}

function RecipePicker({ open, onClose, slot, onPick, controller }: { open: boolean; onClose: () => void; slot: MealSlot; onPick: (recipeId: string) => void; controller: AppController }) {
  const { data } = controller;
  const [query, setQuery] = useState('');
  const today = toDateKey();
  const options = useMemo(() => {
    const context = plannerContext(data, today);
    const recent = new Set(data.mealPlans.flatMap((plan) => plan.meals.filter((meal) => meal.status === 'eaten').map((meal) => meal.recipeId)));
    return eligibleRecipes(context, slot)
      .filter((recipe) => recipe.name.toLowerCase().includes(query.toLowerCase()))
      .map((recipe) => ({ recipe, favorite: data.favoriteRecipeIds.includes(recipe.id), recent: recent.has(recipe.id), kcal: mealDetails(data, { recipeId: recipe.id, servings: 1 })?.nutrition.totals }))
      .sort((a, b) => Number(b.favorite) - Number(a.favorite) || Number(b.recent) - Number(a.recent) || a.recipe.name.localeCompare(b.recipe.name, 'nl'));
  }, [data, slot, query, today]);
  return (
    <Modal open={open} onClose={onClose} title={`Kies ${SLOT_LABELS[slot].toLowerCase()}`} subtitle="Favorieten en eerder gegeten maaltijden staan bovenaan. De dag wordt daarna opnieuw doorgerekend.">
      <div className="p73-form">
        <label className="p73-field">Zoeken<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Bijv. kip, zalm, kwark" /></label>
        <div className="alt-list">
          {options.map(({ recipe, favorite, recent, kcal }) => (
            <button key={recipe.id} type="button" onClick={() => { onPick(recipe.id); onClose(); }}>
              <span><strong>{recipe.name}</strong><br /><span className="muted small">{favorite ? '♥ favoriet · ' : ''}{recent ? 'eerder gegeten · ' : ''}{recipe.prepMinutes} min · {METHOD_LABELS[recipe.method].toLowerCase()}</span></span>
              <span>{kcal ? `${nlNumber(kcal.kcal)} kcal · ${nlNumber(kcal.protein)} g` : ''}</span>
            </button>
          ))}
          {!options.length ? <p className="muted">Geen recepten die passen bij je voorkeuren.</p> : null}
        </div>
      </div>
    </Modal>
  );
}

export function MealPlanPage({ controller, shopping, navigate, tab, setTab }: { controller: AppController; shopping: ShoppingController; navigate: (page: Page, sub?: string) => void; tab: string; setTab: (tab: string) => void }) {
  const { data } = controller;
  const today = toDateKey();
  const plan = activePlan(data);
  const dates = plan ? planDates(plan) : [];
  const [selected, setSelected] = useState<string | null>(null);
  const [horizon, setHorizon] = useState<3 | 7>(data.planningPreferences.horizonDays >= 7 ? 7 : 3);
  const [picker, setPicker] = useState<{ mealId: string | null; slot: MealSlot } | null>(null);
  const day = selected && dates.includes(selected) ? selected : dates.includes(today) ? today : dates[0] ?? today;
  const meals = mealsOn(data, day);
  const totals = plannedDayTotals(data, day);
  const recipesUsed = useMemo(() => allRecipes(data).length, [data]);

  const generate = () => {
    if (plan && dates.some((date) => date >= today) && !window.confirm('Je huidige plan wordt vervangen. Gegeten en vastgezette maaltijden blijven staan. Doorgaan?')) return;
    controller.apply(createPlan(today, horizon, today));
    setSelected(today);
  };

  if (tab === 'log') {
    return (
      <>
        <div className="page" style={{ paddingBottom: 0 }}><div className="subnav" role="tablist"><button type="button" role="tab" aria-selected={false} onClick={() => setTab('plan')}>Plan</button><button type="button" role="tab" aria-selected className="active">Logboek</button></div></div>
        <div className="legacy-scope"><Suspense fallback={<PageSkeleton />}><FoodPage controller={controller} /></Suspense></div>
      </>
    );
  }

  return (
    <section className="page p73">
      <header className="p73-title">
        <div>
          <p className="p73-kicker">Mijn voedingsplan</p>
          <h1>{plan ? `${dates.length} dagen, klaar om te koken` : 'Plan je eten in één klik'}</h1>
          <p>Elke dag rond {nlNumber(data.profile.calorieTarget)} kcal en {data.profile.proteinTarget} g eiwit, met simpele recepten van maximaal {data.planningPreferences.maxPrepMinutes} minuten.</p>
        </div>
        <div className="p73-row">
          <div className="segmented" role="radiogroup" aria-label="Aantal dagen">
            {[3, 7].map((value) => <button key={value} type="button" role="radio" aria-checked={horizon === value} className={horizon === value ? 'active' : ''} onClick={() => setHorizon(value as 3 | 7)}>{value} dagen</button>)}
          </div>
          <button type="button" className="p73-btn primary" onClick={generate}><Sparkles size={16} />{plan ? 'Nieuw plan' : 'Plan mijn maaltijden'}</button>
        </div>
      </header>
      <div className="subnav" role="tablist"><button type="button" role="tab" aria-selected className="active">Plan</button><button type="button" role="tab" aria-selected={false} onClick={() => setTab('log')}>Logboek</button></div>

      {!plan ? (
        <div className="p73-card"><div className="empty-p73"><ChefHat size={34} /><h3>Nog geen plan</h3><p>Kies 3 of 7 dagen. De app kiest uit {recipesUsed} simpele recepten, deelt ingrediënten tussen maaltijden en plant restjes in, zodat je minder kookt en minder weggooit.</p><button type="button" className="p73-btn primary" onClick={generate}>Plan mijn maaltijden</button></div></div>
      ) : (
        <>
          <div className="day-tabs-p73" role="tablist" aria-label="Dagen">
            {dates.map((date) => {
              const dayTotals = plannedDayTotals(data, date);
              return <button key={date} type="button" role="tab" aria-selected={date === day} className={date === day ? 'active' : ''} onClick={() => setSelected(date)}><strong>{dayLabel(date, today)}</strong><small>{shortDate(date)} · {nlNumber(dayTotals.kcal)} kcal</small></button>;
            })}
          </div>

          <div className="p73-grid">
            <div className="p73-span-8 p73-stack" style={{ gap: 12 }}>
              {meals.map((meal) => <MealCard key={meal.id} meal={meal} controller={controller} shopping={shopping} onChoose={() => setPicker({ mealId: meal.id, slot: meal.slot })} />)}
              <div className="p73-row">
                <button type="button" className="p73-btn secondary" onClick={() => controller.apply(regeneratePlanDay(plan.id, day, today))}><RefreshCw size={15} />Hele dag opnieuw</button>
                <button type="button" className="p73-btn ghost" onClick={() => setPicker({ mealId: null, slot: 'snack' })}>+ Tussendoortje toevoegen</button>
              </div>
            </div>
            <aside className="p73-span-4 p73-stack" style={{ gap: 18, alignContent: 'start' }}>
              <article className="p73-card">
                <div className="p73-card-head"><div><h2>{dayLabel(day, today)}</h2><p>Gepland vs. dagdoel</p></div></div>
                <div className="target-bars">
                  <TargetBar label="Calorieën" value={totals.kcal} target={data.profile.calorieTarget} unit="kcal" />
                  <TargetBar label="Eiwit" value={totals.protein} target={data.profile.proteinTarget} unit="g" />
                  <TargetBar label="Koolhydraten" value={totals.carbs} target={data.profile.carbTarget} unit="g" />
                  <TargetBar label="Vet" value={totals.fat} target={data.profile.fatTarget} unit="g" />
                  <TargetBar label="Vezels" value={totals.fiber} target={data.metabolicSettings.overrides.fiber ?? 30} unit="g" />
                  <TargetBar label="Groente en fruit" value={totals.fruitVegGrams} target={450} unit="g" />
                </div>
                {meals.some((meal) => mealDetails(data, meal)?.nutrition.hasEstimates) ? <p className="muted small" style={{ margin: '12px 0 0' }}>Waarden met “deels geschat” zijn berekend uit standaardwaarden per 100 g. Zodra Picnic-producten met etiket gekoppeld zijn, rekent de app daarmee.</p> : null}
              </article>
              <article className="p73-card">
                <h2>Boodschappen voor dit plan</h2>
                <p className="muted small" style={{ margin: '6px 0 14px' }}>De app telt alle ingrediënten op, trekt je voorraad af en zoekt passende verpakkingen.</p>
                <button type="button" className="p73-btn primary block" onClick={() => navigate('shopping', 'prepare')}>Zoek boodschappen bij Picnic</button>
              </article>
              {meals.some((meal) => meal.leftoverOfMealId) ? <Notice tone="info" title="Restjes ingepland">Kook bij het avondeten een extra portie; die eet je de volgende dag als lunch.</Notice> : null}
            </aside>
          </div>
        </>
      )}
      {picker ? <RecipePicker open slot={picker.slot} controller={controller} onClose={() => setPicker(null)} onPick={(recipeId) => {
        if (picker.mealId) controller.apply(replacePlannedMeal(picker.mealId, today, recipeId));
        else controller.apply(reuseRecipe(recipeId, day, picker.slot, today));
      }} /> : null}
    </section>
  );
}
