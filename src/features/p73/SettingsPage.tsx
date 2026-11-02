import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Bot, KeyRound, Link2, LogOut, PlugZap, RefreshCw, Trash2 } from 'lucide-react';
import type { AppController } from '../../state/useAppData';
import type { ShoppingController } from '../../state/useShopping';
import { PageSkeleton } from '../../components/Visuals';
import { toDateKey } from '../../lib/date';
import { ingredients } from '../../data/project73/ingredients';
import { acceptSuggestedTargets, updateMetabolicSettings, updatePlanningPreferences, updateProfileAndRecalculate, upsertPantryItem } from '../../lib/project73/actions';
import { targetRecommendation, currentWeightKg } from '../../lib/project73/selectors';
import { ACTIVITY_LEVELS } from '../../lib/project73/metabolism';
import { api, friendlyError } from '../../lib/project73/api';
import { kg, longDate, nlNumber } from '../../lib/project73/format';
import { LOCAL_DATA_KEY, LOCAL_MIGRATION_BACKUP_KEY, LOCAL_MIGRATION_VERIFIED_KEY } from '../../repository/project75Repository';
import type { Allergen, DietTag, PlanningPreferences } from '../../types/project73';
import { Notice, Spinner, Stat } from './ui';

const ProfilePage = lazy(() => import('../ProfilePage').then((module) => ({ default: module.ProfilePage })));

const TABS = [
  { id: 'profile', label: 'Profiel & doelen' },
  { id: 'food', label: 'Voeding & voorkeuren' },
  { id: 'pantry', label: 'Voorraad' },
  { id: 'picnic', label: 'Picnic' },
  { id: 'ai', label: 'AI' },
  { id: 'app', label: 'Training & back-ups' },
  { id: 'data', label: 'Mijn gegevens' },
];

const ALLERGENS: Array<[Allergen, string]> = [['gluten', 'Gluten'], ['melk', 'Melk'], ['lactose', 'Lactose'], ['ei', 'Ei'], ['vis', 'Vis'], ['schaaldieren', 'Schaaldieren'], ['pinda', "Pinda's"], ['noten', 'Noten'], ['soja', 'Soja'], ['sesam', 'Sesam'], ['selderij', 'Selderij'], ['mosterd', 'Mosterd']];
const DIET_PRESETS: Array<{ label: string; tags: DietTag[] }> = [
  { label: 'Geen varkensvlees', tags: ['varken'] },
  { label: 'Geen rundvlees', tags: ['rund'] },
  { label: 'Pescotarisch', tags: ['vlees', 'gevogelte', 'rund', 'varken'] },
  { label: 'Vegetarisch', tags: ['vlees', 'gevogelte', 'rund', 'varken', 'vis'] },
];

type NumberFieldProps = { label: string; value: number | null; onCommit: (value: number | null) => void; min: number; max: number; step?: number; suffix?: string; placeholder?: string };

/** Remounts when the stored value changes, so the text always starts from the saved value. */
function NumberField(props: NumberFieldProps) {
  return <NumberFieldInner key={props.value == null ? 'empty' : String(props.value)} {...props} />;
}

function NumberFieldInner({ label, value, onCommit, min, max, step = 1, suffix, placeholder }: NumberFieldProps) {
  const [text, setText] = useState(value == null ? '' : String(value).replace('.', ','));
  const commit = () => {
    if (!text.trim()) return onCommit(null);
    const parsed = Number(text.replace(',', '.'));
    if (Number.isFinite(parsed) && parsed >= min && parsed <= max) onCommit(Math.round(parsed / step) * step);
    else setText(value == null ? '' : String(value).replace('.', ','));
  };
  return <label className="p73-field">{label}{suffix ? <small> ({suffix})</small> : null}<input inputMode="decimal" value={text} placeholder={placeholder} onChange={(event) => setText(event.target.value)} onBlur={commit} onKeyDown={(event) => { if (event.key === 'Enter') commit(); }} /></label>;
}

