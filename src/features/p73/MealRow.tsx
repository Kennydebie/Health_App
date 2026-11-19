import { useState } from 'react';
import { Check, ChevronDown, Lock, Undo2 } from 'lucide-react';
import { FoodImage } from '../../components/FoodImage';
import { Modal } from '../../components/Modal';
import type { AppController } from '../../state/useAppData';
import type { PlannedMeal } from '../../types/project73';
import { markMealEaten, markMealReplaced, markMealSkipped, resetMealStatus } from '../../lib/project73/actions';
import { mealDetails } from '../../lib/project73/selectors';
import { SLOT_LABELS } from '../../lib/project73/mealPlanner';
import { nlNumber } from '../../lib/project73/format';

function statusLabel(meal: PlannedMeal) {
  if (meal.status === 'eaten') return meal.eatenFactor === 0.5 ? 'Half gegeten' : (meal.eatenFactor ?? 1) > 1 ? 'Grotere portie' : 'Gegeten';
  if (meal.status === 'skipped') return 'Overgeslagen';
  if (meal.status === 'replaced') return 'Iets anders gegeten';
  return null;
}

export function EatenControls({ meal, controller, compact = false }: { meal: PlannedMeal; controller: AppController; compact?: boolean }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [note, setNote] = useState('');
  const [estimateKcal, setEstimateKcal] = useState('');
  const [estimateProtein, setEstimateProtein] = useState('');
  const label = statusLabel(meal);
  if (label) {
    return <div className="meal-row__actions"><span className={`pill ${meal.status === 'eaten' ? 'good' : meal.status === 'skipped' ? '' : 'info'}`}>{meal.status === 'eaten' ? <Check size={13} /> : null}{label}</span><button type="button" className="p73-btn ghost small" onClick={() => controller.apply(resetMealStatus(meal.id))} aria-label="Ongedaan maken"><Undo2 size={15} />{compact ? null : 'Herstel'}</button></div>;
  }
  return (
    <div className="meal-row__actions" style={{ position: 'relative' }}>
      <button type="button" className="p73-btn primary small" onClick={() => controller.apply(markMealEaten(meal.id, 1))}><Check size={15} />Gegeten</button>
      <button type="button" className="p73-btn secondary small icon" aria-label="Andere portie of overgeslagen" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}><ChevronDown size={16} /></button>
      {menuOpen ? (
        <div className="p73-card" role="menu" style={{ position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 30, padding: 6, display: 'grid', gap: 2, minWidth: 190 }} onMouseLeave={() => setMenuOpen(false)}>
          {[
            ['Half gegeten', () => controller.apply(markMealEaten(meal.id, 0.5))],
            ['Grotere portie (+25%)', () => controller.apply(markMealEaten(meal.id, 1.25))],
            ['Overgeslagen', () => controller.apply(markMealSkipped(meal.id))],
            ['Iets anders gegeten…', () => setReplaceOpen(true)],
          ].map(([text, action]) => <button key={text as string} type="button" role="menuitem" className="p73-btn ghost small" style={{ justifyContent: 'flex-start' }} onClick={() => { (action as () => void)(); setMenuOpen(false); }}>{text as string}</button>)}
        </div>
      ) : null}
      <Modal open={replaceOpen} onClose={() => setReplaceOpen(false)} title="Iets anders gegeten" subtitle="Optioneel: een schatting helpt je weekoverzicht. Het blijft gemarkeerd als eigen schatting." size="small"
        footer={<><button type="button" className="p73-btn secondary" onClick={() => setReplaceOpen(false)}>Annuleren</button><button type="button" className="p73-btn primary" onClick={() => {
          const kcalValue = Number(estimateKcal.replace(',', '.'));
          const proteinValue = Number(estimateProtein.replace(',', '.'));
          controller.apply(markMealReplaced(meal.id, note, kcalValue > 0 ? { kcal: kcalValue, protein: proteinValue > 0 ? proteinValue : 0 } : undefined));
          setReplaceOpen(false);
        }}>Opslaan</button></>}>
        <div className="p73-form">
          <label className="p73-field">Wat at je?<input value={note} maxLength={120} onChange={(event) => setNote(event.target.value)} placeholder="Bijv. broodje kaas op het werk" /></label>
          <div className="p73-fields">
            <label className="p73-field">Calorieën (schatting)<input inputMode="numeric" value={estimateKcal} onChange={(event) => setEstimateKcal(event.target.value)} placeholder="Leeg laten mag" /></label>
            <label className="p73-field">Eiwit in g (schatting)<input inputMode="numeric" value={estimateProtein} onChange={(event) => setEstimateProtein(event.target.value)} placeholder="Leeg laten mag" /></label>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export function MealRow({ meal, controller, onOpen }: { meal: PlannedMeal; controller: AppController; onOpen?: () => void }) {
  const details = mealDetails(controller.data, meal);
  if (!details) return null;
  const done = meal.status !== 'planned';
  return (
    <div className={`meal-row${done ? ' done' : ''}`}>
      <FoodImage src={details.recipe.image ?? ''} alt={details.recipe.name} />
      <button type="button" className="meal-row__body" style={{ border: 0, background: 'none', padding: 0, textAlign: 'left', color: 'inherit', cursor: onOpen ? 'pointer' : 'default' }} onClick={onOpen}>
        <span className="meal-row__slot">{SLOT_LABELS[meal.slot]}{meal.leftoverOfMealId ? ' · restje' : ''}{meal.locked ? <> · <Lock size={10} /></> : null}</span>
        <span className="meal-row__name">{details.recipe.name}</span>
        <span className="meal-row__meta">{nlNumber(details.nutrition.totals.kcal)} kcal · {nlNumber(details.nutrition.totals.protein)} g eiwit · {meal.leftoverOfMealId ? '0' : details.recipe.prepMinutes} min</span>
      </button>
      <EatenControls meal={meal} controller={controller} compact />
    </div>
  );
}
