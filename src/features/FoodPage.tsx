import { useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, CirclePlus, Coffee, Cookie, Copy, Flame, Heart, MoonStar, Pencil, Plus, RotateCcw, Search, Star, Sun, Trash2, UtensilsCrossed, X } from 'lucide-react';
import { FoodImage } from '../components/FoodImage';
import { Modal } from '../components/Modal';
import { ToneIcon, type VisualTone } from '../components/Visuals';
import { foodMap, foods } from '../data/foods';
import { prettyDate, relativeDay, shiftDate, toDateKey } from '../lib/date';
import { entryMacros, roundMacro, servingAmount } from '../lib/nutrition';
import type { AppController } from '../state/useAppData';
import type { FoodItem, FoodLogEntry, MealType } from '../types/models';

const meals: Array<{ id: MealType; label: string; time: string }> = [
  { id: 'breakfast', label: 'Breakfast', time: 'Morning' },
  { id: 'lunch', label: 'Lunch', time: 'Midday' },
  { id: 'dinner', label: 'Dinner', time: 'Evening' },
  { id: 'snacks', label: 'Snacks', time: 'Any time' },
];

const mealVisuals: Record<MealType, { Icon: typeof Coffee; tone: VisualTone }> = {
  breakfast: { Icon: Coffee, tone: 'amber' },
  lunch: { Icon: Sun, tone: 'blue' },
  dinner: { Icon: MoonStar, tone: 'violet' },
  snacks: { Icon: Cookie, tone: 'coral' },
};

interface FoodPageProps { controller: AppController; }

function quantityForInput(food: FoodItem, servingId: string, quantity: number) {
  const serving = food.servings.find((item) => item.id === servingId) ?? food.servings[0];
  return serving.id === '100g' || serving.id === '100ml' ? quantity * 100 : quantity;
}

function quantityFromInput(food: FoodItem, servingId: string, value: number) {
  const serving = food.servings.find((item) => item.id === servingId) ?? food.servings[0];
  return serving.id === '100g' || serving.id === '100ml' ? value / 100 : value;
}

function quantityLabel(food: FoodItem, servingId: string) {
  const serving = food.servings.find((item) => item.id === servingId) ?? food.servings[0];
  return serving.id === '100g' ? 'Amount (g)' : serving.id === '100ml' ? 'Amount (ml)' : 'Quantity';
}

interface FoodFormProps {
  food: FoodItem;
  initial?: FoodLogEntry;
  defaultMeal: MealType;
  onSave: (data: { servingId: string; quantity: number; meal: MealType }) => void;
  submitLabel: string;
}

