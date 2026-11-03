import { useMemo, useState } from 'react';
import { Activity, ArrowRight, CalendarCheck, Check, ChevronDown, CircleGauge, Coffee, Dumbbell, Footprints, Pause, Play, Scale, ShieldCheck, Sparkles, Target } from 'lucide-react';
import { Modal } from '../components/Modal';
import { buildCoachingInputs, decideWeeklyCoach } from '../lib/coachingEngine';
import { prettyDate, toDateKey } from '../lib/date';
import type { AppController } from '../state/useAppData';
import type { PausePeriod, RecommendationFeedback, RecoveryFeedback } from '../types/models';

interface CoachPageProps { controller: AppController }

const recoveryDefaults: Omit<RecoveryFeedback, 'id' | 'date' | 'createdAt'> = {
  energy: 'normal', sleep: 'okay', soreness: 'moderate', hunger: 'manageable', motivation: 'normal',
};

const feedbackOptions: Array<{ value: RecommendationFeedback; label: string }> = [
  { value: 'useful', label: 'Nuttig' },
  { value: 'not_realistic', label: 'Niet haalbaar' },
  { value: 'incorrect_data', label: 'Gegevens kloppen niet' },
  { value: 'too_strict', label: 'Te streng' },
  { value: 'too_easy', label: 'Te makkelijk' },
];

function ConfidenceBadge({ value }: { value: ReturnType<typeof decideWeeklyCoach>['confidence'] }) {
  return <span className={`coach-confidence ${value}`}><ShieldCheck size={14} /> {value === 'insufficient' ? 'Meer gegevens nodig' : `betrouwbaarheid: ${({ high: 'hoog', moderate: 'redelijk', low: 'laag', insufficient: 'onvoldoende' } as Record<string, string>)[value] ?? value}`}</span>;
}

function EvidenceGrid({ evidence }: { evidence: ReturnType<typeof decideWeeklyCoach>['evidence'] }) {
  const icons = [Scale, CalendarCheck, Target, Dumbbell];
  return <div className="coach-evidence-grid">{evidence.map((item, index) => {
    const Icon = icons[index] ?? CircleGauge;
    return <article key={item.label}><Icon size={17} /><div><span>{item.label}</span><strong>{item.value}</strong>{item.detail ? <small>{item.detail}</small> : null}</div></article>;
  })}</div>;
}

