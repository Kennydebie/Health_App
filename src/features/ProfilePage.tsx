import { useEffect, useMemo, useState } from 'react';
import { Activity, Calculator, Check, ChevronRight, Dumbbell, Save, ShieldCheck, Target, UserRound } from 'lucide-react';
import { Modal } from '../components/Modal';
import { getDashboardSummary } from '../lib/selectors';
import { isProfileDirty } from '../lib/profile';
import type { AppController } from '../state/useAppData';
import type { UserProfile } from '../types/models';
import { DataBackups } from './DataBackups';

interface ProfilePageProps { controller: AppController; onDirtyChange?: (dirty: boolean) => void; }

const equipmentOptions = ['Adjustable dumbbells', 'Barbell', 'Bench', 'Dip setup', 'Bodyweight'];
const dayOptions = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function recommendedTargets(profile: UserProfile, weightKg: number) {
  const bmr = 10 * weightKg + 6.25 * profile.heightCm - 5 * profile.age + (profile.sex === 'male' ? 5 : -161);
  const maintenance = bmr * 1.45;
  const calories = Math.round((maintenance - 450) / 50) * 50;
  const protein = Math.round(weightKg * 2.05 / 5) * 5;
  const fat = Math.round(weightKg * 0.8);
  const carbs = Math.round((calories - protein * 4 - fat * 9) / 4);
  return { calories, protein, fat, carbs };
}

