import { useMemo, useState } from 'react';
import { Area, AreaChart, CartesianGrid, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Activity, AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight, Check, Droplets, Gauge, Info, Scale, ShieldCheck, Target, TrendingDown } from 'lucide-react';
import {
  BMI_REFERENCE,
  BODY_METRIC_LABELS,
  BODY_METRIC_UNITS,
  bodyFatReferenceRange,
  formatMeasurementDate,
  hasBodyComposition,
  latestBodyComposition,
  metricChange,
  metricSeries,
  projectedBodyFatAtWeight,
  sortedMeasurements,
  targetWeightAtBodyFat,
} from '../lib/bodyMeasurements';
import type { AppController } from '../state/useAppData';
import type { BodyGoalSettings, BodyMeasurement, BodyMetricKey } from '../types/models';

interface Props { controller: AppController; }
type ChartRange = '4w' | '3m' | '6m' | '1y' | 'all';

const CHART_METRICS: BodyMetricKey[] = ['weightKg', 'bodyFatPercent', 'fatMassKg', 'fatFreeMassKg', 'muscleMassKg', 'skeletalMusclePercent', 'bodyWaterPercent', 'visceralFatIndex', 'waistCircumferenceCm'];
const PRIMARY_METRICS: BodyMetricKey[] = ['weightKg', 'bodyFatPercent', 'fatMassKg', 'fatFreeMassKg', 'muscleMassKg', 'visceralFatIndex'];
const SECONDARY_METRICS: BodyMetricKey[] = ['bmi', 'musclePercent', 'skeletalMusclePercent', 'bodyWaterPercent', 'subcutaneousFatPercent', 'boneMassKg', 'proteinPercent', 'bmrKcal', 'bodyAge'];
const TOOLTIP_STYLE = { background: '#101a20', border: '1px solid rgba(116, 140, 151, .28)', borderRadius: 12, color: '#f6f2ed' };
const RANGE_DAYS: Record<ChartRange, number | null> = { '4w': 28, '3m': 90, '6m': 183, '1y': 365, all: null };

function round(value: number | null, digits = 1) {
  return value == null ? '—' : value.toFixed(digits);
}

