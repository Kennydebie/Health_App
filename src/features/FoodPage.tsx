import { useEffect, useMemo, useRef, useState } from 'react';
import { Barcode, CalendarDays, Camera, ChevronLeft, ChevronRight, CircleAlert, CircleCheck, CirclePlus, ClipboardList, Coffee, Cookie, Copy, Database, Heart, LoaderCircle, MoonStar, Pencil, Plus, RotateCcw, Search, Settings2, Sparkles, Star, Sun, Trash2, UtensilsCrossed, X } from 'lucide-react';
import { FoodImage } from '../components/FoodImage';
import { Modal } from '../components/Modal';
import { ToneIcon, type VisualTone } from '../components/Visuals';
import { foodCatalog, foodForEntry, foodQualityIssues, rankFoods, resolveFood, searchLocalFoods } from '../lib/foodCatalog';
import { lookupFoodBarcode, searchFoodProviders } from '../lib/foodProviders';
import { prettyDate, relativeDay, shiftDate, toDateKey } from '../lib/date';
import { entryMacros, foodCanBeLogged, roundMacro, servingAmount } from '../lib/nutrition';
import { evaluateNutritionDay, targetSnapshotForDate } from '../lib/nutritionEvaluation';
import type { AppController } from '../state/useAppData';
import type { FoodItem, FoodLogEntry, MealType } from '../types/models';
import { NutritionCalendar, NutritionGoalBars, NutritionSettingsModal, NutritionTrends } from './NutritionOverview';
import { DayPlanner } from './DayPlanner';

const meals: Array<{ id: MealType; label: string }> = [
  { id: 'breakfast', label: 'Breakfast' },
  { id: 'lunch', label: 'Lunch' },
  { id: 'dinner', label: 'Dinner' },
  { id: 'snacks', label: 'Snacks' },
];

const mealVisuals: Record<MealType, { Icon: typeof Coffee; tone: VisualTone }> = {
  breakfast: { Icon: Coffee, tone: 'amber' }, lunch: { Icon: Sun, tone: 'blue' },
  dinner: { Icon: MoonStar, tone: 'violet' }, snacks: { Icon: Cookie, tone: 'coral' },
};

type FoodBrowserTab = 'search' | 'barcode' | 'library' | 'meals' | 'create';
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

function sourceLabel(food: FoodItem) {
  if (food.isCustom) return 'My food';
  if (food.source?.provider === 'open_food_facts') return 'Open Food Facts';
  if (food.source?.provider === 'usda') return 'USDA FoodData Central';
  return food.source?.providerName ?? 'Project 75 catalog';
}

interface FoodFormProps {
  food: FoodItem;
  initial?: FoodLogEntry;
  defaultMeal: MealType;
  onSave: (data: { servingId: string; quantity: number; meal: MealType }) => void;
  onCorrect?: () => void;
  submitLabel: string;
}