function ProfileTab({ controller }: { controller: AppController }) {
  const { data } = controller;
  const today = toDateKey();
  const recommendation = useMemo(() => targetRecommendation(data, today), [data, today]);
  const settings = data.metabolicSettings;
  const weight = currentWeightKg(data);
  const overrides = settings.overrides;
  const hasOverride = Object.values(overrides).some((value) => value != null);
  const setOverride = (key: keyof typeof overrides, value: number | null) => controller.apply(updateMetabolicSettings({ overrides: { ...overrides, [key]: value } }, today));
  return (
    <div className="p73-grid">
      <article className="p73-card p73-span-7">
        <h2>Over jou</h2>
        <div className="p73-fields" style={{ marginTop: 14 }}>
          <label className="p73-field">Naam<input value={data.profile.name} maxLength={60} onChange={(event) => controller.apply(updateProfileAndRecalculate({ name: event.target.value || 'Ik' }, today))} /></label>
          <NumberField label="Leeftijd" value={data.profile.age} min={18} max={100} onCommit={(value) => value && controller.apply(updateProfileAndRecalculate({ age: value }, today))} />
          <label className="p73-field">Geslacht (voor berekening)<select value={data.profile.sex} onChange={(event) => controller.apply(updateProfileAndRecalculate({ sex: event.target.value as 'male' | 'female' }, today))}><option value="male">Man</option><option value="female">Vrouw</option></select></label>
          <NumberField label="Lengte" suffix="cm" value={data.profile.heightCm} min={120} max={230} onCommit={(value) => value && controller.apply(updateProfileAndRecalculate({ heightCm: value }, today))} />
          <div className="stat"><small>Huidig gewicht (trend)</small><strong>{kg(weight)}</strong><em>wijzig via een weging</em></div>
          <NumberField label="Streefgewicht" suffix="kg" step={0.5} value={data.profile.goalWeightKg} min={40} max={200} onCommit={(value) => value && controller.apply((current) => updateProfileAndRecalculate({ goalWeightKg: value }, today)({ ...current, activeGoal: { ...current.activeGoal, targetWeightKg: value, targetRangeKg: [value - 0.5, value + 0.5] } }))} />
          <NumberField label="Tussendoel" suffix="kg" step={0.5} value={settings.previousGoalWeightKg} min={40} max={200} onCommit={(value) => controller.apply(updateMetabolicSettings({ previousGoalWeightKg: value }, today))} placeholder="geen" />
          <NumberField label="Gewenste termijn" suffix="maanden" value={settings.timeframeMonths} min={1} max={36} onCommit={(value) => value && controller.apply(updateMetabolicSettings({ timeframeMonths: value }, today))} />
          <label className="p73-field wide">Activiteit<select value={settings.activityFactor} onChange={(event) => controller.apply(updateMetabolicSettings({ activityFactor: Number(event.target.value) }, today))}>{ACTIVITY_LEVELS.map((level) => <option key={level.factor} value={level.factor}>{level.label} (× {nlNumber(level.factor, 3).replace(/0+$/, '')}) — {level.detail}</option>)}</select></label>
          <NumberField label="Krachttrainingen per week" value={settings.strengthSessionsPerWeek} min={0} max={7} onCommit={(value) => value != null && controller.apply(updateMetabolicSettings({ strengthSessionsPerWeek: value }, today))} />
        </div>
        <hr className="p73-divider" />
        <h3>Tempo</h3>
        <div className="segmented" style={{ marginTop: 10 }} role="radiogroup">
          <button type="button" role="radio" aria-checked={settings.pace === 'target'} className={settings.pace === 'target' ? 'active' : ''} onClick={() => controller.apply(updateMetabolicSettings({ pace: 'target' }, today))}>Gezond tempo (~{nlNumber(recommendation.forecasts.target.kgPerWeek || 0.4, 2)} kg/wk)</button>
          <button type="button" role="radio" aria-checked={settings.pace === 'timeframe'} className={settings.pace === 'timeframe' ? 'active' : ''} onClick={() => controller.apply(updateMetabolicSettings({ pace: 'timeframe' }, today))}>Mijn termijn ({settings.timeframeMonths} mnd)</button>
        </div>
        <div className="stat-row" style={{ marginTop: 12 }}>
          <Stat label="Volgens je termijn" value={recommendation.forecasts.timeframe.date ? longDate(recommendation.forecasts.timeframe.date) : '—'} hint={`${nlNumber(recommendation.forecasts.timeframe.kgPerWeek, 2)} kg per week`} />
          <Stat label="Volgens je caloriedoel" value={recommendation.forecasts.target.date ? longDate(recommendation.forecasts.target.date) : '—'} hint={`${nlNumber(recommendation.expectedKgPerWeek, 2)} kg per week`} />
        </div>
        <p className="muted small" style={{ margin: '10px 0 0' }}>{settings.pace === 'target' ? 'Je caloriedoel is gebaseerd op een gezond tempo binnen 0,25–0,5 kg per week. Daardoor ben je waarschijnlijk eerder dan je termijn op je doel.' : 'Je caloriedoel is afgestemd op je termijn. Dat is rustiger; je kunt altijd naar het gezonde tempo wisselen.'}</p>
      </article>

      <aside className="p73-span-5 p73-stack" style={{ gap: 18, alignContent: 'start' }}>
        <article className="p73-card">
          <div className="p73-card-head"><div><h2>Je dagdoelen</h2><p>Berekend, niet gegokt. Laat een veld leeg om de suggestie te gebruiken.</p></div></div>
          <div className="stat-row">
            <Stat label="Ruststofwisseling" value={`${nlNumber(recommendation.bmr)} kcal`} />
            <Stat label="Onderhoud (schatting)" value={`${nlNumber(recommendation.maintenanceRange[0])}–${nlNumber(recommendation.maintenanceRange[1])}`} hint="kcal per dag" />
          </div>
          <div className="p73-fields" style={{ marginTop: 14 }}>
            <NumberField label="Calorieën" suffix={`suggestie ${nlNumber(recommendation.suggested.kcal)}`} value={overrides.kcal} min={1000} max={5000} step={10} placeholder={String(recommendation.suggested.kcal)} onCommit={(value) => setOverride('kcal', value)} />
            <NumberField label="Eiwit (g)" suffix={`suggestie ${recommendation.suggested.protein}`} value={overrides.protein} min={40} max={350} placeholder={String(recommendation.suggested.protein)} onCommit={(value) => setOverride('protein', value)} />
            <NumberField label="Koolhydraten (g)" suffix={`nu ${recommendation.active.carbs}`} value={overrides.carbs} min={0} max={700} placeholder={String(recommendation.active.carbs)} onCommit={(value) => setOverride('carbs', value)} />
            <NumberField label="Vet (g)" suffix={`nu ${recommendation.active.fat}`} value={overrides.fat} min={20} max={250} placeholder={String(recommendation.active.fat)} onCommit={(value) => setOverride('fat', value)} />
            <NumberField label="Vezels (g)" suffix={`suggestie ${recommendation.suggested.fiber}`} value={overrides.fiber} min={10} max={80} placeholder={String(recommendation.suggested.fiber)} onCommit={(value) => setOverride('fiber', value)} />
          </div>
          {hasOverride ? <button type="button" className="p73-btn ghost small" style={{ marginTop: 10 }} onClick={() => controller.apply(acceptSuggestedTargets(today))}><RefreshCw size={14} />Terug naar de suggestie</button> : null}
          <div className="p73-stack" style={{ marginTop: 12 }}>
            {recommendation.warnings.map((warning) => <Notice key={warning.code} tone={warning.severity === 'warning' ? 'warn' : 'info'} title={warning.message} />)}
          </div>
        </article>
        <details className="p73-card">
          <summary style={{ cursor: 'pointer', fontWeight: 700 }}>Hoe is dit berekend?</summary>
          <ul style={{ margin: '12px 0 0', paddingLeft: 18, color: 'var(--muted)', fontSize: 13.5, lineHeight: 1.6 }}>{recommendation.assumptions.map((line) => <li key={line}>{line}</li>)}</ul>
          <p className="muted small" style={{ marginTop: 10 }}>Dit zijn schattingen, geen medische feiten. Heb je een medische aandoening of twijfel je, overleg dan met je huisarts of een diëtist.</p>
        </details>
      </aside>
    </div>
  );
}

