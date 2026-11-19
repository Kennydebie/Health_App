import { useMemo, useState } from 'react';
import { Area, AreaChart, ResponsiveContainer } from 'recharts';
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
  sortedMeasurements,
  targetWeightAtBodyFat,
} from '../lib/bodyMeasurements';
import type { AppController } from '../state/useAppData';
import type { BodyGoalSettings, BodyMeasurement, BodyMetricKey } from '../types/models';
import { WeightProgressPlan } from './WeightProgressPlan';

interface Props { controller: AppController; }

const PRIMARY_METRICS: BodyMetricKey[] = ['weightKg', 'bodyFatPercent', 'fatMassKg', 'fatFreeMassKg', 'muscleMassKg', 'visceralFatIndex'];
const SECONDARY_METRICS: BodyMetricKey[] = ['bmi', 'musclePercent', 'skeletalMusclePercent', 'bodyWaterPercent', 'subcutaneousFatPercent', 'boneMassKg', 'proteinPercent', 'bmrKcal', 'bodyAge'];

function round(value: number | null, digits = 1) {
  return value == null ? '—' : value.toFixed(digits);
}

function changeLabel(value: number | null, unit: string) {
  if (value == null) return 'Nog een meting nodig';
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
    return targetWeight == null ? 'Na eerste meting' : `≈ ${(targetWeight - baseline.fatFreeMassKg).toFixed(1)} kg at target`;
  }
  if (metric === 'fatFreeMassKg') return goals.fatFreeMassTargetKg == null ? 'Volgt na eerste meting' : `${goals.fatFreeMassTargetKg.toFixed(1)} kg preserve`;
  if (metric === 'muscleMassKg') return goals.muscleMassTargetKg == null ? 'Volgt na eerste meting' : `${goals.muscleMassTargetKg.toFixed(1)} kg preserve`;
  return 'Index van apparaat';
}

