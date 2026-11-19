import { useEffect, useMemo, useState } from 'react';
import { Check, Info, RefreshCw, Scale, Settings2, Target } from 'lucide-react';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Modal } from '../components/Modal';
import { formatMeasurementDate, sortedMeasurements } from '../lib/bodyMeasurements';
import { toDateKey } from '../lib/date';
import {
  countConfirmedWeeks,
  createWeightLossPlan,
  latestPlanComparison,
  planChartSeries,
  planWeeks,
  type PlanChartMetric,
  type PlanChartPoint,
} from '../lib/weightLossPlan';
import type { AppController } from '../state/useAppData';
import type { BodyMeasurement, WeightLossPlan } from '../types/models';

const STATUS_NL: Record<string, string> = { 'On track': 'Op schema', 'Slower than target': 'Langzamer dan gepland', 'Faster than target': 'Sneller dan gepland', 'Not enough data': 'Te weinig gegevens' };

interface Props { controller: AppController; }
type Timeframe = '12w' | '6m' | 'full';

const METRICS: Array<{ id: PlanChartMetric; label: string; unit: string }> = [
  { id: 'weightKg', label: 'Gewicht', unit: 'kg' },
  { id: 'bodyFatPercent', label: 'Vetpercentage', unit: '%' },
  { id: 'fatMassKg', label: 'Vetmassa', unit: 'kg' },
  { id: 'fatFreeMassKg', label: 'Vetvrije massa', unit: 'kg' },
  { id: 'muscleMassKg', label: 'Spiermassa', unit: 'kg' },
];

