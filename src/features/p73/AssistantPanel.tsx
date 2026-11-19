import { useEffect, useRef, useState } from 'react';
import { Mic, Send, Sparkles, X } from 'lucide-react';
import type { AppController } from '../../state/useAppData';
import type { ShoppingController } from '../../state/useShopping';
import type { Page } from '../../components/AppShell';
import type { AppData } from '../../types/models';
import { toDateKey } from '../../lib/date';
import { getIngredient } from '../../data/project73/ingredients';
import { api } from '../../lib/project73/api';
import { parseIntentWithRules, resolveIngredientWord, ruleReply, type AssistantIntent } from '../../lib/project73/assistantIntents';
import { createPlan, replacePlannedMeal, updateMetabolicSettings, upsertPantryItem } from '../../lib/project73/actions';
import { activePlan, adherenceSummary, allRecipes, mealDetails, plannerContext, progressAssessment, recipeMapFor } from '../../lib/project73/selectors';
import { eligibleRecipes, SLOT_LABELS } from '../../lib/project73/mealPlanner';
import { consolidateRequirements } from '../../lib/project73/grocery';
import { addDays } from '../../lib/project73/weightTrend';
import { dayLabel, nlNumber } from '../../lib/project73/format';
import { describeQuantity } from '../../lib/project73/units';

interface Proposal { summary: string[]; label: string; run: () => void }
interface Message { id: string; role: 'user' | 'bot'; text: string; proposal?: Proposal | null; source?: 'ai' | 'rules'; applied?: boolean }

const EXAMPLES = ['Plan mijn eten voor drie dagen.', 'Vervang zalm door kip.', 'Ik heb nog rijst en eieren thuis.', 'Ik wil vandaag niet koken.', 'Waarom val ik niet af?', 'Maak de boodschappenlijst goedkoper.', 'Zorg dat ik 140 gram eiwit binnenkrijg.'];

type SpeechRecognitionLike = { lang: string; interimResults: boolean; onresult: (event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void; onend: () => void; onerror: () => void; start: () => void; stop: () => void };

function speechRecognition(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === 'undefined') return null;
  const candidate = (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike });
  return candidate.SpeechRecognition ?? candidate.webkitSpeechRecognition ?? null;
}