export function BodyCompositionDashboard({ controller }: Props) {
  const { data, updateBodyGoals, confirmMeasurementMetric } = controller;
  const [goalDraft, setGoalDraft] = useState(data.bodyGoals);
  const measurements = useMemo(() => sortedMeasurements(data.measurements), [data.measurements]);
  const composition = measurements.filter(hasBodyComposition);
  const latest = latestBodyComposition(data.measurements);
  const baseline = composition[0];
  const previous = composition.length > 1 ? composition.at(-2) : undefined;
  const bodyFatReference = bodyFatReferenceRange(data.profile.age, data.profile.sex);
  const fatQuality = (() => {
    if (!baseline || !latest || baseline.id === latest.id || baseline.weightKg == null || latest.weightKg == null || baseline.fatMassKg == null || latest.fatMassKg == null || baseline.fatFreeMassKg == null || latest.fatFreeMassKg == null) return null;
    const weight = latest.weightKg - baseline.weightKg;
    const fat = latest.fatMassKg - baseline.fatMassKg;
    const lean = latest.fatFreeMassKg - baseline.fatFreeMassKg;
    const status = weight < 0 && fat < 0 && lean >= -1 ? 'Vetverlies met behoud van vetvrije massa' : weight < 0 && lean < -1 ? 'Ook vetvrije massa daalde; vergelijk meerdere metingen onder gelijke omstandigheden' : 'Nog niet genoeg metingen voor een richting';
    return { weight, fat, lean, status };
  })();

  return <div className="body-dashboard">
    {!latest ? <><section className="card body-empty"><Scale size={32} /><h2>Lichaamssamenstelling</h2><div className="empty-state compact"><h3>Nog geen meting van lichaamssamenstelling</h3><p>Upload een FitDays-screenshot voor vet- en spierschattingen.</p></div></section><WeightProgressPlan controller={controller} /></> : <>
      <section className="card body-summary">
        <div className="body-summary__lead"><p className="eyebrow">Laatste meting · {formatMeasurementDate(latest.measuredAt, false)}</p><h2>{round(latest.weightKg)} <small>kg</small></h2><span>{round(latest.bodyFatPercent)}% body fat · {round(latest.fatMassKg)} kg fat mass</span></div>
        <div className="body-summary__metrics"><span><small>Vetvrije massa</small><strong>{round(latest.fatFreeMassKg)} kg</strong></span><span><small>Spiermassa</small><strong>{round(latest.muscleMassKg)} kg</strong></span><span><small>Lichaamsvocht</small><strong>{round(latest.bodyWaterPercent)}%</strong></span><span><small>Measurements</small><strong>{composition.length}</strong></span></div>
        <div className="body-summary__quality"><ShieldCheck size={18} /><p><strong>{composition.length === 1 ? 'Eén meting' : 'Vergelijking beschikbaar'}</strong>{composition.length === 1 ? 'Voeg nog een meting toe onder vergelijkbare omstandigheden om te vergelijken.' : `Weight change since the previous measurement: ${changeLabel(latest.weightKg != null && previous?.weightKg != null ? latest.weightKg - previous.weightKg : null, 'kg')}. Consumer scale composition values are estimates; compare readings taken under similar conditions.`}</p></div>
      </section>

      <WeightProgressPlan controller={controller} />

      <section className="body-kpi-grid" aria-label="Belangrijkste waarden">
        {PRIMARY_METRICS.map((item) => {
          const current = valueFor(latest, item);
          const initial = valueFor(baseline, item);
          const previousChange = metricChange(data.measurements, item);
          const fourWeekChange = metricChange(data.measurements, item, 28);
          const spark = metricSeries(data.measurements, item).slice(-8).map((point) => ({ value: point.value }));
          const favorableDown = item === 'weightKg' || item === 'bodyFatPercent' || item === 'fatMassKg';
           const trendText = previousChange == null ? 'Nog geen vergelijking' : previousChange === 0 ? 'Stabiel' : previousChange < 0 === favorableDown ? 'Richting doel' : 'Weg van doel';
          const positionText = item === 'weightKg' && current != null ? `${Math.max(0, current - data.profile.goalWeightKg).toFixed(1)} kg to goal`
            : item === 'bodyFatPercent' && current != null ? current > data.bodyGoals.bodyFatTargetMaxPercent ? 'Boven je persoonlijke doelbereik' : current < data.bodyGoals.bodyFatTargetMinPercent ? 'Onder je persoonlijke doelbereik' : 'Binnen je persoonlijke doelbereik'
              : item === 'fatFreeMassKg' || item === 'muscleMassKg' ? 'Vergelijk met je start' : item === 'visceralFatIndex' ? 'Positie volgens apparaat' : 'Ten opzichte van je start';
          return <article className="card body-kpi" key={item}>
            <header><span>{BODY_METRIC_LABELS[item]}</span><span className="body-info" title={`${BODY_METRIC_LABELS[item]} is shown from your latest saved measurement. Range and target context is informational, not diagnostic.`}><Info size={15} aria-hidden="true" /></span></header>
            <div className="body-kpi__value"><strong>{round(current)} <small>{BODY_METRIC_UNITS[item]}</small></strong><span className={trendText === 'Richting doel' ? 'positive' : ''}><TrendIcon value={previousChange} /> {trendText}</span></div>
            <span className="body-kpi__position">Position · {positionText}</span>
            <div className="body-spark"><ResponsiveContainer width="100%" height="100%"><AreaChart data={spark}><defs><linearGradient id={`spark-${item}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#67cbb2" stopOpacity=".35"/><stop offset="1" stopColor="#67cbb2" stopOpacity="0"/></linearGradient></defs><Area type="monotone" dataKey="value" stroke="#67cbb2" fill={`url(#spark-${item})`} strokeWidth={2} isAnimationActive={false}/></AreaChart></ResponsiveContainer></div>
            <dl><div><dt>Start</dt><dd>{round(initial)} {BODY_METRIC_UNITS[item]}</dd></div><div><dt>Doel / bereik</dt><dd>{targetLabel(item, data.bodyGoals, data.profile.goalWeightKg, baseline)}</dd></div><div><dt>Previous</dt><dd>{changeLabel(previousChange, BODY_METRIC_UNITS[item])}</dd></div><div><dt>4 weken</dt><dd>{changeLabel(fourWeekChange, BODY_METRIC_UNITS[item])}</dd></div></dl>
            <footer>Gemeten {formatMeasurementDate(latest.measuredAt, false)}</footer>
          </article>;
        })}
      </section>

      <section className="body-detail-grid">
        <article className="card fat-quality"><h2>Veranderingen in samenstelling</h2>{fatQuality ? <><div><span><small>Gewicht</small><strong>{changeLabel(fatQuality.weight, 'kg')}</strong></span><span><small>Vetmassa</small><strong>{changeLabel(fatQuality.fat, 'kg')}</strong></span><span><small>Vetvrije massa</small><strong>{changeLabel(fatQuality.lean, 'kg')}</strong></span></div><p><TrendingDown size={17}/>{fatQuality.status}</p></> : <div className="empty-state compact"><Gauge size={28}/><h3>Twee metingen nodig</h3><p>Meet nog eens onder vergelijkbare omstandigheden om te vergelijken.</p></div>}</article>
        <article className="card secondary-estimates"><h2>FitDays-schattingen</h2><div>{SECONDARY_METRICS.filter((item) => valueFor(latest, item) != null).map((item) => <span key={item}><small>{BODY_METRIC_LABELS[item]}</small><strong>{round(valueFor(latest, item))} {BODY_METRIC_UNITS[item]}</strong></span>)}</div><p><Info size={16}/> Dit zijn schattingen van je weegschaal. “Visceraal vet” is een index van het apparaat, geen kilo’s of procenten.</p></article>
      </section>
    </>}

    <details className="card body-goals" open={!latest}>
      <summary><span><Target size={19}/><strong>Lichaamsdoelen</strong><small>Pas lichaamsdoelen aan zonder je voedingsdoelen te wijzigen</small></span></summary>
      <form onSubmit={(event) => { event.preventDefault(); updateBodyGoals(goalDraft); }}><label>Eerste tussenstap<div><input type="number" step="0.1" min="5" max="60" value={goalDraft.bodyFatCheckpointPercent} onChange={(event) => setGoalDraft((current) => ({ ...current, bodyFatCheckpointPercent: Number(event.target.value) }))}/><span>% vet</span></div></label><label>Doelbereik<div><input aria-label="Minimum vetpercentage" type="number" step="0.1" min="5" max="60" value={goalDraft.bodyFatTargetMinPercent} onChange={(event) => setGoalDraft((current) => ({ ...current, bodyFatTargetMinPercent: Number(event.target.value) }))}/><span>to</span><input aria-label="Maximum vetpercentage" type="number" step="0.1" min="5" max="60" value={goalDraft.bodyFatTargetMaxPercent} onChange={(event) => setGoalDraft((current) => ({ ...current, bodyFatTargetMaxPercent: Number(event.target.value) }))}/><span>%</span></div></label><label>Persoonlijk vetpercentagedoel<div><input type="number" step="0.1" min="5" max="60" value={goalDraft.bodyFatPersonalTargetPercent} onChange={(event) => setGoalDraft((current) => ({ ...current, bodyFatPersonalTargetPercent: Number(event.target.value) }))}/><span>%</span></div></label><label>Tailledoel<div><input type="number" step="0.1" min="40" max="200" placeholder="Optioneel" value={goalDraft.waistTargetCm ?? ''} onChange={(event) => setGoalDraft((current) => ({ ...current, waistTargetCm: event.target.value ? Number(event.target.value) : null }))}/><span>cm</span></div></label><button className="primary-button" type="submit"><Check size={17}/> Lichaamsdoelen opslaan</button></form>
    </details>

    <section className="card measurement-history body-history"><div className="section-title"><div><h2>Meetgeschiedenis</h2></div><span>{measurements.length} {measurements.length === 1 ? 'meting' : 'entries'}</span></div>{measurements.length ? <div className="measurement-history-list">{[...measurements].reverse().map((measurement) => <article key={measurement.id}><span className={`measurement-source ${measurement.source === 'manual' ? 'manual' : ''}`}>{measurement.source === 'manual' ? <Scale size={15}/> : <Activity size={15}/>}</span><div><strong>{formatMeasurementDate(measurement.measuredAt)}</strong><small>{measurement.source === 'manual' ? 'Manual entry' : 'FitDays screenshot'} · opgeslagen {formatMeasurementDate(measurement.createdAt, false)}</small>{measurement.excludedFromTrend?.length ? <span className="outlier-note"><AlertTriangle size={13}/> Ongebruikelijke verandering uitgesloten van {measurement.excludedFromTrend.map((item) => BODY_METRIC_LABELS[item]).join(', ')} trend <button type="button" onClick={() => measurement.excludedFromTrend?.forEach((item) => confirmMeasurementMetric(measurement.id, item))}>Bevestigen & meetellen</button></span> : null}</div><dl><div><dt>Weight</dt><dd>{round(measurement.weightKg)} kg</dd></div><div><dt>Vetpercentage</dt><dd>{round(measurement.bodyFatPercent)}%</dd></div><div><dt>Muscle</dt><dd>{round(measurement.muscleMassKg)} kg</dd></div><div><dt>Waist</dt><dd>{round(measurement.waistCircumferenceCm)} cm</dd></div></dl></article>)}</div> : <div className="empty-state compact"><Scale size={28}/><h3>Nog geen metingen</h3><p>Upload een FitDays-screenshot of vul je gewicht in om te beginnen.</p></div>}</section>

    <section className="body-guidance">
      <article className="card"><Droplets size={20}/><div><h3>Meet steeds op dezelfde manier</h3><p>Gebruik voor vergelijkbare metingen hetzelfde apparaat, op hetzelfde tijdstip en met vergelijkbaar drinken, eten en sporten. Wekelijks vergelijken zegt meer dan dagelijkse schommelingen.</p></div></article>
      <details className="card"><summary><span><Info size={19}/><strong>Bronnen & beperkingen</strong></span></summary><p><a href={bodyFatReference.url} target="_blank" rel="noreferrer">{bodyFatReference.source}</a>: age- and sex-specific population reference ({bodyFatReference.ageBracket}, {bodyFatReference.sex}: about {bodyFatReference.min}–{bodyFatReference.max}%). {bodyFatReference.limitations}</p><p><a href={BMI_REFERENCE.url} target="_blank" rel="noreferrer">{BMI_REFERENCE.source}</a>: adult BMI categories. {BMI_REFERENCE.limitations}</p><p><a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC13197919/" target="_blank" rel="noreferrer">Richtlijnen bio-impedantie (BIA)</a>: schattingen hangen af van het apparaat en gelijke omstandigheden. Project 73 toont trends en brongegevens; het stelt geen diagnoses.</p></details>
    </section>
  </div>;
}
