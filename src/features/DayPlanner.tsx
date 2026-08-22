import { useMemo, useState } from 'react';
import { ArrowRight, CalendarDays, Check, CirclePlus, Copy, Lightbulb, Plus, Save, Sparkles, Target, Trash2 } from 'lucide-react';
import { FoodImage } from '../components/FoodImage';
import { resolveFood } from '../lib/foodCatalog';
import { suggestFoods } from '../lib/foodSuggestions';
import { createFoodSnapshot } from '../lib/nutrition';
import { prettyDate, shiftDate } from '../lib/date';
import type { AppController } from '../state/useAppData';
import type { Macros, MealType, PlannedFoodEntry } from '../types/models';

interface DayPlannerProps {
  controller: AppController;
  date: string;
  onDateChange: (date: string) => void;
  onSearchFood: (meal: MealType) => void;
}

const meals: Array<{ id: MealType; label: string }> = [
  { id: 'breakfast', label: 'Breakfast' }, { id: 'lunch', label: 'Lunch' }, { id: 'dinner', label: 'Dinner' }, { id: 'snacks', label: 'Snacks' },
];

function plannedMacros(controller: AppController, item: PlannedFoodEntry): Macros {
  const food = resolveFood(controller.data, item.foodId);
  return food ? createFoodSnapshot(food, item.servingId, item.quantity)?.calculated ?? { calories: 0, protein: 0, carbs: 0, fat: 0 } : { calories: 0, protein: 0, carbs: 0, fat: 0 };
}