function FoodTab({ controller }: { controller: AppController }) {
  const prefs = controller.data.planningPreferences;
  const set = (changes: Partial<PlanningPreferences>) => controller.apply(updatePlanningPreferences(changes));
  const toggle = <T,>(list: T[], value: T) => list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
  const presetActive = (tags: DietTag[]) => tags.every((tag) => prefs.dietaryRestrictions.includes(tag));
  return (
    <div className="p73-grid">
      <article className="p73-card p73-span-6">
        <h2>Planning</h2>
        <div className="p73-fields" style={{ marginTop: 14 }}>
          <label className="p73-field">Standaard plannen voor<select value={prefs.horizonDays} onChange={(event) => set({ horizonDays: Number(event.target.value) })}>{[1, 2, 3, 4, 5, 6, 7].map((days) => <option key={days} value={days}>{days} {days === 1 ? 'dag' : 'dagen'}</option>)}</select></label>
          <label className="p73-field">Max. bereidingstijd<select value={prefs.maxPrepMinutes} onChange={(event) => set({ maxPrepMinutes: Number(event.target.value) })}>{[10, 15, 20, 30, 45].map((minutes) => <option key={minutes} value={minutes}>{minutes} minuten actief</option>)}</select></label>
          <label className="p73-field">Tussendoortjes per dag<select value={prefs.snacksPerDay} onChange={(event) => set({ snacksPerDay: Number(event.target.value) as 0 | 1 | 2 })}>{[0, 1, 2].map((count) => <option key={count} value={count}>{count}</option>)}</select></label>
          <NumberField label="Boodschappenbudget per week" suffix="€" value={prefs.weeklyGroceryBudgetEur} min={10} max={500} onCommit={(value) => set({ weeklyGroceryBudgetEur: value })} placeholder="geen" />
          <label className="p73-field">Huishouden<select value={prefs.household} onChange={(event) => set({ household: Number(event.target.value) })}><option value={1}>1 persoon</option></select></label>
          <label className="p73-field">Weergave<select value={prefs.theme} onChange={(event) => set({ theme: event.target.value as PlanningPreferences['theme'] })}><option value="system">Zoals mijn apparaat</option><option value="light">Licht</option><option value="dark">Donker</option></select></label>
        </div>
        <div style={{ marginTop: 10 }}>
          <label className="switch"><span>Restjes inplannen<p>Kook ’s avonds een extra portie en eet die de volgende dag als lunch.</p></span><input type="checkbox" checked={prefs.allowLeftovers} onChange={(event) => set({ allowLeftovers: event.target.checked })} /></label>
          <label className="switch"><span>Basisvoorraad in huis<p>Olie, zout, peper, sojasaus, knoflook en gedroogde kruiden worden niet besteld.</p></span><input type="checkbox" checked={prefs.staplesAtHome} onChange={(event) => set({ staplesAtHome: event.target.checked })} /></label>
        </div>
      </article>
      <article className="p73-card p73-span-6">
        <h2>Allergenen en dieet</h2>
        <p className="muted small" style={{ margin: '6px 0 12px' }}>Er wordt niets aangenomen. Wat je hier kiest wordt uitgesloten bij recepten én gecontroleerd op het Picnic-etiket.</p>
        <h3>Allergenen</h3>
        <div className="chip-set" style={{ margin: '8px 0 14px' }}>{ALLERGENS.map(([key, label]) => <button key={key} type="button" className={`chip-toggle${prefs.allergens.includes(key) ? ' on' : ''}`} aria-pressed={prefs.allergens.includes(key)} onClick={() => set({ allergens: toggle(prefs.allergens, key) })}>{label}</button>)}</div>
        <h3>Dieet</h3>
        <div className="chip-set" style={{ margin: '8px 0 14px' }}>{DIET_PRESETS.map((preset) => <button key={preset.label} type="button" className={`chip-toggle${presetActive(preset.tags) ? ' on' : ''}`} aria-pressed={presetActive(preset.tags)} onClick={() => set({ dietaryRestrictions: presetActive(preset.tags) ? prefs.dietaryRestrictions.filter((tag) => !preset.tags.includes(tag)) : [...new Set([...prefs.dietaryRestrictions, ...preset.tags])] })}>{preset.label}</button>)}</div>
        <h3>Liever niet</h3>
        <div className="chip-set" style={{ margin: '8px 0 0' }}>{ingredients.filter((ingredient) => !ingredient.staple).map((ingredient) => <button key={ingredient.id} type="button" className={`chip-toggle${prefs.dislikedIngredientIds.includes(ingredient.id) ? ' on' : ''}`} aria-pressed={prefs.dislikedIngredientIds.includes(ingredient.id)} onClick={() => set({ dislikedIngredientIds: toggle(prefs.dislikedIngredientIds, ingredient.id) })}>{ingredient.name}</button>)}</div>
        <hr className="p73-divider" />
        <h3>Favoriete producten</h3>
        <p className="muted small" style={{ margin: '6px 0 0' }}>{prefs.preferredFoods.join(' · ')}</p>
      </article>
    </div>
  );
}