/** Turns an intent into a concrete, previewed change. Every number comes from the deterministic engine. */
function buildProposal(intent: AssistantIntent, data: AppData, controller: AppController, shopping: ShoppingController, navigate: (page: Page, sub?: string) => void): { text?: string; proposal: Proposal | null } {
  const today = toDateKey();
  const plan = activePlan(data);
  const recipes = recipeMapFor(data);
  switch (intent.intent) {
    case 'plan_meals': {
      const days = intent.days ?? data.planningPreferences.horizonDays;
      return { proposal: { label: `Plan ${days} dagen`, summary: [`${days} dagen ontbijt, lunch, avondeten${data.planningPreferences.snacksPerDay ? ' en tussendoortjes' : ''}.`, `Rond ${nlNumber(data.profile.calorieTarget)} kcal en ${data.profile.proteinTarget} g eiwit per dag.`, 'Gegeten en vastgezette maaltijden blijven staan.'], run: () => { controller.apply(createPlan(today, days, today)); navigate('plan', 'plan'); } } };
    }
    case 'prepare_groceries':
      if (!plan) return { text: 'Er is nog geen maaltijdplan. Zeg bijvoorbeeld “Plan mijn eten voor drie dagen”.', proposal: null };
      return { proposal: { label: 'Naar boodschappen', summary: ['Ik zoek de producten en laat je eerst alles zien. Er gaat niets automatisch in je mandje.'], run: () => navigate('shopping', 'prepare') } };
    case 'reduce_cost':
      if (!plan) return { text: 'Maak eerst een plan; dan kan ik de boodschappen goedkoper maken.', proposal: null };
      return { proposal: { label: 'Zoek goedkoopste producten', summary: ['Kiest per ingrediënt het product met de laagste prijs per eenheid.', 'Bekijk daarna de wissels onder “Slimmer combineren”.'], run: () => { navigate('shopping'); void shopping.prepare({ mode: 'cheapest', demo: shopping.plan?.source === 'demo' }); } } };
    case 'replace_ingredient': {
      const fromId = resolveIngredientWord(intent.from);
      const toId = resolveIngredientWord(intent.to);
      if (!fromId || !toId) return { text: `Ik ken “${!fromId ? intent.from : intent.to}” niet als ingrediënt.`, proposal: null };
      if (!plan) return { text: 'Er is nog geen plan om aan te passen.', proposal: null };
      const context = plannerContext(data, today);
      const targets = plan.meals.filter((meal) => meal.status === 'planned' && !meal.locked && !meal.leftoverOfMealId && meal.date >= today && recipes.get(meal.recipeId)?.ingredients.some((item) => item.ingredientId === fromId));
      if (!targets.length) return { text: `Er staat geen ${getIngredient(fromId)?.name.toLowerCase()} in je komende maaltijden.`, proposal: null };
      const swaps = targets.map((meal) => {
        const current = mealDetails(data, meal)?.nutrition.totals.kcal ?? 0;
        const options = eligibleRecipes(context, meal.slot).filter((recipe) => recipe.ingredients.some((item) => item.ingredientId === toId) && !recipe.ingredients.some((item) => item.ingredientId === fromId));
        const best = options.sort((a, b) => Math.abs((mealDetails(data, { recipeId: a.id, servings: 1 })?.nutrition.totals.kcal ?? 0) - current) - Math.abs((mealDetails(data, { recipeId: b.id, servings: 1 })?.nutrition.totals.kcal ?? 0) - current))[0];
        return { meal, recipe: best };
      }).filter((swap) => swap.recipe);
      if (!swaps.length) return { text: `Ik vond geen recept met ${getIngredient(toId)?.name.toLowerCase()} dat in die maaltijden past.`, proposal: null };
      return { proposal: { label: `Vervang in ${swaps.length} maaltijd${swaps.length === 1 ? '' : 'en'}`, summary: swaps.map(({ meal, recipe }) => `${dayLabel(meal.date, today)} ${SLOT_LABELS[meal.slot].toLowerCase()}: ${recipes.get(meal.recipeId)?.name} → ${recipe!.name}`).concat('De dagen worden opnieuw doorgerekend.'), run: () => { for (const swap of swaps) controller.apply(replacePlannedMeal(swap.meal.id, today, swap.recipe!.id)); navigate('plan', 'plan'); } } };
    }
    case 'pantry_add': {
      const ids = [...new Set(intent.items.map(resolveIngredientWord).filter((id): id is string => Boolean(id)))];
      if (!ids.length) return { text: 'Ik herkende die producten niet. Voeg ze toe via Instellingen → Voorraad.', proposal: null };
      const needed = plan ? consolidateRequirements(plan, recipes, getIngredient, [], { fromDate: today, staplesAtHome: false }) : [];
      const additions = ids.map((id) => {
        const ingredient = getIngredient(id)!;
        const need = needed.find((item) => item.ingredientId === id)?.amount;
        const amount = need ?? (ingredient.unit === 'piece' ? 6 : 500);
        return { ingredient, amount, basis: need ? 'genoeg voor je plan' : 'standaardhoeveelheid' };
      });
      return { proposal: { label: 'Zet in mijn voorraad', summary: additions.map(({ ingredient, amount, basis }) => `${ingredient.name}: ${describeQuantity(amount, ingredient.unit)} (${basis}, aan te passen in Voorraad)`).concat('Dit komt niet meer op je boodschappenlijst.'), run: () => { for (const item of additions) controller.apply(upsertPantryItem(item.ingredient.id, Math.max(item.amount, data.pantry.find((entry) => entry.ingredientId === item.ingredient.id)?.amount ?? 0), item.ingredient.unit)); } } };
    }
    case 'no_cooking': {
      const date = intent.scope === 'today' ? today : addDays(today, 1);
      if (!plan) return { text: 'Er is nog geen plan om aan te passen.', proposal: null };
      const context = plannerContext(data, today);
      const meals = plan.meals.filter((meal) => meal.date === date && meal.status === 'planned' && !meal.locked && !meal.leftoverOfMealId && meal.slot !== 'snack' && (recipes.get(meal.recipeId)?.method ?? 'no_cook') !== 'no_cook');
      if (!meals.length) return { text: `Je maaltijden voor ${dayLabel(date, today).toLowerCase()} vragen al geen kookwerk.`, proposal: null };
      const swaps = meals.map((meal) => {
        const slots = meal.slot === 'dinner' ? ['dinner', 'lunch'] as const : [meal.slot];
        const options = slots.flatMap((slot) => eligibleRecipes(context, slot)).filter((recipe) => recipe.method === 'no_cook' || recipe.prepMinutes <= 5).sort((a, b) => Number(b.method === 'no_cook') - Number(a.method === 'no_cook') || a.prepMinutes - b.prepMinutes);
        return { meal, recipe: options.find((recipe) => recipe.id !== meal.recipeId) };
      }).filter((swap) => swap.recipe);
      if (!swaps.length) return { text: 'Ik vond geen opties zonder koken die bij je voorkeuren passen.', proposal: null };
      return { proposal: { label: 'Vervang door koken-vrije opties', summary: swaps.map(({ meal, recipe }) => `${SLOT_LABELS[meal.slot]}: ${recipe!.name} (${recipe!.prepMinutes} min${recipe!.method === 'no_cook' ? ', zonder koken' : ''})`), run: () => { for (const swap of swaps) controller.apply(replacePlannedMeal(swap.meal.id, today, swap.recipe!.id)); navigate('plan', 'plan'); } } };
    }
    case 'explain_progress': {
      const assessment = progressAssessment(data, today);
      const adherence = adherenceSummary(data, today);
      const lines = [assessment.message, ...assessment.actions];
      if (adherence.averageKcal != null) lines.push(`Gemiddelde bevestigde inname: ${nlNumber(adherence.averageKcal)} kcal op ${adherence.daysWithIntake} van de ${adherence.windowDays} dagen.`);
      return { text: `${assessment.title}. ${lines.join(' ')}`, proposal: { label: 'Bekijk voortgang', summary: [], run: () => navigate('progress', 'overview') } };
    }
    case 'protein_focus': {
      const grams = intent.grams ?? data.profile.proteinTarget;
      return { proposal: { label: `Plan op ${grams} g eiwit`, summary: [grams !== data.profile.proteinTarget ? `Je eiwitdoel wordt ${grams} g (nu ${data.profile.proteinTarget} g).` : `Je eiwitdoel blijft ${grams} g.`, 'Je komende dagen worden opnieuw gepland met eiwitrijke tussendoortjes; gegeten maaltijden blijven staan.'], run: () => { if (grams !== data.profile.proteinTarget) controller.apply(updateMetabolicSettings({ overrides: { ...data.metabolicSettings.overrides, protein: grams } }, today)); controller.apply(createPlan(today, plan?.days ?? data.planningPreferences.horizonDays, today)); navigate('plan', 'plan'); } } };
    }
    default:
      return { proposal: null };
  }
}