function FoodForm({ food, initial, defaultMeal, onSave, onCorrect, submitLabel }: FoodFormProps) {
  const [servingId, setServingId] = useState(initial?.servingId ?? food.servings[0]?.id ?? '100g');
  const [meal, setMeal] = useState<MealType>(initial?.meal ?? defaultMeal);
  const [inputQuantity, setInputQuantity] = useState(() => quantityForInput(food, servingId, initial?.quantity ?? 1));
  const quantity = quantityFromInput(food, servingId, Number(inputQuantity));
  const preview = entryMacros(food, { servingId, quantity: Number.isFinite(quantity) ? quantity : 0 });
  const issues = foodQualityIssues(food);
  const valid = Number.isFinite(inputQuantity) && Number(inputQuantity) > 0 && foodCanBeLogged(food);

  const changeServing = (nextId: string) => {
    setServingId(nextId);
    setInputQuantity(quantityForInput(food, nextId, 1));
  };

  return <form className="food-form food-form--rich" onSubmit={(event) => { event.preventDefault(); if (valid) onSave({ servingId, quantity, meal }); }}>
    <div className="selected-food">
      <FoodImage src={food.image} alt={food.name} />
      <div><span>{food.brand || food.category}</span><h3>{food.name}</h3><p>{food.calories ?? '—'} kcal · {food.protein ?? '—'} g protein per 100 {food.unit}</p></div>
    </div>
    <div className="food-source-line"><Database size={14}/><span>{sourceLabel(food)}</span>{food.country ? <span>· {food.country}</span> : null}{food.barcode ? <span>· {food.barcode}</span> : null}</div>
    {issues.length ? <div className="food-quality-warning"><CircleAlert size={18}/><div><strong>Some nutrition details are incomplete</strong><p>{issues.join(' · ')}. Correct the food before adding it.</p></div>{onCorrect ? <button type="button" onClick={onCorrect}>Create corrected copy</button> : null}</div> : <div className="food-quality-ok"><CircleCheck size={16}/> Nutrition data is complete and ready to log.</div>}
    <div className="form-grid">
      <label>Serving<select value={servingId} onChange={(event) => changeServing(event.target.value)}>{food.servings.map((serving) => <option key={serving.id} value={serving.id}>{serving.label}</option>)}</select></label>
      <label>{quantityLabel(food, servingId)}<input inputMode="decimal" min="0.01" step="0.01" type="number" value={inputQuantity} onChange={(event) => setInputQuantity(Number(event.target.value))} aria-invalid={!valid} /></label>
      <label>Meal<select value={meal} onChange={(event) => setMeal(event.target.value as MealType)}>{meals.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
    </div>
    <div className="nutrition-preview">
      <div><span>Calories</span><strong>{Math.round(preview.calories)}</strong><small>kcal</small></div>
      <div><span>Protein</span><strong>{roundMacro(preview.protein)}</strong><small>g</small></div>
      <div><span>Carbs</span><strong>{roundMacro(preview.carbs)}</strong><small>g</small></div>
      <div><span>Fat</span><strong>{roundMacro(preview.fat)}</strong><small>g</small></div>
    </div>
    <button className="primary-button full" type="submit" disabled={!valid}><CirclePlus size={18}/> {submitLabel}</button>
  </form>;
}

interface CustomFoodFormProps { base?: FoodItem | null; onSave: (food: FoodItem) => void; }

function CustomFoodForm({ base, onSave }: CustomFoodFormProps) {
  const [name, setName] = useState(base?.name ?? '');
  const [brand, setBrand] = useState(base?.brand ?? '');
  const [calories, setCalories] = useState(String(base?.calories ?? ''));
  const [protein, setProtein] = useState(String(base?.protein ?? ''));
  const [carbs, setCarbs] = useState(String(base?.carbs ?? ''));
  const [fat, setFat] = useState(String(base?.fat ?? ''));
  const [servingAmount, setServingAmount] = useState(String(base?.servings.find((item) => !item.id.startsWith('100'))?.amount ?? 100));
  const [servingLabel, setServingLabel] = useState(base?.servings.find((item) => !item.id.startsWith('100'))?.label ?? '1 serving');
  const numbers = [calories, protein, carbs, fat].map(Number);
  const valid = name.trim().length > 1 && numbers.every((value) => Number.isFinite(value) && value >= 0) && Number(servingAmount) > 0;

  return <form className="custom-food-form" onSubmit={(event) => {
    event.preventDefault(); if (!valid) return;
    const now = new Date().toISOString();
    onSave({
      id: `custom-${crypto.randomUUID()}`, name: name.trim(), brand: brand.trim() || undefined,
      category: base ? 'Corrected food' : 'My foods', unit: base?.unit ?? 'g', image: base?.image ?? '',
      servings: [{ id: '100g', label: '100 g', amount: 100, unit: 'g' }, { id: 'serving', label: servingLabel.trim() || '1 serving', amount: Number(servingAmount), unit: 'g' }],
      calories: numbers[0], protein: numbers[1], carbs: numbers[2], fat: numbers[3],
      fiber: base?.fiber ?? null, sugar: base?.sugar ?? null, salt: base?.salt ?? null, sodium: base?.sodium ?? null,
      dataCompleteness: 'complete', isCustom: true, correctedFromId: base?.id,
      source: { provider: base ? 'corrected' : 'custom', providerName: base ? `Corrected from ${sourceLabel(base)}` : 'Project 75', externalId: crypto.randomUUID(), retrievedAt: now },
    });
  }}>
    {base ? <div className="food-quality-warning"><Sparkles size={18}/><div><strong>Correcting a copy</strong><p>The provider record stays unchanged. Your verified copy is saved under My foods.</p></div></div> : null}
    <div className="form-grid"><label>Food name<input autoFocus value={name} onChange={(event) => setName(event.target.value)}/></label><label>Brand (optional)<input value={brand} onChange={(event) => setBrand(event.target.value)}/></label></div>
    <p className="eyebrow">Nutrition per 100 g</p>
    <div className="custom-macro-grid"><label>Calories<input type="number" min="0" step="0.1" value={calories} onChange={(event) => setCalories(event.target.value)}/></label><label>Protein (g)<input type="number" min="0" step="0.1" value={protein} onChange={(event) => setProtein(event.target.value)}/></label><label>Carbs (g)<input type="number" min="0" step="0.1" value={carbs} onChange={(event) => setCarbs(event.target.value)}/></label><label>Fat (g)<input type="number" min="0" step="0.1" value={fat} onChange={(event) => setFat(event.target.value)}/></label></div>
    <div className="form-grid"><label>Serving label<input value={servingLabel} onChange={(event) => setServingLabel(event.target.value)}/></label><label>Serving weight (g)<input type="number" min="0.1" step="0.1" value={servingAmount} onChange={(event) => setServingAmount(event.target.value)}/></label></div>
    <button className="primary-button full" type="submit" disabled={!valid}><CircleCheck size={18}/> Save to My foods</button>
  </form>;
}

function FoodResult({ food, favorite, onFavorite, onSelect }: { food: FoodItem; favorite: boolean; onFavorite: () => void; onSelect: () => void }) {
  return <div className="food-result">
    <button type="button" className="food-result__main" onClick={onSelect}><FoodImage src={food.image} alt={food.name}/><div><strong>{food.name}</strong><span>{food.brand ? `${food.brand} · ` : ''}{food.protein ?? '—'}g protein / 100{food.unit}</span><small>{sourceLabel(food)}{food.dataCompleteness === 'partial' ? ' · Incomplete' : ''}</small></div><p><strong>{food.calories ?? '—'}</strong><span>kcal</span></p><ChevronRight size={18}/></button>
    <button type="button" className={`favorite-button ${favorite ? 'active' : ''}`} onClick={onFavorite} aria-label={favorite ? `Remove ${food.name} from favorites` : `Add ${food.name} to favorites`}><Star size={17} fill={favorite ? 'currentColor' : 'none'}/></button>
  </div>;
}

function BarcodeLookup({ onFound }: { onFound: (food: FoodItem) => void }) {
  const [barcode, setBarcode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);

  useEffect(() => () => streamRef.current?.getTracks().forEach((track) => track.stop()), []);
  const lookup = async (value = barcode) => {
    const normalized = value.replace(/\D/g, '');
    if (!/^\d{8,14}$/.test(normalized)) { setError('Enter an 8–14 digit barcode.'); return; }
    setLoading(true); setError('');
    try { onFound(await lookupFoodBarcode(normalized)); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Barcode lookup failed.'); } finally { setLoading(false); }
  };
  const startCamera = async () => {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      streamRef.current = stream; setCameraOpen(true);
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
      const Detector = (window as unknown as { BarcodeDetector?: new (options: { formats: string[] }) => { detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue: string }>> } }).BarcodeDetector;
      if (!Detector) { setError('Live scanning is not supported in this browser. You can type the number below.'); return; }
      const detector = new Detector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });
      const scan = async () => {
        if (!streamRef.current || !videoRef.current) return;
        const [result] = await detector.detect(videoRef.current).catch(() => []);
        if (result?.rawValue) { setBarcode(result.rawValue); streamRef.current.getTracks().forEach((track) => track.stop()); streamRef.current = null; setCameraOpen(false); await lookup(result.rawValue); }
        else window.setTimeout(scan, 450);
      };
      window.setTimeout(scan, 600);
    } catch { setError('Camera access was unavailable. You can still type the barcode.'); }
  };

  return <div className="barcode-panel">
    <div className="barcode-hero"><Barcode size={34}/><div><h3>Scan a packaged food</h3><p>Use the camera or enter the EAN/UPC printed below the barcode.</p></div></div>
    {cameraOpen ? <video ref={videoRef} className="barcode-video" muted playsInline/> : null}
    <button className="secondary-button full" type="button" onClick={startCamera}><Camera size={18}/> Open camera</button>
    <div className="barcode-or"><span>or enter the number</span></div>
    <form className="barcode-entry" onSubmit={(event) => { event.preventDefault(); void lookup(); }}><input inputMode="numeric" placeholder="8712345678901" value={barcode} onChange={(event) => setBarcode(event.target.value)}/><button className="primary-button" type="submit" disabled={loading}>{loading ? <LoaderCircle className="spin" size={18}/> : <Search size={18}/>} Look up</button></form>
    {error ? <p className="form-error">{error}</p> : null}
    <p className="food-provider-note">Product information comes from Open Food Facts and may need verification before logging.</p>
  </div>;
}