function PantryTab({ controller }: { controller: AppController }) {
  const { pantry } = controller.data;
  const [ingredientId, setIngredientId] = useState(ingredients[0].id);
  const [amount, setAmount] = useState('');
  const selected = ingredients.find((item) => item.id === ingredientId)!;
  const unitLabel = selected.unit === 'piece' ? 'stuks' : selected.unit;
  return (
    <div className="p73-grid">
      <article className="p73-card p73-span-7">
        <div className="p73-card-head"><div><h2>In huis</h2><p>De app trekt dit af van je boodschappen. Tip: zeg tegen de assistent “Ik heb nog rijst en eieren thuis”.</p></div></div>
        {pantry.length ? (
          <ul className="diff-list">
            {pantry.map((item) => {
              const ingredient = ingredients.find((entry) => entry.id === item.ingredientId);
              return <li key={item.id} className="keep"><span>{ingredient?.name ?? item.ingredientId}</span><span className="p73-row" style={{ gap: 6 }}><b className="num">{nlNumber(item.amount)} {item.unit === 'piece' ? 'st.' : item.unit}</b><button type="button" className="p73-btn ghost small icon" aria-label={`Verwijder ${ingredient?.name}`} onClick={() => controller.apply(upsertPantryItem(item.ingredientId, 0, item.unit))}><Trash2 size={14} /></button></span></li>;
            })}
          </ul>
        ) : <p className="muted">Je voorraad is leeg.</p>}
      </article>
      <article className="p73-card p73-span-5">
        <h2>Toevoegen</h2>
        <form className="p73-form" style={{ marginTop: 12 }} onSubmit={(event) => {
          event.preventDefault();
          const value = Number(amount.replace(',', '.'));
          if (!(value > 0)) return;
          const existing = pantry.find((item) => item.ingredientId === ingredientId)?.amount ?? 0;
          controller.apply(upsertPantryItem(ingredientId, existing + value, selected.unit));
          setAmount('');
        }}>
          <label className="p73-field">Product<select value={ingredientId} onChange={(event) => setIngredientId(event.target.value)}>{ingredients.map((ingredient) => <option key={ingredient.id} value={ingredient.id}>{ingredient.name}</option>)}</select></label>
          <label className="p73-field">Hoeveelheid ({unitLabel})<input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder={selected.unit === 'piece' ? '6' : '500'} /></label>
          <button type="submit" className="p73-btn primary">Toevoegen aan voorraad</button>
        </form>
      </article>
    </div>
  );
}