function FoodForm({ food, initial, defaultMeal, onSave, submitLabel }: FoodFormProps) {
  const [servingId, setServingId] = useState(initial?.servingId ?? food.servings[0].id);
  const [meal, setMeal] = useState<MealType>(initial?.meal ?? defaultMeal);
  const [inputQuantity, setInputQuantity] = useState(() => quantityForInput(food, servingId, initial?.quantity ?? 1));
  const quantity = quantityFromInput(food, servingId, Number(inputQuantity));
  const preview = entryMacros(food, { servingId, quantity: Number.isFinite(quantity) ? quantity : 0 });
  const valid = Number.isFinite(inputQuantity) && Number(inputQuantity) > 0;

  const changeServing = (nextId: string) => {
    setServingId(nextId);
    setInputQuantity(quantityForInput(food, nextId, 1));
  };

  return (
    <form className="food-form" onSubmit={(event) => { event.preventDefault(); if (valid) onSave({ servingId, quantity, meal }); }}>
      <div className="selected-food">
        <FoodImage src={food.image} alt={food.name} />
        <div><span>{food.category}</span><h3>{food.name}</h3><p>Per 100 {food.unit}: {food.calories} kcal · {food.protein} g protein</p></div>
      </div>
      <div className="form-grid">
        <label>Serving<select value={servingId} onChange={(event) => changeServing(event.target.value)}>{food.servings.map((serving) => <option key={serving.id} value={serving.id}>{serving.label}</option>)}</select></label>
        <label>{quantityLabel(food, servingId)}<input inputMode="decimal" min="0.01" step="0.01" type="number" value={inputQuantity} onChange={(event) => setInputQuantity(Number(event.target.value))} aria-invalid={!valid} /></label>
        <label>Meal<select value={meal} onChange={(event) => setMeal(event.target.value as MealType)}>{meals.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
      </div>
      {!valid ? <p className="form-error">Enter an amount greater than zero.</p> : null}
      <div className="nutrition-preview">
        <div><span>Calories</span><strong>{Math.round(preview.calories)}</strong><small>kcal</small></div>
        <div><span>Protein</span><strong>{roundMacro(preview.protein)}</strong><small>g</small></div>
        <div><span>Carbs</span><strong>{roundMacro(preview.carbs)}</strong><small>g</small></div>
        <div><span>Fat</span><strong>{roundMacro(preview.fat)}</strong><small>g</small></div>
      </div>
      <button className="primary-button full" type="submit" disabled={!valid}><CirclePlus size={18} /> {submitLabel}</button>
    </form>
  );
}

export function FoodPage({ controller }: FoodPageProps) {
  const { data, addFood, updateFood, deleteFood, duplicateFood, toggleFavorite, repeatMeal, addSavedMeal, totalsForDate } = controller;
  const [date, setDate] = useState(toDateKey());
  const [addOpen, setAddOpen] = useState(false);
  const [selectedFood, setSelectedFood] = useState<FoodItem | null>(null);
  const [editEntry, setEditEntry] = useState<FoodLogEntry | null>(null);
  const [defaultMeal, setDefaultMeal] = useState<MealType>('breakfast');
  const [query, setQuery] = useState('');
  const [quickOpen, setQuickOpen] = useState(false);
  const totals = totalsForDate(date);
  const remaining = data.profile.calorieTarget - totals.calories;
  const filteredFoods = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const result = normalized ? foods.filter((food) => `${food.name} ${food.category}`.toLowerCase().includes(normalized)) : foods;
    return [...result].sort((a, b) => Number(data.favorites.includes(b.id)) - Number(data.favorites.includes(a.id)));
  }, [query, data.favorites]);

  const openAdd = (meal: MealType) => { setDefaultMeal(meal); setSelectedFood(null); setQuery(''); setAddOpen(true); };
  const closeAdd = () => { setAddOpen(false); setSelectedFood(null); };

  return (
    <div className="page food-page">
      <header className="page-header food-header">
        <div><p className="eyebrow">Nutrition diary</p><h1>Fuel the cut.</h1><p>Every quantity changes your plan in real time.</p></div>
        <button className="primary-button" type="button" onClick={() => openAdd('breakfast')}><Plus size={19} /> Add food</button>
      </header>

      <section className="date-strip">
        <button type="button" className="icon-button" onClick={() => setDate((current) => shiftDate(current, -1))} aria-label="Previous day"><ChevronLeft size={20} /></button>
        <button type="button" className="date-chip secondary" onClick={() => setDate(shiftDate(date, -1))}><span>{relativeDay(shiftDate(date, -1))}</span><small>{prettyDate(shiftDate(date, -1))}</small></button>
        <label className="date-chip active"><CalendarDays size={18} /><span>{relativeDay(date)}</span><small>{prettyDate(date, true)}</small><input type="date" value={date} onChange={(event) => setDate(event.target.value)} aria-label="Choose diary date" /></label>
        <button type="button" className="date-chip secondary" onClick={() => setDate(shiftDate(date, 1))}><span>{relativeDay(shiftDate(date, 1))}</span><small>{prettyDate(shiftDate(date, 1))}</small></button>
        <button type="button" className="icon-button" onClick={() => setDate((current) => shiftDate(current, 1))} aria-label="Next day"><ChevronRight size={20} /></button>
      </section>

      <section className="nutrition-summary premium-nutrition-summary">
        <div className="calorie-summary">
          <span className="metric-icon lime"><Flame size={20} /></span>
          <div><p>{remaining >= 0 ? 'Calories remaining' : 'Calories over target'}</p><strong className={remaining < 0 ? 'text-warning' : ''}>{Math.abs(Math.round(remaining))}</strong></div>
          <span>{Math.round(totals.calories).toLocaleString()} / {data.profile.calorieTarget.toLocaleString()} kcal</span>
        </div>
        <div className="nutrition-summary__macro protein"><p>Protein <span>{Math.round(totals.protein)} / {data.profile.proteinTarget} g</span></p><div><span className="blue" style={{ width: `${Math.min(100, totals.protein / data.profile.proteinTarget * 100)}%` }} /></div><small>{Math.max(0, Math.round(data.profile.proteinTarget - totals.protein))} g remaining</small></div>
        <div className="nutrition-summary__macro carbs"><p>Carbohydrates <span>{Math.round(totals.carbs)} / {data.profile.carbTarget} g</span></p><div><span className="amber" style={{ width: `${Math.min(100, totals.carbs / data.profile.carbTarget * 100)}%` }} /></div><small>{Math.max(0, Math.round(data.profile.carbTarget - totals.carbs))} g remaining</small></div>
        <div className="nutrition-summary__macro fat"><p>Fat <span>{Math.round(totals.fat)} / {data.profile.fatTarget} g</span></p><div><span className="violet" style={{ width: `${Math.min(100, totals.fat / data.profile.fatTarget * 100)}%` }} /></div><small>{Math.max(0, Math.round(data.profile.fatTarget - totals.fat))} g remaining</small></div>
      </section>

      <section className="food-quickbar">
        <div><button type="button" onClick={() => setQuickOpen((open) => !open)}><RotateCcw size={17} /> Quick add <ChevronRight size={16} /></button>{quickOpen ? <div className="quick-menu">
          <p className="eyebrow">Repeat from yesterday</p>
          {meals.map((meal) => <button key={meal.id} type="button" onClick={() => { repeatMeal(shiftDate(date, -1), date, meal.id); setQuickOpen(false); }}><Copy size={15} /> {meal.label}</button>)}
          {data.savedMeals.map((saved) => <button key={saved.id} type="button" onClick={() => { addSavedMeal(saved.id, date, 'breakfast'); setQuickOpen(false); }}><Heart size={15} /> {saved.name}</button>)}
        </div> : null}</div>
        <div className="recent-foods"><span>Recent</span>{data.recentFoodIds.slice(0, 4).map((id) => { const food = foodMap.get(id); return food ? <button type="button" key={id} onClick={() => { setSelectedFood(food); setDefaultMeal('snacks'); setAddOpen(true); }}><FoodImage src={food.image} alt={food.name} /><span>{food.name}</span></button> : null; })}</div>
      </section>

      <section className="frequent-foods" aria-label="Frequently used foods"><div><p className="eyebrow">Frequent foods</p><h2>Quick, familiar choices</h2></div><div>{data.favorites.slice(0, 5).map((id) => { const food = foodMap.get(id); return food ? <button type="button" key={id} onClick={() => { setSelectedFood(food); setDefaultMeal('snacks'); setAddOpen(true); }}><FoodImage src={food.image} alt={food.name} /><span><strong>{food.name}</strong><small>{food.protein} g protein / 100{food.unit}</small></span><Plus size={16} /></button> : null; })}</div></section>

      <section className="meal-grid meal-timeline">
        {meals.map((meal) => {
          const entries = data.foodLog.filter((entry) => entry.date === date && entry.meal === meal.id);
          const mealMacros = entries.reduce((total, entry) => { const food = foodMap.get(entry.foodId); if (!food) return total; const macros = entryMacros(food, entry); return { calories: total.calories + macros.calories, protein: total.protein + macros.protein }; }, { calories: 0, protein: 0 });
          const visual = mealVisuals[meal.id];
          return <article className={`meal-card card meal-${meal.id}`} key={meal.id}>
            <header><div className="meal-heading"><ToneIcon Icon={visual.Icon} tone={visual.tone} /><div><p className="eyebrow">{meal.time}</p><h2>{meal.label}</h2></div></div><div><strong>{Math.round(mealMacros.calories)}</strong><span>kcal · {Math.round(mealMacros.protein)}g protein</span></div></header>
            <div className="meal-items">
              {entries.length ? entries.map((entry) => {
                const food = foodMap.get(entry.foodId); if (!food) return null;
                const macros = entryMacros(food, entry); const amount = servingAmount(food, entry);
                return <button type="button" className="food-row" key={entry.id} onClick={() => setEditEntry(entry)}>
                  <FoodImage src={food.image} alt={food.name} />
                  <div><strong>{food.name}</strong><span>{Math.round(amount)} {food.unit} · {roundMacro(macros.protein)}g protein</span></div>
                  <p><strong>{Math.round(macros.calories)}</strong><span>kcal</span></p><Pencil size={16} />
                </button>;
              }) : <div className="empty-meal"><UtensilsCrossed size={22} /><p>Nothing logged yet.<span>Add food when you're ready.</span></p></div>}
            </div>
            <button type="button" className="add-meal-button" onClick={() => openAdd(meal.id)}><Plus size={17} /> Add to {meal.label.toLowerCase()}</button>
          </article>;
        })}
      </section>

      <Modal open={addOpen} onClose={closeAdd} title={selectedFood ? 'Choose quantity' : 'Add food'} subtitle={selectedFood ? `Log ${selectedFood.name} to ${relativeDay(date).toLowerCase()}.` : 'Search real foods or choose a recent favorite.'} wide={!selectedFood}>
        {selectedFood ? <FoodForm food={selectedFood} defaultMeal={defaultMeal} submitLabel="Add to diary" onSave={(form) => { addFood({ ...form, foodId: selectedFood.id, date }); closeAdd(); }} /> : <div className="food-search">
          <label className="search-field"><Search size={19} /><input autoFocus type="search" placeholder="Search chicken, banana, skyr…" value={query} onChange={(event) => setQuery(event.target.value)} />{query ? <button type="button" onClick={() => setQuery('')} aria-label="Clear search"><X size={17} /></button> : null}</label>
          <div className="food-search__meta"><span>{filteredFoods.length} foods</span><span><Star size={14} /> Favorites first</span></div>
          <div className="food-results">{filteredFoods.length ? filteredFoods.map((food) => <div className="food-result" key={food.id}>
            <button type="button" className="food-result__main" onClick={() => setSelectedFood(food)}><FoodImage src={food.image} alt={food.name} /><div><strong>{food.name}</strong><span>{food.category} · {food.protein}g protein / 100{food.unit}</span></div><p><strong>{food.calories}</strong><span>kcal</span></p><ChevronRight size={18} /></button>
            <button type="button" className={`favorite-button ${data.favorites.includes(food.id) ? 'active' : ''}`} onClick={() => toggleFavorite(food.id)} aria-label={data.favorites.includes(food.id) ? `Remove ${food.name} from favorites` : `Add ${food.name} to favorites`}><Star size={17} fill={data.favorites.includes(food.id) ? 'currentColor' : 'none'} /></button>
          </div>) : <div className="empty-state"><Search size={30} /><h3>No foods found</h3><p>Try a shorter food name or another spelling.</p></div>}</div>
        </div>}
      </Modal>

      <Modal open={Boolean(editEntry)} onClose={() => setEditEntry(null)} title="Edit food" subtitle="Changes recalculate every total immediately.">
        {editEntry && foodMap.get(editEntry.foodId) ? <>
          <FoodForm food={foodMap.get(editEntry.foodId)!} initial={editEntry} defaultMeal={editEntry.meal} submitLabel="Save changes" onSave={(form) => { updateFood(editEntry.id, form); setEditEntry(null); }} />
          <div className="destructive-actions"><button type="button" onClick={() => { duplicateFood(editEntry.id); setEditEntry(null); }}><Copy size={17} /> Duplicate</button><button type="button" className="danger" onClick={() => { deleteFood(editEntry.id); setEditEntry(null); }}><Trash2 size={17} /> Delete</button></div>
        </> : null}
      </Modal>
    </div>
  );
}
