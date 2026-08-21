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

interface Props { controller: AppController; }
type Timeframe = '12w' | '6m' | 'full';

const METRICS: Array<{ id: PlanChartMetric; label: string; unit: string }> = [
  { id: 'weightKg', label: 'Weight', unit: 'kg' },
  { id: 'bodyFatPercent', label: 'Body fat', unit: '%' },
  { id: 'fatMassKg', label: 'Fat mass', unit: 'kg' },
  { id: 'fatFreeMassKg', label: 'Fat-free mass', unit: 'kg' },
  { id: 'muscleMassKg', label: 'Muscle mass', unit: 'kg' },
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
    <span><i className="actual" />Actual <b>{point.actual == null ? 'No reading' : `${point.actual.toFixed(1)} ${meta.unit}`}</b></span>
    <span><i className="target" />{point.maintenanceTarget == null ? 'Target path' : 'Maintenance target'} <b>{target == null ? '—' : `${target.toFixed(1)} ${meta.unit}`}</b></span>
    {point.difference == null ? null : <span>Difference <b>{point.difference > 0 ? '+' : ''}{point.difference.toFixed(1)} {meta.unit}</b></span>}
    <span>Status <b>{point.status}</b></span>
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
    ? 'Not enough data to compare yet.'
    : fasterRecent.length === 3 && fasterRecent.every((point) => point.status === 'Faster than target')
      ? 'Your recent pace is faster than your plan. Check that your nutrition, energy and recovery remain manageable.'
      : comparison?.status ?? 'Not enough data to compare yet.';

  if (!firstMeasurement) return <section className="card weight-plan-empty"><Scale size={30} /><div><h2>Weight progress</h2><p>Add your first measurement to create a target path.</p></div></section>;

  if (!activePlan || !activeBaseline || !previewPlan) {
    const baselineDate = firstMeasurement.measuredAt?.slice(0, 10) ?? today;
    const historical = baselineDate < today;
    return <section className="card weight-plan-setup">
      <div><Scale size={28} /><h2>Weight-loss plan</h2><p>Your confirmed baseline is {firstMeasurement.weightKg?.toFixed(1)} kg from {formatMeasurementDate(firstMeasurement.measuredAt, false)}.</p></div>
      {historical ? <fieldset><legend>Choose when the plan starts</legend><label><input type="radio" checked={startChoice === 'baseline'} onChange={() => setStartChoice('baseline')} /> Baseline measurement date</label><label><input type="radio" checked={startChoice === 'today'} onChange={() => setStartChoice('today')} /> Today</label></fieldset> : null}
      <p className="plan-disclaimer">The selected pace is a planning target. Real weight can fluctuate from week to week.</p>
      <button type="button" className="primary-button" onClick={() => saveWeightLossPlan(firstMeasurement.id, 0.8, startChoice === 'today' ? today : baselineDate)}><Target size={17} /> Create target path</button>
    </section>;
  }

  const targetLabel = metric === 'fatFreeMassKg' || metric === 'muscleMassKg' ? 'Maintenance target' : 'Target path';
  const currentWeight = latestMeasurement?.weightKg ?? activePlan.baselineWeightKg;
  const unsavedPreview = Math.abs(draftRate - activePlan.weeklyRatePct) > 0.001;
  const updatePreview = latestMeasurement && latestMeasurement.id !== activePlan.baselineMeasurementId
    ? createWeightLossPlan({ id: 'preview', measurement: latestMeasurement, goalWeightKg: data.profile.goalWeightKg, weeklyRatePct: draftRate, planStartDate: latestMeasurement.measuredAt?.slice(0, 10) ?? today, version: activePlan.version + 1, now: new Date().toISOString() })
    : null;

  return <>
    <section className="card weight-plan-card">
      <header className="weight-plan-heading"><div><p className="eyebrow">Target vs actual</p><h2>Weight progress</h2><p>Confirmed measurements are shown separately from your calculated target path.</p></div><details className="weight-plan-settings"><summary><Settings2 size={16} /> Weight-loss plan</summary><div><label>Target rate <span><input type="number" min="0.1" max="2" step="0.1" value={draftRate} onChange={(event) => setDraftRate(Math.max(0.1, Math.min(2, Number(event.target.value))))} /> % per week</span></label><dl><div><dt>Estimated weekly loss now</dt><dd>{(currentWeight * draftRate / 100).toFixed(2)} kg</dd></div><div><dt>Estimated duration</dt><dd>About {planDuration} weeks</dd></div><div><dt>Estimated target date</dt><dd>{longDate(previewPlan.estimatedTargetDate)}</dd></div></dl><p>The selected pace is a planning target. Real weight can fluctuate.</p><button type="button" className="secondary-button" disabled={!unsavedPreview} onClick={() => saveWeightLossPlan(activePlan.baselineMeasurementId, draftRate, activePlan.planStartDate)}><Check size={16} /> Save target rate</button></div></details></header>

      <div className="weight-plan-summary" aria-label="Weight-loss plan summary">
        <span><small>Current</small><strong>{currentWeight.toFixed(1)} kg</strong></span>
        <span><small>Goal</small><strong>{activePlan.goalWeightKg.toFixed(1)} kg</strong></span>
        <span><small>Target pace</small><strong>{draftRate.toFixed(1)}% / week</strong></span>
        <span><small>Estimated duration</small><strong>About {planDuration} weeks</strong></span>
        <span><small>Difference from target</small><strong>{weeklyCount < 2 || comparison?.difference == null ? 'Waiting for next weekly measurement' : `${comparison.difference > 0 ? '+' : ''}${comparison.difference.toFixed(1)} kg`}</strong></span>
        <span><small>Latest actual</small><strong>{latestMeasurement?.measuredAt ? shortDate(latestMeasurement.measuredAt) : '—'}</strong></span>
      </div>

      <div className="plan-chart-toolbar"><div className="plan-metric-tabs" role="tablist" aria-label="Progress metric">{METRICS.map((item) => <button type="button" role="tab" aria-selected={metric === item.id} className={metric === item.id ? 'active' : ''} onClick={() => setMetric(item.id)} key={item.id}>{item.label}</button>)}</div><div className="plan-timeframes" aria-label="Chart timeframe">{([['12w', '12 weeks'], ['6m', '6 months'], ['full', 'Full plan']] as const).map(([id, label]) => <button type="button" className={timeframe === id ? 'active' : ''} onClick={() => setTimeframe(id)} key={id}>{label}</button>)}</div></div>
      {unsavedPreview ? <div className="plan-preview-note"><Info size={15} /> Previewing an unsaved {draftRate.toFixed(1)}% weekly target rate.</div> : null}
      <div className="weight-plan-chart" role="img" aria-label={`${meta.label} chart. Actual confirmed weekly medians and ${targetLabel.toLowerCase()}.`}>
        <ResponsiveContainer width="100%" height="100%"><LineChart data={chartData} margin={{ top: 24, right: 28, left: 2, bottom: 8 }}><CartesianGrid stroke="rgba(139,161,171,.13)" vertical={false}/><XAxis dataKey="date" tickFormatter={shortDate} stroke="#778991" tickLine={false} axisLine={false} minTickGap={34}/><YAxis domain={[yMin, yMax]} tickFormatter={(value) => `${Number(value).toFixed(meta.unit === '%' ? 0 : 1)}${meta.unit}`} stroke="#778991" tickLine={false} axisLine={false} width={64}/><Tooltip content={<PlanTooltip metric={metric} />} allowEscapeViewBox={{ x: false, y: false }} wrapperStyle={{ outline: 'none', maxWidth: 'min(280px, calc(100vw - 28px))' }}/>{chartData.some((point) => point.date === activePlan.planStartDate) ? <ReferenceLine x={activePlan.planStartDate} stroke="#f08a78" strokeOpacity={.5} strokeDasharray="3 5" label={{ value: 'Baseline', fill: '#f0a394', position: 'insideTopRight' }}/> : null}{metric === 'weightKg' ? <ReferenceLine y={activePlan.goalWeightKg} stroke="#67cbb2" strokeDasharray="4 5" label={{ value: 'Goal', fill: '#67cbb2', position: 'insideTopRight' }}/> : null}{todayMarker && todayMarker !== activePlan.planStartDate && chartData.some((point) => point.date > today) ? <ReferenceLine x={todayMarker} stroke="#889aa1" strokeDasharray="2 5" label={{ value: 'Today', fill: '#a4b1b6', position: 'insideTopLeft' }}/> : null}<Line type="linear" connectNulls={false} dataKey="actualDisplay" name="Actual" stroke="#63b3ed" strokeWidth={3} dot={{ r: 4, fill: '#101a20', stroke: '#63b3ed', strokeWidth: 2 }} activeDot={{ r: 6 }} isAnimationActive={false}/>{targetLabel === 'Target path' ? <><Line type="monotone" connectNulls dataKey="targetPast" name="Target path" stroke="#f08a78" strokeWidth={2.2} strokeDasharray="7 6" dot={false} isAnimationActive={false}/><Line type="monotone" connectNulls dataKey="targetFuture" name="Target path" stroke="#f08a78" strokeOpacity={.45} strokeWidth={2.2} strokeDasharray="7 6" dot={false} isAnimationActive={false}/></> : <Line type="monotone" connectNulls dataKey="maintenanceTarget" name="Maintenance target" stroke="#efb44c" strokeWidth={2} strokeDasharray="7 6" dot={false} isAnimationActive={false}/>}</LineChart></ResponsiveContainer>
      </div>
      <div className="plan-chart-legend"><span><i className="actual" />Actual</span><span><i className="target" />{targetLabel}</span>{metric === 'weightKg' ? <span><i className="goal" />Goal</span> : null}<small>Actual points use the weekly median. Weeks without a measurement remain empty.</small></div>
      <div className={`plan-comparison-summary ${summary.startsWith('Your recent pace') ? 'caution' : ''}`}><Info size={17} /><div><strong>{summary}</strong><span>{weeklyCount < 2 ? 'Baseline set. Your target path is ready. Add another weekly measurement to start comparing progress.' : 'The main comparison becomes more useful across a three- or four-week trend.'}</span></div></div>
      {metric === 'bodyFatPercent' || metric === 'fatMassKg' ? <p className="composition-projection-note">Body-fat projections assume your estimated fat-free mass remains around {activePlan.baselineFatFreeMassKg?.toFixed(1) ?? '—'} kg. Smart-scale body-composition readings can fluctuate, so focus on the longer-term trend.</p> : null}
      {latestMeasurement?.id !== activePlan.baselineMeasurementId ? <button type="button" className="text-button update-plan-button" onClick={() => setUpdateOpen(true)}><RefreshCw size={15} /> Update plan from latest measurement</button> : null}
    </section>

    {updateOpen && latestMeasurement && updatePreview ? <Modal open onClose={() => setUpdateOpen(false)} title="Update plan from latest measurement" subtitle="Preview the new baseline before creating another plan version." size="medium" footer={<><button type="button" className="text-button" onClick={() => setUpdateOpen(false)}>Cancel</button><button type="button" className="primary-button" onClick={() => { saveWeightLossPlan(latestMeasurement.id, draftRate, updatePreview.planStartDate); setUpdateOpen(false); }}><Check size={17} /> Create plan version {activePlan.version + 1}</button></>}><div className="update-plan-preview"><p><Info size={17} /> Your measurement history will stay unchanged. Only the future target path will use the latest confirmed measurement as its baseline.</p><dl><div><dt>New baseline</dt><dd>{latestMeasurement.weightKg?.toFixed(1)} kg</dd></div><div><dt>Plan start</dt><dd>{longDate(updatePreview.planStartDate)}</dd></div><div><dt>Target rate</dt><dd>{draftRate.toFixed(1)}% per week</dd></div><div><dt>Estimated target date</dt><dd>{longDate(updatePreview.estimatedTargetDate)}</dd></div></dl></div></Modal> : null}
  </>;
}