function PicnicTab({ shopping }: { shopping: ShoppingController }) {
  const { status } = shopping;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: 'good' | 'bad' | 'info'; text: string } | null>(null);
  const run = async (key: string, task: () => Promise<string | void>) => {
    setBusy(key);
    setMessage(null);
    try {
      const text = await task();
      if (text) setMessage({ tone: 'good', text });
    } catch (error) {
      setMessage({ tone: 'bad', text: friendlyError(error) });
    } finally {
      setBusy(null);
      void shopping.refreshStatus();
    }
  };
  const connection = status?.connection;
  return (
    <div className="p73-grid">
      <article className="p73-card p73-span-7">
        <div className="p73-card-head"><div><h2>Picnic-account</h2><p>Je inloggegevens gaan alleen naar de server van deze app en direct door naar Picnic. Je wachtwoord wordt nooit opgeslagen; alleen een versleutelde sessiesleutel.</p></div><PlugZap size={22} color="var(--muted)" /></div>
        {!status ? <Spinner /> : status.mode === 'mock' ? <Notice tone="info" title="Demo-modus">Deze server draait zonder Picnic-koppeling (PICNIC_MODE=mock). Producten en prijzen zijn voorbeelden.</Notice> : null}
        {shopping.signedOut ? <Notice tone="warn" title="Log eerst in bij de app">Picnic koppelen kan alleen met een account, zodat je sleutel veilig aan jou gebonden is.</Notice> : null}
        {status?.mode === 'live' && !status.encryptionConfigured ? <Notice tone="bad" title="Server niet geconfigureerd">PICNIC_TOKEN_ENCRYPTION_KEY ontbreekt. Zie de README.</Notice> : null}
        {message ? <div style={{ margin: '12px 0' }}><Notice tone={message.tone} title={message.text} /></div> : null}

        {status?.mode === 'live' && connection?.status === 'connected' ? (
          <div className="p73-stack" style={{ marginTop: 12 }}>
            <Notice tone="good" title="Gekoppeld met Picnic">Sinds {connection.connectedAt ? longDate(connection.connectedAt.slice(0, 10)) : 'onbekend'}{connection.lastCheckedAt ? ` · laatst gecontroleerd ${new Date(connection.lastCheckedAt).toLocaleString('nl-NL')}` : ''}.</Notice>
            <div className="p73-row">
              <button type="button" className="p73-btn secondary" disabled={busy != null} onClick={() => void run('test', async () => { const result = await api.testConnection(); return `Verbinding werkt. ${result.cartItems} product(en) in je mandje.`; })}>{busy === 'test' ? <Spinner /> : <Link2 size={15} />}Test verbinding</button>
              <button type="button" className="p73-btn danger" disabled={busy != null} onClick={() => { if (window.confirm('Picnic ontkoppelen? Je sessiesleutel wordt verwijderd.')) void run('disconnect', async () => { await api.disconnect(); return 'Picnic is ontkoppeld en je sleutel is verwijderd.'; }); }}><LogOut size={15} />Ontkoppelen</button>
            </div>
          </div>
        ) : null}

        {status?.mode === 'live' && connection?.status === 'pending_2fa' ? (
          <form className="p73-form" style={{ marginTop: 12 }} onSubmit={(event) => { event.preventDefault(); void run('verify', async () => { await api.verify2fa(code.trim()); setCode(''); return 'Gekoppeld met Picnic.'; }); }}>
            <Notice tone="info" title="Vul de sms-code van Picnic in" />
            <label className="p73-field">Code<input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value)} maxLength={8} /></label>
            <div className="p73-row"><button type="submit" className="p73-btn primary" disabled={busy != null || code.trim().length < 4}>{busy === 'verify' ? <Spinner /> : null}Bevestigen</button><button type="button" className="p73-btn ghost" disabled={busy != null} onClick={() => void run('resend', async () => { await api.resend2fa(); return 'Nieuwe code verstuurd.'; })}>Nieuwe code</button></div>
          </form>
        ) : null}

        {status?.mode === 'live' && (!connection || connection.status === 'expired') && !shopping.signedOut ? (
          <form className="p73-form" style={{ marginTop: 12 }} onSubmit={(event) => { event.preventDefault(); void run('login', async () => { const result = await api.login(email.trim(), password); setPassword(''); return result.status === 'connected' ? 'Gekoppeld met Picnic.' : 'Picnic heeft een sms-code gestuurd.'; }); }}>
            {connection?.status === 'expired' ? <Notice tone="warn" title="Je Picnic-sessie is verlopen. Log opnieuw in." /> : null}
            <label className="p73-field">E-mailadres bij Picnic<input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
            <label className="p73-field">Wachtwoord<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
            <button type="submit" className="p73-btn primary" disabled={busy != null || !email || !password}>{busy === 'login' ? <Spinner /> : <KeyRound size={15} />}Koppel Picnic</button>
          </form>
        ) : null}
      </article>
      <aside className="p73-span-5 p73-stack" style={{ gap: 18, alignContent: 'start' }}>
        <article className="p73-card">
          <h2>Direct bestellen</h2>
          <p className="muted small" style={{ margin: '6px 0 12px' }}>Standaard zet de app je mandje klaar en rond je zelf af in de Picnic-app. Met direct bestellen keur je de bestelling hier goed en betaal je via je bank.</p>
          <label className="switch"><span>Direct bestellen toestaan<p>{status?.checkout.serverEnabled ? 'Elke bestelling vraagt je expliciete akkoord en bankbevestiging.' : 'Uitgeschakeld op de server (PICNIC_CHECKOUT_ENABLED).'}</p></span><input type="checkbox" disabled={!status?.checkout.serverEnabled || connection?.status !== 'connected' || busy != null} checked={Boolean(status?.checkout.userEnabled)} onChange={(event) => { const enabled = event.target.checked; void run('checkout', async () => { await api.setCheckoutEnabled(enabled); return enabled ? 'Direct bestellen staat aan.' : 'Direct bestellen staat uit.'; }); }} /></label>
          <Notice tone="info" title="Onofficiële koppeling">Deze app gebruikt de onofficiële picnic-api. Als Picnic iets wijzigt kan een functie tijdelijk niet werken; de app meldt dat dan duidelijk.</Notice>
        </article>
      </aside>
    </div>
  );
}