function changeLabel(value: number | null, unit: string) {
  if (value == null) return 'Needs another reading';
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}${unit ? ` ${unit}` : ''}`;
}

function TrendIcon({ value }: { value: number | null }) {
  if (value == null || value === 0) return <ArrowRight size={15} />;
  return value < 0 ? <ArrowDownRight size={15} /> : <ArrowUpRight size={15} />;
}

function valueFor(measurement: BodyMeasurement | undefined, metric: BodyMetricKey) {
  const value = measurement?.[metric];
  return typeof value === 'number' ? value : null;
}

function targetLabel(metric: BodyMetricKey, goals: BodyGoalSettings, goalWeightKg: number, baseline?: BodyMeasurement) {
  if (metric === 'weightKg') return `${goalWeightKg.toFixed(1)} kg goal`;
  if (metric === 'bodyFatPercent') return `${goals.bodyFatTargetMinPercent}–${goals.bodyFatTargetMaxPercent}% personal target`;
  if (metric === 'fatMassKg' && baseline?.fatFreeMassKg != null) {
    const targetWeight = targetWeightAtBodyFat(baseline.fatFreeMassKg, goals.bodyFatPersonalTargetPercent);
    return targetWeight == null ? 'Set after baseline' : `≈ ${(targetWeight - baseline.fatFreeMassKg).toFixed(1)} kg at target`;
  }
  if (metric === 'fatFreeMassKg') return goals.fatFreeMassTargetKg == null ? 'Baseline target pending' : `${goals.fatFreeMassTargetKg.toFixed(1)} kg preserve`;
  if (metric === 'muscleMassKg') return goals.muscleMassTargetKg == null ? 'Baseline target pending' : `${goals.muscleMassTargetKg.toFixed(1)} kg preserve`;
  return 'Device-specific index';
}

export function BodyCompositionDashboard({ controller }: Props) {
  const { data, updateBodyGoals, confirmMeasurementMetric } = controller;
  const [metric, setMetric] = useState<BodyMetricKey>('weightKg');
  const [range, setRange] = useState<ChartRange>('3m');
  const [goalDraft, setGoalDraft] = useState(data.bodyGoals);
  const measurements = useMemo(() => sortedMeasurements(data.measurements), [data.measurements]);
  const composition = measurements.filter(hasBodyComposition);
  const latest = latestBodyComposition(data.measurements);
  const baseline = composition[0];
  const previous = composition.length > 1 ? composition.at(-2) : undefined;
  const bodyFatReference = bodyFatReferenceRange(data.profile.age, data.profile.sex);
  const bodyFatTargetWeight = latest?.fatFreeMassKg == null ? null : targetWeightAtBodyFat(latest.fatFreeMassKg, data.bodyGoals.bodyFatTargetMaxPercent);
  const personalTargetWeight = latest?.fatFreeMassKg == null ? null : targetWeightAtBodyFat(latest.fatFreeMassKg, data.bodyGoals.bodyFatPersonalTargetPercent);
  const goalBodyFat = latest?.fatFreeMassKg == null ? null : projectedBodyFatAtWeight(latest.fatFreeMassKg, data.profile.goalWeightKg);

  const chartData = useMemo(() => {
    const series = metricSeries(data.measurements, metric, true);
    const days = RANGE_DAYS[range];
    const cutoff = days && series.length ? new Date(series.at(-1)!.measuredAt).getTime() - days * 86_400_000 : 0;
    return series.filter((point) => !days || new Date(point.measuredAt).getTime() >= cutoff).map((point) => ({
      ...point,
      label: new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(point.measuredAt)),
      trend: point.excluded ? null : point.value,
    }));
  }, [data.measurements, metric, range]);

  const selectedGoal = metric === 'weightKg' ? data.profile.goalWeightKg
    : metric === 'bodyFatPercent' ? data.bodyGoals.bodyFatPersonalTargetPercent
      : metric === 'fatFreeMassKg' ? data.bodyGoals.fatFreeMassTargetKg
        : metric === 'muscleMassKg' ? data.bodyGoals.muscleMassTargetKg
          : metric === 'waistCircumferenceCm' ? data.bodyGoals.waistTargetCm : null;
  const selectedBand = metric === 'bodyFatPercent' ? [data.bodyGoals.bodyFatTargetMinPercent, data.bodyGoals.bodyFatTargetMaxPercent] : null;

  const fatQuality = (() => {
    if (!baseline || !latest || baseline.id === latest.id || baseline.weightKg == null || latest.weightKg == null || baseline.fatMassKg == null || latest.fatMassKg == null || baseline.fatFreeMassKg == null || latest.fatFreeMassKg == null) return null;
    const weight = latest.weightKg - baseline.weightKg;
    const fat = latest.fatMassKg - baseline.fatMassKg;
    const lean = latest.fatFreeMassKg - baseline.fatFreeMassKg;
    const status = weight < 0 && fat < 0 && lean >= -1 ? 'Fat loss with lean mass broadly maintained' : weight < 0 && lean < -1 ? 'Lean-mass estimate also declined—review several standardized readings' : 'Not enough directional evidence yet';
    return { weight, fat, lean, status };
  })();

  return <div className="body-dashboard">
    {!latest ? <section className="card body-empty"><Scale size={32} /><p className="eyebrow">Body composition</p><h2>Build your first real baseline</h2><p>Import a FitDays screenshot to replace the sample readings with your own measurement. Weight-only entries still appear in the timeline, but a full screenshot unlocks composition KPIs.</p></section> : <>
      <section className="card body-summary">
        <div className="body-summary__lead"><p className="eyebrow">Latest body composition · {formatMeasurementDate(latest.measuredAt, false)}</p><h2>{round(latest.weightKg)} <small>kg</small></h2><span>{round(latest.bodyFatPercent)}% body fat · {round(latest.fatMassKg)} kg fat mass</span></div>
        <div className="body-summary__metrics"><span><small>Fat-free mass</small><strong>{round(latest.fatFreeMassKg)} kg</strong></span><span><small>Muscle mass</small><strong>{round(latest.muscleMassKg)} kg</strong></span><span><small>Body water</small><strong>{round(latest.bodyWaterPercent)}%</strong></span><span><small>Measurements</small><strong>{composition.length}</strong></span></div>
        <div className="body-summary__quality"><ShieldCheck size={18} /><p><strong>{composition.length === 1 ? 'Baseline established' : 'Trend ready'}</strong>{composition.length === 1 ? 'Baseline established — add another weekly measurement to begin tracking progress.' : `Previous change: ${changeLabel(latest.weightKg != null && previous?.weightKg != null ? latest.weightKg - previous.weightKg : null, 'kg')}. Consumer scale composition values are estimates; compare repeated readings under similar conditions.`}</p></div>
      </section>

      <section className="body-kpi-grid" aria-label="Primary body composition KPIs">
        {PRIMARY_METRICS.map((item) => {
          const current = valueFor(latest, item);
          const initial = valueFor(baseline, item);
          const previousChange = metricChange(data.measurements, item);
          const fourWeekChange = metricChange(data.measurements, item, 28);
          const spark = metricSeries(data.measurements, item).slice(-8).map((point) => ({ value: point.value }));
          const favorableDown = item === 'weightKg' || item === 'bodyFatPercent' || item === 'fatMassKg';
          const trendText = previousChange == null ? 'Baseline' : previousChange === 0 ? 'Stable' : previousChange < 0 === favorableDown ? 'Moving toward target' : 'Watch the next readings';
          const positionText = item === 'weightKg' && current != null ? `${Math.max(0, current - data.profile.goalWeightKg).toFixed(1)} kg to goal`
            : item === 'bodyFatPercent' && current != null ? current > data.bodyGoals.bodyFatTargetMaxPercent ? 'Above personal target range' : current < data.bodyGoals.bodyFatTargetMinPercent ? 'Below personal target range' : 'Inside personal target range'
              : item === 'fatFreeMassKg' || item === 'muscleMassKg' ? 'Compare with your baseline' : item === 'visceralFatIndex' ? 'Device-specific position' : 'Personal baseline position';
          return <article className="card body-kpi" key={item}>
            <header><span>{BODY_METRIC_LABELS[item]}</span><span className="body-info" title={`${BODY_METRIC_LABELS[item]} is shown from your latest saved measurement. Range and target context is informational, not diagnostic.`}><Info size={15} aria-hidden="true" /></span></header>
            <div className="body-kpi__value"><strong>{round(current)} <small>{BODY_METRIC_UNITS[item]}</small></strong><span className={trendText === 'Moving toward target' ? 'positive' : ''}><TrendIcon value={previousChange} /> {trendText}</span></div>
            <span className="body-kpi__position">Position · {positionText}</span>
            <div className="body-spark"><ResponsiveContainer width="100%" height="100%"><AreaChart data={spark}><defs><linearGradient id={`spark-${item}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#67cbb2" stopOpacity=".35"/><stop offset="1" stopColor="#67cbb2" stopOpacity="0"/></linearGradient></defs><Area type="monotone" dataKey="value" stroke="#67cbb2" fill={`url(#spark-${item})`} strokeWidth={2} isAnimationActive={false}/></AreaChart></ResponsiveContainer></div>
            <dl><div><dt>Baseline</dt><dd>{round(initial)} {BODY_METRIC_UNITS[item]}</dd></div><div><dt>Target / range</dt><dd>{targetLabel(item, data.bodyGoals, data.profile.goalWeightKg, baseline)}</dd></div><div><dt>Previous</dt><dd>{changeLabel(previousChange, BODY_METRIC_UNITS[item])}</dd></div><div><dt>4-week</dt><dd>{changeLabel(fourWeekChange, BODY_METRIC_UNITS[item])}</dd></div></dl>
            <footer>Measured {formatMeasurementDate(latest.measuredAt, false)}</footer>
          </article>;
        })}
      </section>

      <section className="card body-projection">
        <div><p className="eyebrow">Personal target projection</p><h2>If lean mass is maintained</h2><p>This is a mathematical estimate from the latest fat-free-mass reading—not a prediction or promise.</p></div>
        <div className="projection-path">
          <span><small>Now</small><strong>{round(latest.weightKg)} kg</strong><em>{round(latest.bodyFatPercent)}% fat</em></span><ArrowRight size={20}/>
          <span><small>{data.bodyGoals.bodyFatTargetMaxPercent}% checkpoint</small><strong>{round(bodyFatTargetWeight)} kg</strong><em>estimated</em></span><ArrowRight size={20}/>
          <span><small>{data.bodyGoals.bodyFatPersonalTargetPercent}% target</small><strong>{round(personalTargetWeight)} kg</strong><em>estimated</em></span><ArrowRight size={20}/>
          <span className="goal"><small>Project 75</small><strong>{data.profile.goalWeightKg} kg</strong><em>{goalBodyFat == null ? '—' : `≈ ${goalBodyFat}% fat`}</em></span>
        </div>
      </section>

      <section className="card body-trend-card">
        <div className="section-title body-chart-controls"><div><p className="eyebrow">Interactive trend</p><h2>{BODY_METRIC_LABELS[metric]}</h2></div><div><select aria-label="Body metric" value={metric} onChange={(event) => setMetric(event.target.value as BodyMetricKey)}>{CHART_METRICS.map((item) => <option key={item} value={item}>{BODY_METRIC_LABELS[item]}</option>)}</select><div className="range-toggle">{(['4w', '3m', '6m', '1y', 'all'] as const).map((item) => <button type="button" className={range === item ? 'active' : ''} onClick={() => setRange(item)} key={item}>{item === 'all' ? 'All' : item}</button>)}</div></div></div>
        {chartData.length ? <div className="body-chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={chartData} margin={{ top: 18, right: 24, left: 4, bottom: 8 }}><CartesianGrid stroke="rgba(139,161,171,.13)" vertical={false}/><XAxis dataKey="label" stroke="#778991" tickLine={false} axisLine={false}/><YAxis domain={['dataMin - 1', 'dataMax + 1']} stroke="#778991" tickLine={false} axisLine={false} width={52}/><Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value) => [`${Number(value).toFixed(1)} ${BODY_METRIC_UNITS[metric]}`, BODY_METRIC_LABELS[metric]]} labelFormatter={(_, payload) => payload?.[0]?.payload?.measuredAt ? formatMeasurementDate(payload[0].payload.measuredAt) : ''}/>{selectedBand ? <ReferenceArea y1={selectedBand[0]} y2={selectedBand[1]} fill="#67cbb2" fillOpacity={.09}/>: null}{selectedGoal != null ? <ReferenceLine y={selectedGoal} stroke="#efb44c" strokeDasharray="6 5" label={{ value: 'Personal target', fill: '#efb44c', position: 'insideTopRight' }}/>: null}<Line type="monotone" connectNulls={false} dataKey="trend" name={BODY_METRIC_LABELS[metric]} stroke="#63b3ed" strokeWidth={3} dot={{ r: 4, fill: '#101a20', strokeWidth: 2 }} activeDot={{ r: 6 }}/></LineChart></ResponsiveContainer></div> : <div className="empty-state compact"><Activity size={28}/><h3>No readings in this range</h3><p>Choose All or add another measurement.</p></div>}
        <div className="chart-legend"><span><i className="solid"/> Actual saved points</span><span><i className="target"/> Personal target</span><span>Flagged outliers remain in history but are omitted from the connected trend.</span></div>
      </section>

      <section className="body-detail-grid">
        <article className="card fat-quality"><p className="eyebrow">Fat-loss quality</p><h2>Weight vs tissue estimates</h2>{fatQuality ? <><div><span><small>Weight</small><strong>{changeLabel(fatQuality.weight, 'kg')}</strong></span><span><small>Fat mass</small><strong>{changeLabel(fatQuality.fat, 'kg')}</strong></span><span><small>Fat-free mass</small><strong>{changeLabel(fatQuality.lean, 'kg')}</strong></span></div><p><TrendingDown size={17}/>{fatQuality.status}</p></> : <div className="empty-state compact"><Gauge size={28}/><h3>Needs two comparable readings</h3><p>Take weekly measurements under similar conditions before interpreting tissue changes.</p></div>}</article>
        <article className="card secondary-estimates"><p className="eyebrow">Secondary estimates</p><h2>Device context</h2><div>{SECONDARY_METRICS.filter((item) => valueFor(latest, item) != null).map((item) => <span key={item}><small>{BODY_METRIC_LABELS[item]}</small><strong>{round(valueFor(latest, item))} {BODY_METRIC_UNITS[item]}</strong></span>)}</div><p><Info size={16}/> These are FitDays/device estimates. “Visceral fat” is shown as a device index, never kg or percent.</p></article>
      </section>
    </>}

    <details className="card body-goals" open={!latest}>
      <summary><span><Target size={19}/><strong>Body Goals</strong><small>Edit personal targets without changing nutrition targets</small></span></summary>
      <form onSubmit={(event) => { event.preventDefault(); updateBodyGoals(goalDraft); }}><label>First checkpoint<div><input type="number" step="0.1" min="5" max="60" value={goalDraft.bodyFatCheckpointPercent} onChange={(event) => setGoalDraft((current) => ({ ...current, bodyFatCheckpointPercent: Number(event.target.value) }))}/><span>% fat</span></div></label><label>Target range<div><input aria-label="Body-fat target minimum" type="number" step="0.1" min="5" max="60" value={goalDraft.bodyFatTargetMinPercent} onChange={(event) => setGoalDraft((current) => ({ ...current, bodyFatTargetMinPercent: Number(event.target.value) }))}/><span>to</span><input aria-label="Body-fat target maximum" type="number" step="0.1" min="5" max="60" value={goalDraft.bodyFatTargetMaxPercent} onChange={(event) => setGoalDraft((current) => ({ ...current, bodyFatTargetMaxPercent: Number(event.target.value) }))}/><span>%</span></div></label><label>Personal body-fat target<div><input type="number" step="0.1" min="5" max="60" value={goalDraft.bodyFatPersonalTargetPercent} onChange={(event) => setGoalDraft((current) => ({ ...current, bodyFatPersonalTargetPercent: Number(event.target.value) }))}/><span>%</span></div></label><label>Waist target<div><input type="number" step="0.1" min="40" max="200" placeholder="Optional" value={goalDraft.waistTargetCm ?? ''} onChange={(event) => setGoalDraft((current) => ({ ...current, waistTargetCm: event.target.value ? Number(event.target.value) : null }))}/><span>cm</span></div></label><button className="primary-button" type="submit"><Check size={17}/> Save body goals</button></form>
    </details>

    <section className="card measurement-history body-history"><div className="section-title"><div><p className="eyebrow">Canonical timeline</p><h2>Measurement history</h2></div><span>{measurements.length} genuine {measurements.length === 1 ? 'entry' : 'entries'}</span></div>{measurements.length ? <div className="measurement-history-list">{[...measurements].reverse().map((measurement) => <article key={measurement.id}><span className={`measurement-source ${measurement.source === 'manual' ? 'manual' : ''}`}>{measurement.source === 'manual' ? <Scale size={15}/> : <Activity size={15}/>}</span><div><strong>{formatMeasurementDate(measurement.measuredAt)}</strong><small>{measurement.source === 'manual' ? 'Manual entry' : 'FitDays AI screenshot'} · saved {formatMeasurementDate(measurement.createdAt, false)}</small>{measurement.excludedFromTrend?.length ? <span className="outlier-note"><AlertTriangle size={13}/> Unusual change excluded from {measurement.excludedFromTrend.map((item) => BODY_METRIC_LABELS[item]).join(', ')} trend <button type="button" onClick={() => measurement.excludedFromTrend?.forEach((item) => confirmMeasurementMetric(measurement.id, item))}>Confirm & include</button></span> : null}</div><dl><div><dt>Weight</dt><dd>{round(measurement.weightKg)} kg</dd></div><div><dt>Body fat</dt><dd>{round(measurement.bodyFatPercent)}%</dd></div><div><dt>Muscle</dt><dd>{round(measurement.muscleMassKg)} kg</dd></div><div><dt>Waist</dt><dd>{round(measurement.waistCircumferenceCm)} cm</dd></div></dl></article>)}</div> : <div className="empty-state compact"><Scale size={28}/><h3>No genuine measurements yet</h3><p>Sample data never counts toward your progress.</p></div>}</section>

    <section className="body-guidance">
      <article className="card"><Droplets size={20}/><div><h3>Measure consistently</h3><p>For comparable BIA readings, use the same device at a similar time and under similar hydration, food and exercise conditions. Weekly is usually more useful than reacting to daily estimates.</p></div></article>
      <details className="card"><summary><span><Info size={19}/><strong>Sources & limitations</strong></span></summary><p><a href={bodyFatReference.url} target="_blank" rel="noreferrer">{bodyFatReference.source}</a>: age- and sex-specific population reference ({bodyFatReference.ageBracket}, {bodyFatReference.sex}: about {bodyFatReference.min}–{bodyFatReference.max}%). {bodyFatReference.limitations}</p><p><a href={BMI_REFERENCE.url} target="_blank" rel="noreferrer">{BMI_REFERENCE.source}</a>: adult BMI categories. {BMI_REFERENCE.limitations}</p><p><a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC13197919/" target="_blank" rel="noreferrer">Bioelectrical impedance analysis guidance</a>: estimates depend on device equations and standardized conditions. Project 75 shows trends and source data; it does not diagnose health.</p></details>
    </section>
  </div>;
}