export function AssistantPanel({ controller, shopping, navigate }: { controller: AppController; shopping: ShoppingController; navigate: (page: Page, sub?: string) => void }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [messages, setMessages] = useState<Message[]>([{ id: 'hello', role: 'bot', text: 'Hoi! Vraag me iets over je plan, boodschappen of voortgang. Ik stel een wijziging voor; jij beslist.' }]);
  const logRef = useRef<HTMLDivElement>(null);
  const Recognition = speechRecognition();

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, open]);

  const send = async (text: string) => {
    const message = text.trim();
    if (!message || busy) return;
    setInput('');
    setMessages((current) => [...current, { id: `u${Date.now()}`, role: 'user', text: message }]);
    setBusy(true);
    const data = controller.data;
    const today = toDateKey();
    const plan = activePlan(data);
    const context = {
      today,
      kcalTarget: data.profile.calorieTarget,
      proteinTarget: data.profile.proteinTarget,
      horizonDays: data.planningPreferences.horizonDays,
      pantry: data.pantry.map((item) => getIngredient(item.ingredientId)?.name ?? item.ingredientId).slice(0, 60),
      plannedRecipes: (plan?.meals ?? []).filter((meal) => meal.date >= today).slice(0, 60).map((meal) => ({ mealId: meal.id, date: meal.date, slot: meal.slot, recipeName: recipeMapFor(data).get(meal.recipeId)?.name ?? meal.recipeId })),
      availableRecipes: allRecipes(data).slice(0, 200).map((recipe) => ({ id: recipe.id, name: recipe.name, slots: recipe.slots })),
    };
    let intent: AssistantIntent;
    let reply: string;
    let source: 'ai' | 'rules';
    try {
      const result = await api.assistant(message, context);
      intent = result.action;
      reply = result.reply;
      source = result.source;
    } catch {
      intent = parseIntentWithRules(message);
      reply = ruleReply(intent);
      source = 'rules';
    }
    const built = buildProposal(intent, data, controller, shopping, navigate);
    setMessages((current) => [...current, { id: `b${Date.now()}`, role: 'bot', text: built.text ?? reply, proposal: built.proposal, source }]);
    setBusy(false);
  };

  const listen = () => {
    if (!Recognition) return;
    const recognition = new Recognition();
    recognition.lang = 'nl-NL';
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript ?? '';
      setInput(transcript);
      if (transcript) void send(transcript);
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    setListening(true);
    recognition.start();
  };

  if (!open) return <button type="button" className="assistant-fab" onClick={() => setOpen(true)} aria-label="Open assistent"><Sparkles size={19} /><span>Assistent</span></button>;

  return (
    <div className="assistant-panel" role="dialog" aria-label="Assistent">
      <header><strong><Sparkles size={17} color="var(--accent)" />Assistent</strong><button type="button" className="p73-btn ghost small icon" onClick={() => setOpen(false)} aria-label="Sluiten"><X size={17} /></button></header>
      <div className="assistant-log" ref={logRef} aria-live="polite">
        {messages.map((message) => (
          <div key={message.id} className={`bubble ${message.role}`}>
            {message.text}
            {message.proposal ? (
              <div className="proposal">
                {message.proposal.summary.length ? <ul style={{ margin: 0, paddingLeft: 16, color: 'var(--muted)', fontSize: 13 }}>{message.proposal.summary.map((line) => <li key={line}>{line}</li>)}</ul> : null}
                <button type="button" className="p73-btn primary small" disabled={message.applied} onClick={() => { message.proposal?.run(); setMessages((current) => current.map((item) => item.id === message.id ? { ...item, applied: true } : item)); }}>{message.applied ? 'Toegepast' : message.proposal.label}</button>
              </div>
            ) : null}
            {message.source === 'rules' && message.role === 'bot' && message.id !== 'hello' ? <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>Zonder AI begrepen</div> : null}
          </div>
        ))}
        {busy ? <div className="bubble bot"><span className="skeleton-line" style={{ display: 'block', width: 120 }} /></div> : null}
        {messages.length <= 1 ? <div className="assistant-suggestions">{EXAMPLES.map((example) => <button key={example} type="button" onClick={() => void send(example)}>{example}</button>)}</div> : null}
      </div>
      <form className="assistant-input" onSubmit={(event) => { event.preventDefault(); void send(input); }}>
        <input value={input} onChange={(event) => setInput(event.target.value)} placeholder="Typ een verzoek…" aria-label="Bericht aan assistent" maxLength={600} />
        {Recognition ? <button type="button" className={`p73-btn ${listening ? 'primary' : 'secondary'} icon`} onClick={listen} aria-label="Inspreken" disabled={busy}><Mic size={16} /></button> : <span />}
        <button type="submit" className="p73-btn primary icon" aria-label="Versturen" disabled={busy || !input.trim()}><Send size={16} /></button>
      </form>
    </div>
  );
}