function AiTab() {
  const [status, setStatus] = useState<{ provider: string | null; model: string | null } | null>(null);
  useEffect(() => { void api.assistantStatus().then(setStatus).catch(() => setStatus({ provider: null, model: null })); }, []);
  return (
    <article className="p73-card">
      <div className="p73-card-head"><div><h2>AI-assistent</h2><p>De assistent begrijpt je verzoek en stelt een actie voor. Alle getallen (calorieën, eiwit, prijzen) rekent de app zelf exact uit.</p></div><Bot size={22} color="var(--muted)" /></div>
      <div className="stat-row">
        <Stat label="Taalmodel" value={status ? status.provider === 'openai' ? 'OpenAI' : status.provider === 'anthropic' ? 'Anthropic' : 'Niet ingesteld' : '…'} hint={status?.model ?? (status?.provider ? 'standaardmodel' : 'regels zonder AI')} />
        <Stat label="Zonder AI" value="Werkt" hint="vaste Nederlandse regels" />
      </div>
      <ul style={{ margin: '14px 0 0', paddingLeft: 18, color: 'var(--muted)', lineHeight: 1.6, fontSize: 14 }}>
        <li>De sleutel van het taalmodel staat alleen op de server (OPENAI_API_KEY of ANTHROPIC_API_KEY met AI_PROVIDER).</li>
        <li>De assistent kan nooit bestellen of betalen. Elke wijziging zie je eerst en voer je zelf door.</li>
        <li>Antwoorden worden gecontroleerd tegen een vast schema; bij twijfel valt de app terug op vaste regels.</li>
      </ul>
    </article>
  );
}