export function DayPlanner({ controller, date, onDateChange, onSearchFood }: DayPlannerProps) {
  const { data } = controller;
  const [templateName, setTemplateName] = useState('My usual day');
  const [reservationTitle, setReservationTitle] = useState('Dinner out');
  const [reservationCalories, setReservationCalories] = useState(600);
  const actual = controller.totalsForDate(date);
  const planned = data.plannedFoodEntries.filter((item) => item.date === date);
  const unconsumed = planned.filter((item) => item.status === 'planned');
  const plannedTotal = unconsumed.reduce((total, item) => {
    const value = plannedMacros(controller, item);
    return { calories: total.calories + value.calories, protein: total.protein + value.protein, carbs: total.carbs + value.carbs, fat: total.fat + value.fat };
  }, { calories: 0, protein: 0, carbs: 0, fat: 0 });
  const reservations = data.calorieReservations.filter((item) => item.date === date);
  const reservedCalories = reservations.reduce((sum, item) => sum + item.calories, 0);
  const projectedCalories = actual.calories + plannedTotal.calories + reservedCalories;
  const projectedProtein = actual.protein + plannedTotal.protein;
  const remainingCalories = Math.max(0, data.profile.calorieTarget - projectedCalories);
  const remainingProtein = Math.max(0, data.profile.proteinTarget - projectedProtein);
  const suggestions = useMemo(() => suggestFoods(data, remainingCalories, remainingProtein, 5), [data, remainingCalories, remainingProtein]);

  const addSuggestion = (foodId: string, servingId: string, quantity: number, meal: MealType, logNow: boolean) => {
    const food = resolveFood(data, foodId);
    if (!food) return;
    if (logNow) controller.addFood({ foodId, servingId, quantity, meal, date }, food);
    else controller.planFood({ foodId, servingId, quantity, meal, date });
  };

  return <div className="day-planner">
    <section className="planner-hero card">
      <div><p className="eyebrow">Plan before hunger decides</p><h2>Plan {prettyDate(date, true)}</h2><p>Projected totals combine what you have logged, what you plan to eat, and any calories reserved for an event.</p></div>
      <label><CalendarDays size={17} /><input type="date" value={date} onChange={(event) => onDateChange(event.target.value)} aria-label="Choose planning date" /></label>
      <div className="planner-kpis">
        <span><small>Projected calories</small><strong>{Math.round(projectedCalories).toLocaleString()} <em>/ {data.profile.calorieTarget}</em></strong></span>
        <span><small>Projected protein</small><strong>{Math.round(projectedProtein)} g <em>/ {data.profile.proteinTarget} g</em></strong></span>
        <span className={projectedCalories > data.profile.calorieTarget ? 'warning' : ''}><small>Flexible budget left</small><strong>{Math.round(remainingCalories)} kcal</strong></span>
      </div>
    </section>

    <section className="planner-meals">
      {meals.map((meal) => {
        const items = planned.filter((item) => item.meal === meal.id);
        return <article className="planner-meal card" key={meal.id}><header><div><span>{meal.label}</span><strong>{items.filter((item) => item.status === 'planned').length} planned</strong></div><button type="button" className="icon-button" onClick={() => onSearchFood(meal.id)} aria-label={`Plan ${meal.label.toLowerCase()} food`}><Plus size={17} /></button></header>
          <div>{items.length ? items.map((item) => {
            const food = resolveFood(data, item.foodId);
            const macros = plannedMacros(controller, item);
            return <div className={`planned-food ${item.status}`} key={item.id}><FoodImage src={food?.image ?? ''} alt={food?.name ?? 'Saved food'} /><div><strong>{food?.name ?? 'Saved food'}</strong><span>{Math.round(macros.calories)} kcal · {Math.round(macros.protein)} g protein</span></div><span className="planned-status">{item.status}</span>{item.status === 'planned' ? <button type="button" onClick={() => controller.consumePlannedFood(item.id)} aria-label={`Mark ${food?.name ?? 'food'} eaten`}><Check size={15} /></button> : null}<button type="button" className="danger" onClick={() => controller.deletePlannedFood(item.id)} aria-label={`Remove ${food?.name ?? 'food'} from plan`}><Trash2 size={15} /></button></div>;
          }) : <button type="button" className="planner-empty-meal" onClick={() => onSearchFood(meal.id)}><CirclePlus size={19} /><span>Plan {meal.label.toLowerCase()}</span></button>}</div>
        </article>;
      })}
    </section>

    <section className="what-can-i-eat card">
      <header><div><p className="eyebrow">What can I eat?</p><h2>Suggestions that fit the gap</h2><p>{Math.round(remainingCalories)} kcal and {Math.round(remainingProtein)} g protein remain after the current plan.</p></div><Lightbulb size={24} /></header>
      {suggestions.length ? <div className="suggestion-list">{suggestions.map((suggestion) => <article key={suggestion.food.id}><FoodImage src={suggestion.food.image} alt={suggestion.food.name} /><div><strong>{suggestion.food.name}</strong><span>{suggestion.amount} {suggestion.food.unit} · {Math.round(suggestion.macros.calories)} kcal · {Math.round(suggestion.macros.protein)} g protein</span><small>{suggestion.reason}</small></div><button type="button" className="secondary-button" onClick={() => addSuggestion(suggestion.food.id, suggestion.servingId, suggestion.quantity, 'snacks', false)}><Plus size={15} /> Plan</button><button type="button" className="text-button" onClick={() => addSuggestion(suggestion.food.id, suggestion.servingId, suggestion.quantity, 'snacks', true)}>Log now <ArrowRight size={14} /></button></article>)}</div> : <div className="planner-empty-suggestions"><Target size={24} /><strong>No useful suggestion fits this budget</strong><p>Adjust the existing plan or leave the remaining budget unused. The coach will never invent calories to force a match.</p></div>}
    </section>

    <section className="planner-tools-grid">
      <article className="card planner-tool"><div><Save size={18} /><div><strong>Save this planned day</strong><p>Reuse the food choices and portions later.</p></div></div><label>Template name<input value={templateName} onChange={(event) => setTemplateName(event.target.value)} maxLength={80} /></label><button type="button" className="secondary-button" disabled={!templateName.trim() || !unconsumed.length} onClick={() => controller.saveDayTemplate(templateName, date)}><Save size={15} /> Save template</button>{data.dayTemplates.length ? <div className="planner-template-list">{data.dayTemplates.map((template) => <button type="button" key={template.id} onClick={() => controller.applyDayTemplate(template.id, date)}>{template.name}<span>{template.items.length} items</span></button>)}</div> : null}</article>
      <article className="card planner-tool"><div><Sparkles size={18} /><div><strong>Reserve event calories</strong><p>Protect flexibility for a restaurant, party, or social meal.</p></div></div><label>Event<input value={reservationTitle} onChange={(event) => setReservationTitle(event.target.value)} maxLength={80} /></label><label>Calories<input type="number" min="0" max="5000" value={reservationCalories} onChange={(event) => setReservationCalories(Number(event.target.value))} /></label><button type="button" className="secondary-button" disabled={!reservationTitle.trim() || reservationCalories <= 0} onClick={() => controller.reserveCalories({ date, title: reservationTitle.trim(), calories: reservationCalories, meal: 'dinner' })}><Target size={15} /> Reserve</button>{reservations.map((item) => <div className="reservation-row" key={item.id}><span>{item.title}<small>{item.calories} kcal</small></span><button type="button" className="danger" onClick={() => controller.deleteCalorieReservation(item.id)} aria-label={`Remove ${item.title}`}><Trash2 size={14} /></button></div>)}</article>
    </section>

    <section className="planner-copy-row card"><div><Copy size={18} /><span><strong>Reuse tomorrow</strong><small>Copy all planned foods and reservations to {prettyDate(shiftDate(date, 1))}.</small></span></div><button type="button" className="secondary-button" onClick={() => controller.copyPlannedDay(date, shiftDate(date, 1))}><Copy size={15} /> Copy to tomorrow</button></section>
  </div>;
}