export function FoodPage({ controller }: FoodPageProps) {
  const { data, addFood, updateFood, deleteFood, duplicateFood, toggleFavorite, repeatMeal, addSavedMeal, saveMealFromDiary, deleteSavedMeal, saveFoodToLibrary, totalsForDate } = controller;
  const [date, setDate] = useState(toDateKey());
  const [addOpen, setAddOpen] = useState(false);
  const [selectedFood, setSelectedFood] = useState<FoodItem | null>(null);
  const [editEntry, setEditEntry] = useState<FoodLogEntry | null>(null);
  const [defaultMeal, setDefaultMeal] = useState<MealType>('breakfast');
  const [query, setQuery] = useState('');
  const [remoteFoods, setRemoteFoods] = useState<FoodItem[]>([]);
  const [remoteQuery, setRemoteQuery] = useState('');
  const [remotePage, setRemotePage] = useState(1);
  const [remoteMore, setRemoteMore] = useState(false);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [remoteWarning, setRemoteWarning] = useState('');
  const [browserTab, setBrowserTab] = useState<FoodBrowserTab>('search');
  const [correctingFood, setCorrectingFood] = useState<FoodItem | null>(null);
  const [quickOpen, setQuickOpen] = useState(false);
  const [saveMealType, setSaveMealType] = useState<MealType | null>(null);
  const [saveMealName, setSaveMealName] = useState('');
  const [view, setView] = useState<'diary' | 'plan' | 'calendar' | 'trends'>(() => (localStorage.getItem('project75-nutrition-view') as 'diary' | 'plan' | 'calendar' | 'trends' | null) ?? 'diary');
  const [addMode, setAddMode] = useState<'diary' | 'plan'>('diary');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const totals = totalsForDate(date);
  const selectedEvaluation = evaluateNutritionDay({ date, today: toDateKey(), totals, target: targetSnapshotForDate(data.nutritionTargetHistory, data.profile, date), settings: data.nutritionSettings, record: data.nutritionDayRecords.find((item) => item.date === date) });
  const localResults = useMemo(() => query.trim() ? searchLocalFoods(data, query) : rankFoods(foodCatalog(data), query, data).slice(0, 30), [data, query]);
  const results = useMemo(() => rankFoods([...localResults, ...(remoteQuery === query.trim() ? remoteFoods : [])], query, data), [localResults, remoteFoods, remoteQuery, query, data]);

  useEffect(() => {
    if (browserTab !== 'search' || query.trim().length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setRemoteLoading(true); setRemoteWarning('');
      try { const response = await searchFoodProviders(query.trim(), 1, controller.signal); setRemoteFoods(response.foods); setRemoteQuery(query.trim()); setRemotePage(1); setRemoteMore(response.hasMore); setRemoteWarning(response.warning ?? ''); }
      catch (reason) { if ((reason as Error).name !== 'AbortError') setRemoteWarning(reason instanceof Error ? reason.message : 'Online search is unavailable.'); }
      finally { setRemoteLoading(false); }
    }, 500);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [query, browserTab]);

  const openAdd = (meal: MealType, mode: 'diary' | 'plan' = 'diary') => { setAddMode(mode); setDefaultMeal(meal); setSelectedFood(null); setCorrectingFood(null); setQuery(''); setBrowserTab('search'); setAddOpen(true); };
  const closeAdd = () => { setAddOpen(false); setSelectedFood(null); setCorrectingFood(null); };
  const selectView = (next: 'diary' | 'plan' | 'calendar' | 'trends') => { setView(next); localStorage.setItem('project75-nutrition-view', next); };
  const chooseFood = (food: FoodItem) => { setSelectedFood(food); setCorrectingFood(null); if (food.source?.provider !== 'local' && !data.foodLibrary.some((item) => item.id === food.id)) saveFoodToLibrary({ ...food, isCached: true }); };
  const toggleFoodFavorite = (food: FoodItem) => { if (food.source?.provider !== 'local' && !data.foodLibrary.some((item) => item.id === food.id)) saveFoodToLibrary({ ...food, isCached: true }); toggleFavorite(food.id); };
  const customFoods = data.foodLibrary.filter((food) => food.isCustom);

  return <div className="page food-page">
    <header className="page-header food-header"><div><h1>Nutrition</h1><p>Plan ahead, log what you actually eat, and review goal adherence without guessing.</p></div><div className="nutrition-header-actions"><button className="secondary-button" type="button" onClick={() => setSettingsOpen(true)}><Settings2 size={17}/> Settings</button><button className="secondary-button" type="button" onClick={() => selectView('plan')}><ClipboardList size={17}/> Plan my day</button><button className="primary-button" type="button" onClick={() => { selectView('diary'); openAdd('breakfast'); }}><Plus size={19}/> Add food</button></div></header>
    <nav className="nutrition-tabs" aria-label="Nutrition sections" role="tablist">{(['diary', 'plan', 'calendar', 'trends'] as const).map((tab) => <button type="button" role="tab" key={tab} aria-selected={view === tab} className={view === tab ? 'active' : ''} onClick={() => selectView(tab)}>{tab === 'plan' ? 'Plan my day' : tab.charAt(0).toUpperCase() + tab.slice(1)}</button>)}</nav>

    {view === 'diary' ? <>
      <section className="date-strip"><button type="button" className="icon-button" onClick={() => setDate((current) => shiftDate(current, -1))} aria-label="Previous day"><ChevronLeft size={20}/></button><button type="button" className="date-chip secondary" onClick={() => setDate(shiftDate(date, -1))}><span>{relativeDay(shiftDate(date, -1))}</span><small>{prettyDate(shiftDate(date, -1))}</small></button><label className="date-chip active"><CalendarDays size={18}/><span>{relativeDay(date)}</span><small>{prettyDate(date, true)}</small><input type="date" value={date} onChange={(event) => setDate(event.target.value)} aria-label="Choose diary date"/></label><button type="button" className="date-chip secondary" onClick={() => setDate(shiftDate(date, 1))}><span>{relativeDay(shiftDate(date, 1))}</span><small>{prettyDate(shiftDate(date, 1))}</small></button><button type="button" className="icon-button" onClick={() => setDate((current) => shiftDate(current, 1))} aria-label="Next day"><ChevronRight size={20}/></button></section>
      <NutritionGoalBars evaluation={selectedEvaluation}/>
      <section className="food-quickbar"><div><button type="button" onClick={() => setQuickOpen((open) => !open)}><RotateCcw size={17}/> Quick add <ChevronRight size={16}/></button>{quickOpen ? <div className="quick-menu"><p className="eyebrow">Repeat from yesterday</p>{meals.map((meal) => <button key={meal.id} type="button" onClick={() => { repeatMeal(shiftDate(date, -1), date, meal.id); setQuickOpen(false); }}><Copy size={15}/> {meal.label}</button>)}{data.savedMeals.map((saved) => <button key={saved.id} type="button" onClick={() => { addSavedMeal(saved.id, date, defaultMeal); setQuickOpen(false); }}><Heart size={15}/> {saved.name}</button>)}</div> : null}</div><div className="recent-foods"><span>Recent</span>{data.recentFoodIds.slice(0, 4).map((id) => { const food = resolveFood(data, id); return food ? <button type="button" key={id} onClick={() => { chooseFood(food); setDefaultMeal('snacks'); setAddOpen(true); }}><FoodImage src={food.image} alt={food.name}/><span>{food.name}</span></button> : null; })}</div></section>
      <section className="frequent-foods" aria-label="Favorite foods"><div><h2>Favorites</h2></div><div>{data.favorites.slice(0, 5).map((id) => { const food = resolveFood(data, id); return food ? <button type="button" key={id} onClick={() => { chooseFood(food); setDefaultMeal('snacks'); setAddOpen(true); }}><FoodImage src={food.image} alt={food.name}/><span><strong>{food.name}</strong><small>{food.protein ?? '—'} g protein / 100{food.unit}</small></span><Plus size={16}/></button> : null; })}</div></section>
      <section className="meal-grid meal-timeline">{meals.map((meal) => {
        const entries = data.foodLog.filter((entry) => entry.date === date && entry.meal === meal.id);
        const mealMacros = entries.reduce((total, entry) => { const macros = entryMacros(foodForEntry(data, entry), entry); return { calories: total.calories + macros.calories, protein: total.protein + macros.protein }; }, { calories: 0, protein: 0 });
        const visual = mealVisuals[meal.id];
        return <article className={`meal-card card meal-${meal.id}`} key={meal.id}><header><div className="meal-heading"><ToneIcon Icon={visual.Icon} tone={visual.tone}/><div><h2>{meal.label}</h2></div></div><div><strong>{Math.round(mealMacros.calories)}</strong><span>kcal · {Math.round(mealMacros.protein)}g protein</span></div></header><div className="meal-items">{entries.length ? entries.map((entry) => { const food = foodForEntry(data, entry); if (!food) return null; const macros = entryMacros(food, entry); const amount = servingAmount(food, entry); return <button type="button" className="food-row" key={entry.id} onClick={() => setEditEntry(entry)}><FoodImage src={entry.snapshot?.image ?? food.image} alt={entry.snapshot?.foodName ?? food.name}/><div><strong>{entry.snapshot?.foodName ?? food.name}</strong><span>{Math.round(amount)} {entry.snapshot?.unit ?? food.unit} · {roundMacro(macros.protein)}g protein</span></div><p><strong>{Math.round(macros.calories)}</strong><span>kcal</span></p><Pencil size={16}/></button>; }) : <div className="empty-meal"><UtensilsCrossed size={22}/><p>No food logged<span>Use “Add to {meal.label.toLowerCase()}” to add an item.</span></p></div>}</div><div className="meal-card-actions"><button type="button" className="add-meal-button" onClick={() => openAdd(meal.id)}><Plus size={17}/> Add to {meal.label.toLowerCase()}</button>{entries.length ? <button type="button" className="save-meal-button" onClick={() => { setSaveMealType(meal.id); setSaveMealName(`${meal.label} ${prettyDate(date)}`); }}><Heart size={15}/> Save meal</button> : null}</div></article>;
      })}</section>
    </> : null}
    {view === 'plan' ? <DayPlanner controller={controller} date={date} onDateChange={setDate} onSearchFood={(meal) => openAdd(meal, 'plan')} /> : null}
    {view === 'calendar' ? <NutritionCalendar controller={controller} selectedDate={date} onSelectDate={setDate} onOpenDiary={(selected) => { setDate(selected); selectView('diary'); }} onAddFood={(selected) => { setDate(selected); selectView('diary'); openAdd('breakfast'); }} onEditEntry={(entry) => { setDate(entry.date); selectView('diary'); setEditEntry(entry); }}/> : null}
    {view === 'trends' ? <NutritionTrends controller={controller}/> : null}

    <Modal open={addOpen} onClose={closeAdd} title={selectedFood ? 'Choose quantity' : correctingFood ? 'Correct food details' : addMode === 'plan' ? 'Plan food' : 'Add food'} subtitle={selectedFood ? `${addMode === 'plan' ? 'Plan' : 'Log'} ${selectedFood.name} for ${relativeDay(date).toLowerCase()}.` : correctingFood ? 'Save a verified personal copy without changing the provider record.' : 'Search a broad catalog, scan a barcode, or reuse your own foods and meals.'} size={selectedFood || correctingFood ? 'medium' : 'large'}>
      {selectedFood ? <FoodForm food={selectedFood} defaultMeal={defaultMeal} submitLabel={addMode === 'plan' ? 'Add to plan' : 'Add to diary'} onCorrect={() => { setCorrectingFood(selectedFood); setSelectedFood(null); }} onSave={(form) => { if (addMode === 'plan') controller.planFood({ ...form, foodId: selectedFood.id, date }); else addFood({ ...form, foodId: selectedFood.id, date }, selectedFood); closeAdd(); }}/>
      : correctingFood ? <CustomFoodForm base={correctingFood} onSave={(food) => { saveFoodToLibrary(food); setCorrectingFood(null); setSelectedFood(food); }}/>
      : <div className="food-browser">
        <nav className="food-browser-tabs" aria-label="Food browser">{([{ id: 'search', label: 'Search', Icon: Search }, { id: 'barcode', label: 'Barcode', Icon: Barcode }, { id: 'library', label: 'My foods', Icon: Heart }, { id: 'meals', label: 'Meals', Icon: UtensilsCrossed }, { id: 'create', label: 'Create', Icon: Plus }] as const).map(({ id, label, Icon }) => <button key={id} type="button" className={browserTab === id ? 'active' : ''} onClick={() => setBrowserTab(id)}><Icon size={16}/>{label}</button>)}</nav>
        {browserTab === 'search' ? <div className="food-search"><label className="search-field"><Search size={19}/><input autoFocus type="search" placeholder="Search kipfilet, chicken, skyr, barcode…" value={query} onChange={(event) => setQuery(event.target.value)}/>{remoteLoading ? <LoaderCircle className="spin" size={17}/> : query ? <button type="button" onClick={() => setQuery('')} aria-label="Clear search"><X size={17}/></button> : null}</label><div className="food-search__meta"><span>{results.length} matches from Project 75 and available online sources</span><span><Star size={14}/> Best matches first</span></div>{remoteWarning ? <p className="food-search-warning"><CircleAlert size={15}/>{remoteWarning} Local foods remain available.</p> : null}<div className="food-results">{results.length ? results.map((food) => <FoodResult key={food.id} food={food} favorite={data.favorites.includes(food.id)} onFavorite={() => toggleFoodFavorite(food)} onSelect={() => chooseFood(food)}/>) : <div className="empty-state"><Search size={30}/><h3>No foods found</h3><p>Try a shorter food name, an English or Dutch spelling, or scan the barcode.</p></div>}</div>{remoteMore ? <button className="secondary-button full" type="button" disabled={remoteLoading} onClick={async () => { setRemoteLoading(true); try { const next = remotePage + 1; const response = await searchFoodProviders(query.trim(), next); setRemoteFoods((current) => [...current, ...response.foods]); setRemotePage(next); setRemoteMore(response.hasMore); } catch (reason) { setRemoteWarning(reason instanceof Error ? reason.message : 'Could not load more foods.'); } finally { setRemoteLoading(false); } }}>{remoteLoading ? <LoaderCircle className="spin" size={17}/> : null} Load more results</button> : null}</div> : null}
        {browserTab === 'barcode' ? <BarcodeLookup onFound={chooseFood}/> : null}
        {browserTab === 'library' ? <div className="food-results">{customFoods.length ? customFoods.map((food) => <FoodResult key={food.id} food={food} favorite={data.favorites.includes(food.id)} onFavorite={() => toggleFoodFavorite(food)} onSelect={() => chooseFood(food)}/>) : <div className="empty-state"><Heart size={30}/><h3>No personal foods yet</h3><p>Create a food or correct a provider item and it will stay here for quick reuse.</p><button className="secondary-button" type="button" onClick={() => setBrowserTab('create')}><Plus size={17}/> Create food</button></div>}</div> : null}
        {browserTab === 'meals' ? <div className="saved-meal-list">{data.savedMeals.length ? data.savedMeals.map((meal) => <article key={meal.id}><div><strong>{meal.name}</strong><span>{meal.items.length} food{meal.items.length === 1 ? '' : 's'}</span></div><button className="primary-button" type="button" onClick={() => { addSavedMeal(meal.id, date, defaultMeal); closeAdd(); }}><Plus size={16}/> Add</button><button className="icon-button danger" type="button" onClick={() => deleteSavedMeal(meal.id)} aria-label={`Delete ${meal.name}`}><Trash2 size={16}/></button></article>) : <div className="empty-state"><UtensilsCrossed size={30}/><h3>No reusable meals yet</h3><p>After logging a meal in the diary, choose “Save meal” to reuse it later.</p></div>}</div> : null}
        {browserTab === 'create' ? <CustomFoodForm onSave={(food) => { saveFoodToLibrary(food); setSelectedFood(food); }}/>: null}
      </div>}
    </Modal>

    <Modal open={Boolean(editEntry)} onClose={() => setEditEntry(null)} title="Edit food" subtitle="The saved nutrition snapshot keeps this historical entry stable.">{editEntry && foodForEntry(data, editEntry) ? <><FoodForm food={foodForEntry(data, editEntry)!} initial={editEntry} defaultMeal={editEntry.meal} submitLabel="Save changes" onSave={(form) => { updateFood(editEntry.id, form); setEditEntry(null); }}/><div className="destructive-actions"><button type="button" onClick={() => { duplicateFood(editEntry.id); setEditEntry(null); }}><Copy size={17}/> Duplicate</button><button type="button" className="danger" onClick={() => { deleteFood(editEntry.id); setEditEntry(null); }}><Trash2 size={17}/> Delete</button></div></> : null}</Modal>
    <Modal open={Boolean(saveMealType)} onClose={() => setSaveMealType(null)} title="Save reusable meal" subtitle="Reuse the same foods and quantities on any date."><form className="food-form" onSubmit={(event) => { event.preventDefault(); if (saveMealType && saveMealName.trim()) { saveMealFromDiary(saveMealName.trim(), date, saveMealType); setSaveMealType(null); } }}><label>Meal name<input autoFocus value={saveMealName} onChange={(event) => setSaveMealName(event.target.value)}/></label><button className="primary-button full" disabled={!saveMealName.trim()} type="submit"><Heart size={17}/> Save meal</button></form></Modal>
    {settingsOpen ? <NutritionSettingsModal settings={data.nutritionSettings} onSave={controller.updateNutritionSettings} onClose={() => setSettingsOpen(false)}/> : null}
  </div>;
}