function DataTab({ controller, shopping }: { controller: AppController; shopping: ShoppingController }) {
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null);
  return (
    <div className="p73-grid">
      <article className="p73-card p73-span-7">
        <h2>Gegevens verwijderen</h2>
        <p className="muted small" style={{ margin: '6px 0 12px' }}>Verwijdert van de server: je profiel, metingen, voedingslog, plannen, boodschappenlijsten, Picnic-koppeling en voortgangsfoto’s. Dit kan niet ongedaan worden gemaakt. Maak eerst een back-up via “Training & back-ups” als je iets wilt bewaren.</p>
        {result ? <div style={{ marginBottom: 12 }}><Notice tone={result.tone} title={result.text} /></div> : null}
        <label className="p73-field">Typ VERWIJDER om te bevestigen<input value={confirm} onChange={(event) => setConfirm(event.target.value)} autoComplete="off" /></label>
        <div className="p73-row" style={{ marginTop: 12 }}>
          <button type="button" className="p73-btn danger" disabled={confirm !== 'VERWIJDER' || busy || shopping.signedOut} onClick={async () => {
            setBusy(true);
            try {
              await api.deleteAccount();
              setResult({ tone: 'good', text: 'Alles is van de server verwijderd.' });
            } catch (error) {
              setResult({ tone: 'bad', text: friendlyError(error) });
            } finally {
              setBusy(false);
            }
          }}>{busy ? <Spinner /> : <Trash2 size={15} />}Verwijder mijn gegevens van de server</button>
          <button type="button" className="p73-btn secondary" disabled={confirm !== 'VERWIJDER'} onClick={() => {
            for (const key of [LOCAL_DATA_KEY, LOCAL_MIGRATION_BACKUP_KEY, LOCAL_MIGRATION_VERIFIED_KEY]) window.localStorage.removeItem(key);
            window.location.reload();
          }}>Wis dit apparaat</button>
        </div>
      </article>
      <article className="p73-card p73-span-5">
        <h2>Wat staat waar?</h2>
        <ul style={{ margin: '12px 0 0', paddingLeft: 18, color: 'var(--muted)', lineHeight: 1.6, fontSize: 13.5 }}>
          <li>Je plan, metingen en logboek: in je account (versleuteld verkeer) en als kopie op dit apparaat.</li>
          <li>Picnic-sleutel: alleen op de server, versleuteld (AES-GCM).</li>
          <li>Boodschappenlijsten en mandje-acties: op de server, voor veilige herhaalbare synchronisatie.</li>
          <li>Synchronisatie: {controller.syncMessage}</li>
        </ul>
      </article>
    </div>
  );
}

