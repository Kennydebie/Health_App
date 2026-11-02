import { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, ChefHat, Scale, Sparkles, Target } from 'lucide-react';
import { toDateKey } from '../lib/date';
import type { AppController } from '../state/useAppData';
import { ACTIVITY_LEVELS, recommendTargets } from '../lib/project73/metabolism';
import { createPlan, recalculateTargets, updateMetabolicSettings, updatePlanningPreferences } from '../lib/project73/actions';
import type { Allergen } from '../types/project73';
import { longDate, nlNumber } from '../lib/project73/format';

interface OnboardingFlowProps { controller: AppController }

const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const weekdayLabels: Record<string, string> = { Monday: 'ma', Tuesday: 'di', Wednesday: 'wo', Thursday: 'do', Friday: 'vr', Saturday: 'za', Sunday: 'zo' };
const ALLERGENS: Array<[Allergen, string]> = [['gluten', 'Gluten'], ['melk', 'Melk'], ['lactose', 'Lactose'], ['ei', 'Ei'], ['vis', 'Vis'], ['pinda', "Pinda's"], ['noten', 'Noten'], ['soja', 'Soja'], ['sesam', 'Sesam']];

const parse = (value: string) => Number(value.replace(',', '.'));

/** Dutch first-run setup for Project 73, prefilled with the agreed starting profile. Everything stays editable later. */
export function OnboardingFlow({ controller }: OnboardingFlowProps) {
  const { data } = controller;
  const today = toDateKey();
  const [step, setStep] = useState(0);
  const [name, setName] = useState(data.profile.name);
  const [weight, setWeight] = useState('85,5');
  const [goal, setGoal] = useState(String(data.profile.goalWeightKg).replace('.', ','));
  const [age, setAge] = useState(String(data.profile.age));
  const [height, setHeight] = useState(String(data.profile.heightCm));
  const [sex, setSex] = useState(data.profile.sex);
  const [months, setMonths] = useState(String(data.metabolicSettings.timeframeMonths));
  const [activity, setActivity] = useState(data.metabolicSettings.activityFactor);
  const [trainingDays, setTrainingDays] = useState(data.profile.trainingDays.length ? data.profile.trainingDays : ['Monday', 'Wednesday', 'Friday']);
  const [allergens, setAllergens] = useState<Allergen[]>(data.planningPreferences.allergens);
  const [planNow, setPlanNow] = useState(true);

  const basics = { weightKg: parse(weight), goalWeightKg: parse(goal), age: parse(age), heightCm: parse(height) };
  const validBasics = name.trim().length > 0 && basics.weightKg >= 30 && basics.weightKg <= 300 && basics.goalWeightKg >= 40 && basics.goalWeightKg <= 200 && basics.age >= 18 && basics.age <= 100 && basics.heightCm >= 120 && basics.heightCm <= 230;
  const recommendation = useMemo(() => validBasics ? recommendTargets({ sex, age: basics.age, heightCm: basics.heightCm, weightKg: basics.weightKg, goalWeightKg: basics.goalWeightKg }, { ...data.metabolicSettings, activityFactor: activity, timeframeMonths: parse(months) || 12 }, today) : null, [validBasics, sex, basics.age, basics.heightCm, basics.weightKg, basics.goalWeightKg, data.metabolicSettings, activity, months, today]);
  if (data.onboardingCompleted) return null;

  const complete = () => {
    if (!recommendation) return;
    const profile = { ...data.profile, name: name.trim(), age: basics.age, heightCm: basics.heightCm, sex, goalWeightKg: basics.goalWeightKg, trainingDays };
    controller.saveWeight(today, Math.round(basics.weightKg * 10) / 10);
    controller.completeOnboarding(profile, data.coachingSettings, basics.weightKg);
    controller.apply(updateMetabolicSettings({ activityFactor: activity, timeframeMonths: parse(months) || 12, previousGoalWeightKg: data.metabolicSettings.previousGoalWeightKg }, today));
    controller.apply(updatePlanningPreferences({ allergens }));
    controller.apply(recalculateTargets(today));
    if (planNow) controller.apply(createPlan(today, data.planningPreferences.horizonDays, today));
  };

  const steps = ['Startpunt', 'Doel en tempo', 'Voorkeuren'];
  return (
    <div className="modal-backdrop" role="presentation" style={{ zIndex: 200 }}>
      <section className="p73-card p73" role="dialog" aria-modal="true" aria-labelledby="onboarding-title" style={{ width: 'min(680px, calc(100vw - 24px))', maxHeight: 'calc(100dvh - 24px)', overflowY: 'auto', margin: 'auto', gap: 16, pointerEvents: 'auto' }}>
        <header className="p73-row between">
          <div className="p73-row"><span className="brand-mark"><Sparkles size={18} /></span><div><p className="p73-kicker" style={{ margin: 0 }}>Project 73</p><strong>Stap {step + 1} van 3 · {steps[step]}</strong></div></div>
        </header>
        <div className="journey__track" aria-hidden="true"><div className="journey__fill" style={{ width: `${((step + 1) / 3) * 100}%` }} /></div>

        {step === 0 ? (
          <div className="p73-stack">
            <Scale size={28} color="var(--accent)" />
            <h1 id="onboarding-title" style={{ margin: 0, fontSize: 28 }}>Waar begin je?</h1>
            <p className="muted" style={{ margin: 0 }}>Vooraf ingevuld met je gegevens. Pas aan wat niet klopt; alles blijft later te wijzigen.</p>
            <div className="p73-fields">
              <label className="p73-field">Naam<input value={name} onChange={(event) => setName(event.target.value)} /></label>
              <label className="p73-field">Huidig gewicht (kg)<input inputMode="decimal" value={weight} onChange={(event) => setWeight(event.target.value)} /></label>
              <label className="p73-field">Streefgewicht (kg)<input inputMode="decimal" value={goal} onChange={(event) => setGoal(event.target.value)} /></label>
              <label className="p73-field">Lengte (cm)<input inputMode="numeric" value={height} onChange={(event) => setHeight(event.target.value)} /></label>
              <label className="p73-field">Leeftijd<input inputMode="numeric" value={age} onChange={(event) => setAge(event.target.value)} /></label>
              <label className="p73-field">Geslacht (voor berekening)<select value={sex} onChange={(event) => setSex(event.target.value as 'male' | 'female')}><option value="male">Man</option><option value="female">Vrouw</option></select></label>
            </div>
          </div>
        ) : null}

        {step === 1 && recommendation ? (
          <div className="p73-stack">
            <Target size={28} color="var(--accent)" />
            <h1 id="onboarding-title" style={{ margin: 0, fontSize: 28 }}>Je doel en tempo</h1>
            <div className="p73-fields">
              <label className="p73-field">Termijn (maanden)<input inputMode="numeric" value={months} onChange={(event) => setMonths(event.target.value)} /></label>
              <label className="p73-field wide">Activiteit<select value={activity} onChange={(event) => setActivity(Number(event.target.value))}>{ACTIVITY_LEVELS.map((level) => <option key={level.factor} value={level.factor}>{level.label} — {level.detail}</option>)}</select></label>
            </div>
            <div className="stat-row">
              <div className="stat"><small>Dagdoel</small><strong>{nlNumber(recommendation.suggested.kcal)} kcal</strong><em>onderhoud ±{nlNumber(recommendation.tdee)} kcal</em></div>
              <div className="stat"><small>Eiwit</small><strong>{recommendation.suggested.protein} g</strong><em>om spiermassa te behouden</em></div>
              <div className="stat"><small>Verwacht tempo</small><strong>{nlNumber(recommendation.expectedKgPerWeek, 2)} kg/wk</strong><em>{recommendation.forecasts.target.date ? `doel rond ${longDate(recommendation.forecasts.target.date)}` : ''}</em></div>
            </div>
            {recommendation.warnings.filter((warning) => warning.code === 'slow_timeframe' || warning.severity === 'warning').map((warning) => <div key={warning.code} className={`notice ${warning.severity === 'warning' ? 'warn' : 'info'}`}><div><strong>{warning.message}</strong></div></div>)}
            <p className="muted small" style={{ margin: 0 }}>Berekend met de Mifflin-St Jeor-formule. Het blijft een schatting: na een paar weken wegen stuurt de app bij op basis van je echte trend.</p>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="p73-stack">
            <ChefHat size={28} color="var(--accent)" />
            <h1 id="onboarding-title" style={{ margin: 0, fontSize: 28 }}>Wat moet de app weten?</h1>
            <div>
              <h3 style={{ margin: '0 0 8px' }}>Allergenen <span className="muted small">(niets aangevinkt = geen)</span></h3>
              <div className="chip-set">{ALLERGENS.map(([key, label]) => <button key={key} type="button" className={`chip-toggle${allergens.includes(key) ? ' on' : ''}`} aria-pressed={allergens.includes(key)} onClick={() => setAllergens((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key])}>{label}</button>)}</div>
            </div>
            <div>
              <h3 style={{ margin: '0 0 8px' }}>Trainingsdagen <span className="muted small">(thuis, 2–3 keer per week)</span></h3>
              <div className="chip-set">{weekdays.map((day) => <button key={day} type="button" className={`chip-toggle${trainingDays.includes(day) ? ' on' : ''}`} aria-pressed={trainingDays.includes(day)} onClick={() => setTrainingDays((current) => current.includes(day) ? current.filter((item) => item !== day) : [...current, day])}>{weekdayLabels[day]}</button>)}</div>
            </div>
            <label className="switch"><span>Plan meteen mijn eerste {data.planningPreferences.horizonDays} dagen<p>Simpele maaltijden van maximaal {data.planningPreferences.maxPrepMinutes} minuten, met restjes voor de lunch.</p></span><input type="checkbox" checked={planNow} onChange={(event) => setPlanNow(event.target.checked)} /></label>
          </div>
        ) : null}

        <footer className="p73-row between">
          {step > 0 ? <button type="button" className="p73-btn secondary" onClick={() => setStep((value) => value - 1)}><ArrowLeft size={16} />Terug</button> : <span />}
          {step < 2
            ? <button type="button" className="p73-btn primary" disabled={!validBasics} onClick={() => setStep((value) => value + 1)}>Verder<ArrowRight size={16} /></button>
            : <button type="button" className="p73-btn primary" disabled={!validBasics || trainingDays.length < 1} onClick={complete}><Check size={16} />Start Project 73</button>}
        </footer>
      </section>
    </div>
  );
}