export function ProfilePage({ controller, onDirtyChange }: ProfilePageProps) {
  const [draft, setDraft] = useState<UserProfile>(() => structuredClone(controller.data.profile));
  const [saved, setSaved] = useState(false);
  const [recommendOpen, setRecommendOpen] = useState(false);
  const summary = useMemo(() => getDashboardSummary(controller.data), [controller.data]);
  const canonicalCurrent = summary.body.currentWeight;
  const canonicalStart = summary.body.startingWeight;
  const recommendations = useMemo(() => recommendedTargets(draft, canonicalCurrent ?? draft.goalWeightKg), [draft, canonicalCurrent]);
  const planWeek = summary.planWeek;
  const trainingStreak = summary.streak.weeks;
  const consistency = summary.weekly;
  const setNumber = (key: keyof UserProfile, value: number) => setDraft((current) => ({ ...current, [key]: value }));
  const valid = draft.name.trim().length > 0 && draft.age >= 18 && draft.heightCm > 100 && draft.goalWeightKg > 30 && draft.calorieTarget >= 1000 && draft.proteinTarget > 0 && draft.carbTarget >= 0 && draft.fatTarget > 0;
  const dirty = isProfileDirty(draft, controller.data.profile);

  useEffect(() => {
    onDirtyChange?.(dirty);
    const warn = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => { window.removeEventListener('beforeunload', warn); onDirtyChange?.(false); };
  }, [dirty, onDirtyChange]);

  return <div className="page profile-page">
    <header className="page-header"><div><h1>Profile & settings</h1><p>Update your body, nutrition and training settings. {dirty ? <strong className="unsaved-label">Unsaved changes</strong> : null}</p></div><button className="primary-button" type="button" disabled={!valid || !dirty} onClick={() => { controller.updateProfile(draft); setSaved(true); window.setTimeout(() => setSaved(false), 1800); }}>{saved ? <Check size={18} /> : <Save size={18} />}{saved ? 'Saved' : dirty ? 'Save changes' : 'No changes'}</button></header>

    <section className="settings-layout">
      <div className="settings-main">
        <article className="card settings-section"><header><span className="metric-icon blue"><UserRound size={19} /></span><div><h2>Body & goal</h2></div></header><div className="settings-grid">
          <label className="wide">Name<input type="text" value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} /></label>
          <label>Age<input type="number" min="18" max="100" value={draft.age} onChange={(event) => setNumber('age', Number(event.target.value))} /></label>
          <label>Biological sex<select value={draft.sex} onChange={(event) => setDraft((current) => ({ ...current, sex: event.target.value as UserProfile['sex'] }))}><option value="male">Male</option><option value="female">Female</option></select></label>
          <label>Height<div className="unit-input"><input type="number" min="100" max="240" value={draft.heightCm} onChange={(event) => setNumber('heightCm', Number(event.target.value))} /><span>cm</span></div></label>
          <div className="profile-derived"><span>Current weight</span><strong>{canonicalCurrent == null ? '—' : canonicalCurrent.toFixed(1)} kg</strong><small>Latest real measurement</small></div>
          <div className="profile-derived"><span>Starting weight</span><strong>{canonicalStart == null ? '—' : canonicalStart.toFixed(1)} kg</strong><small>First real measurement</small></div>
          <label>Goal weight<div className="unit-input"><input type="number" min="30" max="300" step="0.1" value={draft.goalWeightKg} onChange={(event) => setNumber('goalWeightKg', Number(event.target.value))} /><span>kg</span></div></label>
          <label>Units<select value={draft.units} onChange={(event) => setDraft((current) => ({ ...current, units: event.target.value as UserProfile['units'] }))}><option value="metric">Metric</option><option value="imperial">Imperial</option></select></label>
          <label>Balance confidence<select value={draft.balanceLevel} onChange={(event) => setDraft((current) => ({ ...current, balanceLevel: event.target.value as UserProfile['balanceLevel'] }))}><option value="beginner">Needs support</option><option value="developing">Developing</option><option value="stable">Stable</option></select></label>
        </div></article>

        <article className="card settings-section"><header><span className="metric-icon lime"><Target size={19} /></span><div><h2>Daily targets</h2></div><button type="button" className="secondary-button" disabled={canonicalCurrent == null} title={canonicalCurrent == null ? 'Log a weight measurement first' : undefined} onClick={() => setRecommendOpen(true)}><Calculator size={16} /> Recalculate</button></header><div className="target-fields">
          <label><span>Calories</span><div><input type="number" min="1000" max="5000" step="10" value={draft.calorieTarget} onChange={(event) => setNumber('calorieTarget', Number(event.target.value))} /><small>kcal</small></div></label>
          <label><span>Protein</span><div><input type="number" min="20" max="400" value={draft.proteinTarget} onChange={(event) => setNumber('proteinTarget', Number(event.target.value))} /><small>g</small></div></label>
          <label><span>Carbohydrates</span><div><input type="number" min="0" max="800" value={draft.carbTarget} onChange={(event) => setNumber('carbTarget', Number(event.target.value))} /><small>g</small></div></label>
          <label><span>Fat</span><div><input type="number" min="20" max="300" value={draft.fatTarget} onChange={(event) => setNumber('fatTarget', Number(event.target.value))} /><small>g</small></div></label>
        </div><p className="settings-note"><ShieldCheck size={16} /> Protein is set high to support lean mass during a calorie deficit. Change any target manually at any time.</p></article>

        <article className="card settings-section"><header><span className="metric-icon orange"><Dumbbell size={19} /></span><div><h2>Schedule & equipment</h2></div></header><div className="choice-section"><span>Preferred training days</span><div className="choice-chips">{dayOptions.map((day) => <button type="button" key={day} className={draft.trainingDays.includes(day) ? 'active' : ''} onClick={() => setDraft((current) => ({ ...current, trainingDays: current.trainingDays.includes(day) ? current.trainingDays.filter((item) => item !== day) : [...current.trainingDays, day] }))}>{draft.trainingDays.includes(day) ? <Check size={14} /> : null}{day.slice(0, 3)}</button>)}</div></div><div className="choice-section"><span>Available equipment</span><div className="equipment-list">{equipmentOptions.map((item) => <button type="button" key={item} className={draft.equipment.includes(item) ? 'active' : ''} onClick={() => setDraft((current) => ({ ...current, equipment: current.equipment.includes(item) ? current.equipment.filter((value) => value !== item) : [...current.equipment, item] }))}><i>{draft.equipment.includes(item) ? <Check size={15} /> : null}</i>{item}</button>)}</div></div></article>
        <DataBackups controller={controller} />
      </div>

      <aside className="settings-aside"><article className="profile-summary"><div className="profile-avatar">{draft.name.charAt(0).toUpperCase()}</div><p className="eyebrow">Your goal</p><h2>{draft.goalWeightKg} kg while maintaining muscle</h2><div><span><strong>{canonicalCurrent == null ? '—' : canonicalCurrent.toFixed(1)}</strong> kg now</span><ChevronRight size={18} /><span><strong>{draft.goalWeightKg}</strong> kg goal</span></div><section className="profile-plan-status"><span><Target size={15} /><strong>Week {planWeek}</strong><small>current week</small></span><span><Dumbbell size={15} /><strong>{trainingStreak}</strong><small>week streak</small></span><span><Activity size={15} /><strong>{consistency.percent}%</strong><small>{consistency.completed} of {consistency.due} due goals</small></span></section></article><article className="card data-card"><ShieldCheck size={20} /><h3>Private health data</h3><p>Signed-in synchronization uses account-owned records. A device copy remains available for offline use and recovery.</p></article></aside>
    </section>

    <Modal open={recommendOpen} onClose={() => setRecommendOpen(false)} title="Recommended starting targets" subtitle="Review the estimate before applying it.">
      <div className="recommendation"><p>This estimate uses Mifflin–St Jeor with a modest activity factor and roughly a 450 kcal deficit. Real weight trend should guide future changes.</p><div className="recommendation-grid"><div><span>Calories</span><strong>{recommendations.calories}</strong><small>kcal</small></div><div><span>Protein</span><strong>{recommendations.protein}</strong><small>g</small></div><div><span>Carbs</span><strong>{recommendations.carbs}</strong><small>g</small></div><div><span>Fat</span><strong>{recommendations.fat}</strong><small>g</small></div></div><button className="primary-button full" type="button" onClick={() => { setDraft((current) => ({ ...current, calorieTarget: recommendations.calories, proteinTarget: recommendations.protein, carbTarget: recommendations.carbs, fatTarget: recommendations.fat })); setRecommendOpen(false); }}><Check size={18} /> Apply to unsaved settings</button><button className="text-button centered" type="button" onClick={() => setRecommendOpen(false)}>Keep my current targets</button></div>
    </Modal>
  </div>;
}