export function SettingsPage({ controller, shopping, tab, setTab, onProfileDirtyChange }: { controller: AppController; shopping: ShoppingController; tab: string; setTab: (tab: string) => void; onProfileDirtyChange: (dirty: boolean) => void }) {
  return (
    <section className="page p73">
      <header className="p73-title"><div><p className="p73-kicker">Instellingen</p><h1>Instellingen</h1></div></header>
      <div className="settings-nav" role="tablist" aria-label="Instellingen">{TABS.map((item) => <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} className={tab === item.id ? 'active' : ''} onClick={() => setTab(item.id)}>{item.label}</button>)}</div>
      {tab === 'profile' ? <ProfileTab controller={controller} /> : null}
      {tab === 'food' ? <FoodTab controller={controller} /> : null}
      {tab === 'pantry' ? <PantryTab controller={controller} /> : null}
      {tab === 'picnic' ? <PicnicTab shopping={shopping} /> : null}
      {tab === 'ai' ? <AiTab /> : null}
      {tab === 'data' ? <DataTab controller={controller} shopping={shopping} /> : null}
      {tab === 'app' ? <Suspense fallback={<PageSkeleton />}><div style={{ margin: '0 -1px' }}><ProfilePage controller={controller} onDirtyChange={onProfileDirtyChange} mode="training" /></div></Suspense> : null}
    </section>
  );
}