export function CoachPage({ controller }: CoachPageProps) {
  const { data } = controller;
  const today = toDateKey();
  const [checkInOpen, setCheckInOpen] = useState(false);
  const [pauseOpen, setPauseOpen] = useState(false);
  const [whyOpen, setWhyOpen] = useState(true);
  const [recovery, setRecovery] = useState(recoveryDefaults);
  const [pauseType, setPauseType] = useState<PausePeriod['type']>('traveling');
  const [pauseNote, setPauseNote] = useState('');
  const [steps, setSteps] = useState(() => String(data.activityLog.find((item) => item.date === today)?.steps ?? ''));
  const decision = useMemo(() => decideWeeklyCoach(data, today), [data, today]);
  const inputs = useMemo(() => buildCoachingInputs(data, today), [data, today]);
  const latest = useMemo(() => [...data.coachRecommendations].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null, [data.coachRecommendations]);
  const activePause = useMemo(() => [...data.pausePeriods].reverse().find((item) => item.startDate <= today && (!item.endDate || item.endDate >= today)) ?? null, [data.pausePeriods, today]);
  const shown = latest ?? { ...decision, periodStart: inputs.periodStart, periodEnd: inputs.periodEnd, status: 'pending' as const, id: '' };
  const reviewedCurrentPeriod = latest?.periodEnd === today;

  const submitCheckIn = () => {
    controller.completeWeeklyCheckIn(today, recovery);
    setCheckInOpen(false);
  };

  return <div className="page coach-page">
    <header className="page-header coach-header">
      <div><p className="eyebrow">Adaptieve coach</p><h1>Weekcheck</h1><p>Eén onderbouwde beslissing tegelijk: kracht beschermen terwijl je vetpercentage daalt.</p></div>
      <button type="button" className="primary-button" onClick={() => setCheckInOpen(true)}><CalendarCheck size={18} /> {reviewedCurrentPeriod ? 'Check-in vernieuwen' : 'Check-in afronden'}</button>
    </header>

    {activePause ? <section className="coach-pause-banner"><Coffee size={22} /><div><strong>Beoordeling staat op pauze</strong><p>{activePause.type.replace('_', ' ')} since {prettyDate(activePause.startDate)}. No plateau or calorie-reduction decision will be made during this period.</p></div><button type="button" className="secondary-button" onClick={() => controller.resumePlan(today)}><Play size={16} /> Plan hervatten</button></section> : null}

    <section className="coach-decision card">
      <div className="coach-decision__top">
        <div><p className="eyebrow">{reviewedCurrentPeriod ? `Beoordeeld op ${prettyDate(latest!.periodEnd)}` : 'Voorbeeld · rond de check-in af om op te slaan'}</p><h2>{shown.title}</h2><p>{shown.explanation}</p></div>
        <ConfidenceBadge value={shown.confidence} />
      </div>
      <div className="coach-primary-action"><Sparkles size={21} /><div><span>Advies</span><strong>{shown.primaryAction}</strong></div></div>

      <button type="button" className="coach-why-toggle" aria-expanded={whyOpen} onClick={() => setWhyOpen((value) => !value)}><span>Waarom dit advies?</span><ChevronDown size={18} /></button>
      {whyOpen ? <div className="coach-why"><EvidenceGrid evidence={shown.evidence} />{decision.missingDataRequirements.length ? <p className="coach-missing"><CircleGauge size={15} /> Better confidence needs {decision.missingDataRequirements.join(' and ')}.</p> : null}</div> : null}

      {reviewedCurrentPeriod && latest?.status === 'pending' ? <div className="coach-decision-actions">
        {latest.conclusion === 'goal_reached' ? <button type="button" className="primary-button" onClick={() => { controller.startMaintenancePhase(); controller.respondRecommendation(latest.id, 'applied'); }}><Check size={17} /> Start onderhoudsfase</button> : latest.proposedChange ? <button type="button" className="primary-button" onClick={() => controller.respondRecommendation(latest.id, 'applied', 'primary')}><Check size={17} /> Apply: {String(latest.proposedChange.proposedValue)}</button> : <button type="button" className="primary-button" onClick={() => controller.respondRecommendation(latest.id, 'kept_current')}><Check size={17} /> Huidig plan houden</button>}
        {latest.alternativeChange ? <button type="button" className="secondary-button" onClick={() => controller.respondRecommendation(latest.id, 'applied', 'alternative')}><Footprints size={17} /> Choose {latest.alternativeChange.proposedValue} steps</button> : null}
        {latest.proposedChange ? <button type="button" className="secondary-button" onClick={() => controller.respondRecommendation(latest.id, 'kept_current')}>Huidig plan houden</button> : null}
        <button type="button" className="text-button" onClick={() => controller.respondRecommendation(latest.id, 'review_later')}>Later bekijken <ArrowRight size={15} /></button>
      </div> : null}
      {reviewedCurrentPeriod && latest?.status !== 'pending' ? <div className="coach-response-state"><Check size={17} /><span>{latest?.status === 'applied' ? 'Aanpassing doorgevoerd en ingepland voor controle' : latest?.status === 'review_later' ? 'Bewaard om later te bekijken' : 'Huidig plan ongewijzigd'}</span></div> : null}
    </section>

    <section className="coach-signal-grid">
      <article className="card coach-signal"><Scale size={20} /><span>7-daags gemiddelde</span><strong>{inputs.currentWeightAverage == null ? 'Wegingen nodig' : `${inputs.currentWeightAverage.toFixed(1)} kg`}</strong><small>{inputs.weeklyChangeKg == null ? 'Vorige week onbekend' : `${inputs.weeklyChangeKg > 0 ? '+' : ''}${inputs.weeklyChangeKg.toFixed(2)} kg t.o.v. vorige week`}</small></article>
      <article className="card coach-signal"><Target size={20} /><span>Betrouwbare voedingsdagen</span><strong>{inputs.completeNutritionDays} / 7</strong><small>{inputs.averageProtein == null ? 'Rond dagen af voor een gemiddelde' : `${Math.round(inputs.averageProtein)} g eiwit gemiddeld`}</small></article>
      <article className="card coach-signal"><Dumbbell size={20} /><span>Krachttrainingen</span><strong>{inputs.completedWorkouts} / {inputs.plannedWorkouts}</strong><small>Performance is {inputs.overallStrength.replaceAll('_', ' ')}</small></article>
      <article className="card coach-signal"><Footprints size={20} /><span>Gem. stappen</span><strong>{inputs.averageSteps == null ? 'Niet gelogd' : Math.round(inputs.averageSteps).toLocaleString()}</strong><small>Current goal: {data.coachingSettings.dailyStepGoal.toLocaleString()} per day</small></article>
    </section>

    <section className="coach-controls card">
      <div><Activity size={19} /><div><strong>Herstel en het echte leven tellen mee</strong><p>Reizen, ziekte of een herstelweek pauzeren de beoordeling; ze zijn geen reden om strenger te worden.</p></div></div>
      <button type="button" className="secondary-button" onClick={() => setPauseOpen(true)}><Pause size={16} /> Beoordeling pauzeren</button>
    </section>

    <form className="coach-step-log card" onSubmit={(event) => { event.preventDefault(); if (Number.isFinite(Number(steps)) && Number(steps) >= 0) controller.logSteps(today, Number(steps)); }}><div><Footprints size={19} /><div><strong>Stappen vandaag</strong><p>Lichte activiteit wordt los van calorieën bijgehouden. Calorieën van beweging worden nooit automatisch bij je doel opgeteld.</p></div></div><label><span className="sr-only">Stappen vandaag</span><input type="number" min="0" max="100000" step="100" value={steps} onChange={(event) => setSteps(event.target.value)} placeholder="8,000" /></label><button type="submit" className="secondary-button" disabled={!steps}>Stappen opslaan</button></form>

    {latest && latest.status !== 'pending' ? <section className="coach-feedback card"><div><p className="eyebrow">Feedback</p><h2>Was dit advies nuttig?</h2></div><div>{feedbackOptions.map((option) => <button type="button" key={option.value} className={latest.feedback === option.value ? 'selected' : ''} onClick={() => controller.setRecommendationFeedback(latest.id, option.value)}>{option.label}</button>)}</div></section> : null}

    <Modal open={checkInOpen} onClose={() => setCheckInOpen(false)} title="Weekcheck invullen" subtitle="Vijf korte herstelsignalen helpen je kracht te beschermen en te strenge aanpassingen te voorkomen." footer={<><button type="button" className="secondary-button" onClick={() => setCheckInOpen(false)}>Cancel</button><button type="button" className="primary-button" onClick={submitCheckIn}>Analyseer deze week</button></>}>
      <div className="coach-checkin-form">
        <label>Energy<select value={recovery.energy} onChange={(event) => setRecovery((value) => ({ ...value, energy: event.target.value as typeof value.energy }))}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option></select></label>
        <label>Sleep<select value={recovery.sleep} onChange={(event) => setRecovery((value) => ({ ...value, sleep: event.target.value as typeof value.sleep }))}><option value="poor">Poor</option><option value="okay">Okay</option><option value="good">Good</option></select></label>
        <label>Soreness<select value={recovery.soreness} onChange={(event) => setRecovery((value) => ({ ...value, soreness: event.target.value as typeof value.soreness }))}><option value="low">Low</option><option value="moderate">Moderate</option><option value="high">High</option></select></label>
        <label>Hunger<select value={recovery.hunger} onChange={(event) => setRecovery((value) => ({ ...value, hunger: event.target.value as typeof value.hunger }))}><option value="low">Low</option><option value="manageable">Manageable</option><option value="high">High</option></select></label>
        <label>Motivation<select value={recovery.motivation} onChange={(event) => setRecovery((value) => ({ ...value, motivation: event.target.value as typeof value.motivation }))}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option></select></label>
      </div>
    </Modal>

    <Modal open={pauseOpen} onClose={() => setPauseOpen(false)} title="Trendbeoordeling pauzeren" subtitle="Je gegevens blijven bewaard. De coach beoordeelt alleen even geen plateaus tot je hervat." footer={<><button type="button" className="secondary-button" onClick={() => setPauseOpen(false)}>Cancel</button><button type="button" className="primary-button" onClick={() => { controller.startPause({ type: pauseType, startDate: today, note: pauseNote.trim() || undefined }); setPauseOpen(false); }}>Plan pauzeren</button></>}>
      <div className="coach-pause-form"><label>Reason<select value={pauseType} onChange={(event) => setPauseType(event.target.value as PausePeriod['type'])}><option value="traveling">Traveling</option><option value="sick">Sick</option><option value="recovery_week">Herstelweek</option><option value="maintenance_break">Onderhoudspauze</option><option value="paused">Andere pauze</option></select></label><label>Notitie (optioneel)<textarea value={pauseNote} onChange={(event) => setPauseNote(event.target.value)} maxLength={240} placeholder="Iets om later te onthouden?" /></label></div>
    </Modal>
  </div>;
}