const shortDate = (date: string) => new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${date.slice(0, 10)}T00:00:00Z`));
const longDate = (date: string) => new Intl.DateTimeFormat('en', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));

function planPreview(plan: WeightLossPlan, baseline: BodyMeasurement, weeklyRatePct: number) {
  return createWeightLossPlan({
    id: plan.id,
    measurement: baseline,
    goalWeightKg: plan.goalWeightKg,
    weeklyRatePct,
    planStartDate: plan.planStartDate,
    version: plan.version,
    now: plan.updatedAt,
  });
}

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ payload: ChartDatum }>;
  metric: PlanChartMetric;
}

interface ChartDatum extends PlanChartPoint {
  actualDisplay: number | null;
  targetPast: number | null;
  targetFuture: number | null;
}

function PlanTooltip({ active, payload, metric }: TooltipProps) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  const meta = METRICS.find((item) => item.id === metric)!;
  const target = point.target ?? point.maintenanceTarget;
  return <div className="plan-chart-tooltip">
    <strong>Week {point.weekNumber} · {longDate(point.date)}</strong>
    <span><i className="actual" />Actual <b>{point.actual == null ? 'Geen meting' : `${point.actual.toFixed(1)} ${meta.unit}`}</b></span>
    <span><i className="target" />{point.maintenanceTarget == null ? 'Doellijn' : 'Onderhoudsdoel'} <b>{target == null ? '—' : `${target.toFixed(1)} ${meta.unit}`}</b></span>
    {point.difference == null ? null : <span>Difference <b>{point.difference > 0 ? '+' : ''}{point.difference.toFixed(1)} {meta.unit}</b></span>}
    <span>Status <b>{STATUS_NL[point.status] ?? point.status}</b></span>
    <small>{point.readingCount} confirmed {point.readingCount === 1 ? 'reading' : 'readings'} in this week</small>
  </div>;
}

function yDomain(values: Array<number | null>, unit: string) {
  const numbers = values.filter((value): value is number => value != null);
  if (!numbers.length) return [0, 1] as [number, number];
  const min = Math.min(...numbers);
  const max = Math.max(...numbers);
  const padding = Math.max(unit === '%' ? 1 : 0.8, (max - min) * 0.12);
  return [Math.floor((min - padding) * 10) / 10, Math.ceil((max + padding) * 10) / 10] as [number, number];
}

export function WeightProgressPlan({ controller }: Props) {
  const { data, saveWeightLossPlan } = controller;
  const confirmed = useMemo(() => sortedMeasurements(data.measurements).filter((item) => item.weightKg != null), [data.measurements]);
  const latestMeasurement = confirmed.at(-1);
  const firstMeasurement = confirmed[0];
  const activePlan = data.weightLossPlans.at(-1);
  const activeBaseline = activePlan ? confirmed.find((item) => item.id === activePlan.baselineMeasurementId) : undefined;
  const today = toDateKey();
  const [metric, setMetric] = useState<PlanChartMetric>('weightKg');
  const [timeframe, setTimeframe] = useState<Timeframe>('full');
  const [draftRate, setDraftRate] = useState(activePlan?.weeklyRatePct ?? 0.8);
  const [startChoice, setStartChoice] = useState<'baseline' | 'today'>('baseline');
  const [updateOpen, setUpdateOpen] = useState(false);

  useEffect(() => {
    if (!activePlan && firstMeasurement?.measuredAt?.slice(0, 10) === today) saveWeightLossPlan(firstMeasurement.id, 0.8, today);
  }, [activePlan, firstMeasurement, saveWeightLossPlan, today]);

  const previewPlan = useMemo(
    () => activePlan && activeBaseline ? planPreview(activePlan, activeBaseline, draftRate) : activePlan,
    [activeBaseline, activePlan, draftRate],
  );
  const allSeries = useMemo(() => previewPlan ? planChartSeries(previewPlan, data.measurements, metric) : [], [data.measurements, metric, previewPlan]);
  const visibleSeries = useMemo(() => {
    if (timeframe === 'full' || allSeries.length <= (timeframe === '12w' ? 13 : 27)) return allSeries;
    const todayIndex = allSeries.reduce((latest, point, index) => point.date <= today ? index : latest, 0);
    const length = timeframe === '12w' ? 13 : 27;
    const start = Math.max(0, Math.min(allSeries.length - length, todayIndex - 3));
    return allSeries.slice(start, start + length);
  }, [allSeries, timeframe, today]);
  const chartData = useMemo<ChartDatum[]>(() => {
    const firstFuture = visibleSeries.findIndex((point) => point.date > today);
    return visibleSeries.map((point, index) => ({
      ...point,
      actualDisplay: point.actual,
      targetPast: point.date <= today ? point.target : null,
      targetFuture: point.target != null && (point.date > today || index === firstFuture - 1) ? point.target : null,
    }));
  }, [visibleSeries, today]);
  const meta = METRICS.find((item) => item.id === metric)!;
  const weeklyCount = countConfirmedWeeks(data.measurements);
  const comparison = latestPlanComparison(allSeries, today);
  const yValues = chartData.flatMap((point) => [point.actual, point.target, point.maintenanceTarget]);
  const [yMin, yMax] = yDomain(yValues, meta.unit);
  const todayMarker = chartData.filter((point) => point.date <= today).at(-1)?.date;
  const planDuration = previewPlan ? planWeeks(previewPlan.baselineWeightKg, previewPlan.goalWeightKg, previewPlan.weeklyRatePct) : 0;
  const fasterRecent = allSeries.filter((point) => point.actual != null).slice(-3);
  const summary = weeklyCount < 2
    ? 'Nog te weinig gegevens om te vergelijken.'
    : fasterRecent.length === 3 && fasterRecent.every((point) => point.status === 'Faster than target')
      ? 'Je valt de laatste weken sneller af dan gepland. Let op je voeding, energie en herstel.'
      : comparison?.status ? STATUS_NL[comparison.status] ?? comparison.status : 'Nog te weinig gegevens om te vergelijken.';

  if (!firstMeasurement) return <section className="card weight-plan-empty"><Scale size={30} /><div><h2>Gewichtsverloop</h2><p>Voeg je eerste meting toe om een doellijn te maken.</p></div></section>;

  if (!activePlan || !activeBaseline || !previewPlan) {
    const baselineDate = firstMeasurement.measuredAt?.slice(0, 10) ?? today;
    const historical = baselineDate < today;
    return <section className="card weight-plan-setup">
      <div><Scale size={28} /><h2>Afvalplan</h2><p>Your confirmed baseline is {firstMeasurement.weightKg?.toFixed(1)} kg from {formatMeasurementDate(firstMeasurement.measuredAt, false)}.</p></div>
      {historical ? <fieldset><legend>Kies wanneer het plan start</legend><label><input type="radio" checked={startChoice === 'baseline'} onChange={() => setStartChoice('baseline')} /> Datum startmeting</label><label><input type="radio" checked={startChoice === 'today'} onChange={() => setStartChoice('today')} /> Today</label></fieldset> : null}
      <p className="plan-disclaimer">Het gekozen tempo is een planningsdoel. Je echte gewicht schommelt per week.</p>
      <button type="button" className="primary-button" onClick={() => saveWeightLossPlan(firstMeasurement.id, 0.8, startChoice === 'today' ? today : baselineDate)}><Target size={17} /> Doellijn maken</button>
    </section>;
  }

  const targetLabel = metric === 'fatFreeMassKg' || metric === 'muscleMassKg' ? 'Onderhoudsdoel' : 'Doellijn';
  const currentWeight = latestMeasurement?.weightKg ?? activePlan.baselineWeightKg;
  const unsavedPreview = Math.abs(draftRate - activePlan.weeklyRatePct) > 0.001;
  const updatePreview = latestMeasurement && latestMeasurement.id !== activePlan.baselineMeasurementId
    ? createWeightLossPlan({ id: 'preview', measurement: latestMeasurement, goalWeightKg: data.profile.goalWeightKg, weeklyRatePct: draftRate, planStartDate: latestMeasurement.measuredAt?.slice(0, 10) ?? today, version: activePlan.version + 1, now: new Date().toISOString() })
    : null;

  return <>
    <section className="card weight-plan-card">
      <header className="weight-plan-heading"><div><p className="eyebrow">Doel vs. werkelijk</p><h2>Gewichtsverloop</h2><p>Bevestigde metingen staan los van je berekende doellijn.</p></div><details className="weight-plan-settings"><summary><Settings2 size={16} /> Afvalplan</summary><div><label>Doeltempo <span><input type="number" min="0.1" max="2" step="0.1" value={draftRate} onChange={(event) => setDraftRate(Math.max(0.1, Math.min(2, Number(event.target.value))))} /> % per week</span></label><dl><div><dt>Geschat verlies per week</dt><dd>{(currentWeight * draftRate / 100).toFixed(2)} kg</dd></div><div><dt>Geschatte duur</dt><dd>About {planDuration} weeks</dd></div><div><dt>Geschatte doeldatum</dt><dd>{longDate(previewPlan.estimatedTargetDate)}</dd></div></dl><p>Het gekozen tempo is een planningsdoel. Je echte gewicht schommelt.</p><button type="button" className="secondary-button" disabled={!unsavedPreview} onClick={() => saveWeightLossPlan(activePlan.baselineMeasurementId, draftRate, activePlan.planStartDate)}><Check size={16} /> Doeltempo opslaan</button></div></details></header>

      <div className="weight-plan-summary" aria-label="Samenvatting afvalplan">
        <span><small>Current</small><strong>{currentWeight.toFixed(1)} kg</strong></span>
        <span><small>Goal</small><strong>{activePlan.goalWeightKg.toFixed(1)} kg</strong></span>
        <span><small>Doeltempo</small><strong>{draftRate.toFixed(1)}% / week</strong></span>
        <span><small>Geschatte duur</small><strong>About {planDuration} weeks</strong></span>
        <span><small>Verschil met doel</small><strong>{weeklyCount < 2 || comparison?.difference == null ? 'Wacht op de volgende weekmeting' : `${comparison.difference > 0 ? '+' : ''}${comparison.difference.toFixed(1)} kg`}</strong></span>
        <span><small>Laatste meting</small><strong>{latestMeasurement?.measuredAt ? shortDate(latestMeasurement.measuredAt) : '—'}</strong></span>
      </div>

      <div className="plan-chart-toolbar"><div className="plan-metric-tabs" role="tablist" aria-label="Meetwaarde">{METRICS.map((item) => <button type="button" role="tab" aria-selected={metric === item.id} className={metric === item.id ? 'active' : ''} onClick={() => setMetric(item.id)} key={item.id}>{item.label}</button>)}</div><div className="plan-timeframes" aria-label="Periode">{([['12w', '12 weeks'], ['6m', '6 months'], ['full', 'Full plan']] as const).map(([id, label]) => <button type="button" className={timeframe === id ? 'active' : ''} onClick={() => setTimeframe(id)} key={id}>{label}</button>)}</div></div>
      {unsavedPreview ? <div className="plan-preview-note"><Info size={15} /> Previewing an unsaved {draftRate.toFixed(1)}% weekly target rate.</div> : null}
      <div className="weight-plan-chart" role="img" aria-label={`Grafiek ${meta.label}. Bevestigde weekmedianen en ${targetLabel.toLowerCase()}.`}>
        <ResponsiveContainer width="100%" height="100%"><LineChart data={chartData} margin={{ top: 24, right: 28, left: 2, bottom: 8 }}><CartesianGrid stroke="rgba(139,161,171,.13)" vertical={false}/><XAxis dataKey="date" tickFormatter={shortDate} stroke="#778991" tickLine={false} axisLine={false} minTickGap={34}/><YAxis domain={[yMin, yMax]} tickFormatter={(value) => `${Number(value).toFixed(meta.unit === '%' ? 0 : 1)}${meta.unit}`} stroke="#778991" tickLine={false} axisLine={false} width={64}/><Tooltip content={<PlanTooltip metric={metric} />} allowEscapeViewBox={{ x: false, y: false }} wrapperStyle={{ outline: 'none', maxWidth: 'min(280px, calc(100vw - 28px))' }}/>{chartData.some((point) => point.date === activePlan.planStartDate) ? <ReferenceLine x={activePlan.planStartDate} stroke="#f08a78" strokeOpacity={.5} strokeDasharray="3 5" label={{ value: 'Start', fill: '#f0a394', position: 'insideTopRight' }}/> : null}{metric === 'weightKg' ? <ReferenceLine y={activePlan.goalWeightKg} stroke="#67cbb2" strokeDasharray="4 5" label={{ value: 'Doel', fill: '#67cbb2', position: 'insideTopRight' }}/> : null}{todayMarker && todayMarker !== activePlan.planStartDate && chartData.some((point) => point.date > today) ? <ReferenceLine x={todayMarker} stroke="#889aa1" strokeDasharray="2 5" label={{ value: 'Vandaag', fill: '#a4b1b6', position: 'insideTopLeft' }}/> : null}<Line type="linear" connectNulls={false} dataKey="actualDisplay" name="Werkelijk" stroke="#63b3ed" strokeWidth={3} dot={{ r: 4, fill: '#101a20', stroke: '#63b3ed', strokeWidth: 2 }} activeDot={{ r: 6 }} isAnimationActive={false}/>{targetLabel === 'Doellijn' ? <><Line type="monotone" connectNulls dataKey="targetPast" name="Doellijn" stroke="#f08a78" strokeWidth={2.2} strokeDasharray="7 6" dot={false} isAnimationActive={false}/><Line type="monotone" connectNulls dataKey="targetFuture" name="Doellijn" stroke="#f08a78" strokeOpacity={.45} strokeWidth={2.2} strokeDasharray="7 6" dot={false} isAnimationActive={false}/></> : <Line type="monotone" connectNulls dataKey="maintenanceTarget" name="Onderhoudsdoel" stroke="#efb44c" strokeWidth={2} strokeDasharray="7 6" dot={false} isAnimationActive={false}/>}</LineChart></ResponsiveContainer>
      </div>
      <div className="plan-chart-legend"><span><i className="actual" />Actual</span><span><i className="target" />{targetLabel}</span>{metric === 'weightKg' ? <span><i className="goal" />Goal</span> : null}<small>Punten zijn de weekmediaan. Weken zonder meting blijven leeg.</small></div>
      <div className={`plan-comparison-summary ${summary.startsWith('Je recente tempo') ? 'caution' : ''}`}><Info size={17} /><div><strong>{summary}</strong><span>{weeklyCount < 2 ? 'Baseline set. Your target path is ready. Add another weekly measurement to start comparing progress.' : 'The main comparison becomes more useful across a three- or four-week trend.'}</span></div></div>
      {metric === 'bodyFatPercent' || metric === 'fatMassKg' ? <p className="composition-projection-note">Body-fat projections assume your estimated fat-free mass remains around {activePlan.baselineFatFreeMassKg?.toFixed(1) ?? '—'} kg. Smart-scale body-composition readings can fluctuate, so focus on the longer-term trend.</p> : null}
      {latestMeasurement?.id !== activePlan.baselineMeasurementId ? <button type="button" className="text-button update-plan-button" onClick={() => setUpdateOpen(true)}><RefreshCw size={15} /> Plan bijwerken vanaf laatste meting</button> : null}
    </section>

    {updateOpen && latestMeasurement && updatePreview ? <Modal open onClose={() => setUpdateOpen(false)} title="Plan bijwerken vanaf laatste meting" subtitle="Bekijk de nieuwe start voordat je een nieuwe planversie maakt." size="medium" footer={<><button type="button" className="text-button" onClick={() => setUpdateOpen(false)}>Cancel</button><button type="button" className="primary-button" onClick={() => { saveWeightLossPlan(latestMeasurement.id, draftRate, updatePreview.planStartDate); setUpdateOpen(false); }}><Check size={17} /> Create plan version {activePlan.version + 1}</button></>}><div className="update-plan-preview"><p><Info size={17} /> Je metingen blijven ongewijzigd. Alleen de toekomstige doellijn start vanaf je laatste bevestigde meting.</p><dl><div><dt>Nieuwe start</dt><dd>{latestMeasurement.weightKg?.toFixed(1)} kg</dd></div><div><dt>Start plan</dt><dd>{longDate(updatePreview.planStartDate)}</dd></div><div><dt>Doeltempo</dt><dd>{draftRate.toFixed(1)}% per week</dd></div><div><dt>Geschatte doeldatum</dt><dd>{longDate(updatePreview.estimatedTargetDate)}</dd></div></dl></div></Modal> : null}
  </>;
}
