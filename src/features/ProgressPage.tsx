import { useMemo, useState, type CSSProperties } from 'react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Activity, Award, BedDouble, Check, Droplets, Dumbbell, Footprints, Medal, Plus, Scale, Sparkles, Target, TrendingDown, Trophy } from 'lucide-react';
import { ToneIcon } from '../components/Visuals';
import { FitDaysImport } from './FitDaysImport';
import { BodyCompositionDashboard } from './BodyCompositionDashboard';
import { ProgressPhotos } from './ProgressPhotos';
import { exerciseMap } from '../data/exercises';
import { datesInWeek, weeklyVolumeSeries } from '../lib/engagement';
import { prettyDate, shiftDate, toDateKey } from '../lib/date';
import { average } from '../lib/progress';
import type { AppController } from '../state/useAppData';
import { getDashboardSummary } from '../lib/selectors';
import { buildCoachingInputs, decideWeeklyCoach, getStrengthTrends } from '../lib/coachingEngine';

interface ProgressPageProps { controller: AppController; }
type ProgressTab = 'overview' | 'body' | 'training' | 'nutrition';

const CHART_TOOLTIP_STYLE = { background: '#101a20', border: '1px solid rgba(116, 140, 151, .28)', borderRadius: 12, color: '#f6f2ed' };

export function ProgressPage({ controller }: ProgressPageProps) {
  const { data, saveWeight, totalsForDate, updateHabit } = controller;
  const [weightDate, setWeightDate] = useState(toDateKey());
  const today = toDateKey();
  const dashboard = useMemo(() => getDashboardSummary(data, today), [data, today]);
  const canonicalCurrentWeight = dashboard.body.currentWeight;
  const canonicalStartingWeight = dashboard.body.startingWeight;
  const [weight, setWeight] = useState(canonicalCurrentWeight == null ? '' : String(canonicalCurrentWeight));
  const [waist, setWaist] = useState('');
  const exerciseIds = [...new Set(data.sessions.flatMap((session) => session.sets.map((set) => set.exerciseId)))];
  const [exerciseId, setExerciseId] = useState(exerciseIds[0] ?? 'bench-press');
  const [saved, setSaved] = useState(false);
  const [progressTab, setProgressTab] = useState<ProgressTab>('body');
  const trend = dashboard.body.trend;
  const last7 = datesInWeek(today);

  const currentTotals = last7.map(totalsForDate);
  const loggedTotals = currentTotals.filter((item) => item.calories > 0);
  const averageCalories = average(loggedTotals.map((item) => item.calories));
  const averageProtein = average(loggedTotals.map((item) => item.protein));
  const withinTarget = currentTotals.filter((item) => item.calories > 0 && item.calories <= data.profile.calorieTarget + 100).length;
  const proteinDays = currentTotals.filter((item) => item.protein >= data.profile.proteinTarget * .95).length;
  const weekSnapshot = dashboard.training;
  const completedWorkouts = weekSnapshot.completedStrength;
  const allCompletedWorkouts = data.sessions.filter((session) => session.completedAt).length;
  const plannedWorkouts = weekSnapshot.plannedStrength;
  const previousAvgWeight = trend.previousAverage;
  const weightChange = trend.weeklyChange;
  const weightMeasurementCount = dashboard.body.measurementCount;
  const consistency = dashboard.weekly;
  const records = dashboard.personalRecords;
  const volumeSeries = weeklyVolumeSeries(data.sessions, today, 6);
  const coachDecision = decideWeeklyCoach(data, today);
  const coachingInputs = buildCoachingInputs(data, today);
  const strengthTrends = getStrengthTrends(data).filter((item) => item.comparableSessions >= 2).slice(0, 6);
  const waistHistory = data.measurements.filter((item) => !item.isDemo && item.waistCircumferenceCm != null).sort((a, b) => (a.measuredAt ?? '').localeCompare(b.measuredAt ?? ''));
  const latestWaist = waistHistory.at(-1)?.waistCircumferenceCm ?? null;
  const waistChange = latestWaist != null && waistHistory[0]?.waistCircumferenceCm != null ? latestWaist - waistHistory[0].waistCircumferenceCm! : null;

  const cardioSeries = volumeSeries.map((item) => {
    const start = item.startDate;
    const end = shiftDate(start, 6);
    return { week: item.week, minutes: data.cardioLog.filter((entry) => entry.date >= start && entry.date <= end).reduce((sum, entry) => sum + entry.minutes, 0) };
  });

  const nutritionSeries = Array.from({ length: 14 }, (_, index) => {
    const date = shiftDate(today, index - 13);
    const totals = totalsForDate(date);
    const logged = totals.calories > 0;
    return { date: date.slice(5), protein: logged ? Math.min(120, Math.round(totals.protein / Math.max(1, data.profile.proteinTarget) * 100)) : null, calories: logged ? Math.min(120, Math.round(totals.calories / data.profile.calorieTarget * 100)) : null };
  });

  const consistencyDays = Array.from({ length: 28 }, (_, index) => {
    const date = shiftDate(today, index - 27);
    const workout = data.sessions.some((session) => session.completedAt && session.date === date);
    const nutrition = data.foodLog.some((entry) => entry.date === date);
    const cardio = data.cardioLog.some((entry) => entry.date === date);
    return { date, workout, nutrition, cardio, score: Number(workout) + Number(nutrition) + Number(cardio) };
  });

  const exerciseHistory = data.sessions.filter((session) => session.completedAt).flatMap((session) => {
    const sets = session.sets.filter((set) => set.completed && !set.isWarmup && set.exerciseId === exerciseId);
    if (!sets.length) return [];
    const best = sets.reduce((result, set) => set.weightKg > result.weightKg || (set.weightKg === result.weightKg && set.reps > result.reps) ? set : result, sets[0]);
    return [{ date: session.date.slice(5), weight: best.weightKg, reps: best.reps, volume: sets.reduce((sum, set) => sum + set.weightKg * set.reps, 0) }];
  });
  const habit = data.habits.find((entry) => entry.date === today) ?? { date: today, water: false, walk: false, sleep: false };
  const weightProgress = dashboard.body.goalProgress;
  const validWeight = Number(weight) > 30 && Number(weight) < 300;
  const lostKg = canonicalStartingWeight == null || canonicalCurrentWeight == null ? 0 : Math.max(0, canonicalStartingWeight - canonicalCurrentWeight);
  const milestones = [
    { label: 'Eerste vijf trainingen', reached: allCompletedWorkouts >= 5, detail: `${Math.min(allCompletedWorkouts, 5)} / 5 voltooid`, Icon: Dumbbell },
    { label: 'Eerste 2 kg richting doel', reached: lostKg >= 2, detail: `${lostKg.toFixed(1)} / 2.0 kg`, Icon: Scale },
    { label: 'Eerste persoonlijk record', reached: records.length > 0, detail: records.length ? `${records.length} persoonlijk${records.length === 1 ? ' record' : 'e records'}` : 'Voltooi een oefening met gewicht', Icon: Trophy },
  ];

  return <div className="page progress-page premium-progress">
    <header className="page-header"><div><h1>Lichaam & metingen</h1><p>Gewicht, lichaamssamenstelling, trainingen en voeding op één plek.</p></div><form className="weight-entry" onSubmit={(event) => { event.preventDefault(); if (!validWeight) return; saveWeight(weightDate, Number(weight), waist ? Number(waist) : null); setSaved(true); window.setTimeout(() => setSaved(false), 1800); }}><label>Datum<input type="date" value={weightDate} onChange={(event) => setWeightDate(event.target.value)} /></label><label>Gewicht<div><input type="number" inputMode="decimal" step="0.1" min="30" max="300" value={weight} onChange={(event) => setWeight(event.target.value)} /><span>kg</span></div></label><label>Taille <small>optioneel</small><div><input type="number" inputMode="decimal" step="0.1" min="40" max="200" placeholder="—" value={waist} onChange={(event) => setWaist(event.target.value)} /><span>cm</span></div></label><button className="primary-button" type="submit" disabled={!validWeight}>{saved ? <Check size={18} /> : <Plus size={18} />}{saved ? 'Meting opgeslagen' : 'Meting opslaan'}</button></form></header>

    <nav className="progress-tabs" aria-label="Onderdelen">{(['body', 'overview', 'training', 'nutrition'] as const).map((tab) => <button type="button" key={tab} aria-selected={progressTab === tab} className={progressTab === tab ? 'active' : ''} onClick={() => setProgressTab(tab)}>{tab.charAt(0).toUpperCase() + tab.slice(1)}</button>)}</nav>

    {progressTab === 'body' ? <><FitDaysImport controller={controller} /><BodyCompositionDashboard controller={controller} /><ProgressPhotos /></> : null}

    <section className="progress-hero card" hidden={progressTab !== 'overview'}>
      <div className="goal-orbit" style={{ '--goal-progress': `${weightProgress * 3.6}deg` } as CSSProperties}><div><strong>{Math.round(weightProgress)}%</strong><span>tot doel</span></div></div>
      <div className="progress-hero__copy"><p className="eyebrow">Gewichtsdoel</p><h2>{trend.currentAverage ? trend.currentAverage.toFixed(1) : '—'} kg</h2><p><strong>{canonicalStartingWeight == null ? '—' : canonicalStartingWeight.toFixed(1)} kg</strong> start <span>→</span> <strong>{data.profile.goalWeightKg} kg</strong> doel</p><div className="pace-badge"><TrendingDown size={16} /> {weightMeasurementCount >= 2 && previousAvgWeight ? `${Math.abs(weightChange).toFixed(2)} kg/week` : 'Not enough data'} <span>verandering 7-daags gemiddelde</span></div></div>
      <div className="progress-hero__consistency"><span>Weekritme</span><strong>{consistency.percent}%</strong><p>{consistency.completed} of {consistency.due} due goals · {consistency.strength} strength sessions · {consistency.cardioMinutes} cardio min</p></div>
    </section>

    <section className="progress-metrics premium-metrics" hidden={progressTab !== 'overview'}>
      <article className="metric-card"><ToneIcon Icon={Scale} tone="blue" /><p>7-daags gemiddelde</p><strong>{trend.currentAverage ? trend.currentAverage.toFixed(1) : '—'} <small>kg</small></strong><span>Gemiddeld gewicht</span></article>
      <article className="metric-card"><ToneIcon Icon={TrendingDown} tone="lime" /><p>Verandering per week</p><strong>{weightMeasurementCount >= 2 && previousAvgWeight ? `${weightChange > 0 ? '+' : ''}${weightChange.toFixed(2)}` : '—'} <small>kg</small></strong><span>{weightMeasurementCount >= 2 && previousAvgWeight ? 'Compared with previous week' : 'Not enough data'}</span></article>
      <article className="metric-card"><ToneIcon Icon={Target} tone="amber" /><p>Krachttrainingen</p><strong>{completedWorkouts}<small> / {plannedWorkouts}</small></strong><span>Deze week</span></article>
      <article className="metric-card"><ToneIcon Icon={Award} tone="violet" /><p>Persoonlijke records</p><strong>{records.length}</strong><span>Records uit voltooide sets</span></article>
    </section>

    <section className="cut-proof-grid" hidden={progressTab !== 'overview'}>
      <article className="card cut-proof-summary"><div><p className="eyebrow">Werkt het?</p><h2>Val je af zonder kracht te verliezen?</h2></div><div className="cut-proof-signals"><span><small>Gewichtstempo</small><strong>{coachingInputs.weightPace.replaceAll('_', ' ')}</strong></span><span><small>Tailletrend</small><strong>{waistChange == null ? 'Needs data' : `${waistChange > 0 ? '+' : ''}${waistChange.toFixed(1)} cm`}</strong></span><span><small>Krachttrend</small><strong>{coachingInputs.overallStrength.replaceAll('_', ' ')}</strong></span><span><small>Trainingstrouw</small><strong>{coachingInputs.workoutAdherencePct == null ? 'Needs data' : `${Math.round(coachingInputs.workoutAdherencePct)}%`}</strong></span></div><p className="cut-proof-note">Gewicht en taille laten zien of je afvalt; vergelijkbare werksets laten zien of je kracht behoudt. Eén slechte training bepaalt nooit de trend.</p></article>
      <article className="card strength-retention"><div className="section-title"><div><h2>Krachtbehoud</h2></div><ToneIcon Icon={Dumbbell} tone="coral" /></div>{strengthTrends.length ? <div>{strengthTrends.map((item) => <span key={item.exerciseId}><strong>{item.exerciseName}</strong><small>{item.comparableSessions} comparable sessions</small><b className={item.state.includes('declining') ? 'declining' : ''}>{item.changePct == null ? '—' : `${item.changePct > 0 ? '+' : ''}${item.changePct.toFixed(1)}%`}</b></span>)}</div> : <div className="empty-state compact"><Dumbbell size={25} /><h3>Bouw een vergelijkbare trend op</h3><p>Doe dezelfde oefeningen met gewicht in minstens twee trainingen.</p></div>}</article>
    </section>

    <section className="progress-layout premium-progress-layout" hidden={progressTab !== 'overview'}>
      <article className="card consistency-card" hidden={progressTab !== 'overview'}><div className="section-title"><div><h2>Activiteitenkalender</h2></div><span>Last 28 days · {consistency.percent}% this week</span></div><div className="consistency-calendar">{consistencyDays.map((item) => <div key={item.date} className={`score-${item.score}`} title={`${prettyDate(item.date)} · ${item.workout ? 'Training ' : ''}${item.nutrition ? 'Voeding ' : ''}${item.cardio ? 'Cardio' : ''}`}><span>{new Date(`${item.date}T12:00:00`).getDate()}</span><i>{item.workout ? <Dumbbell size={10} /> : item.cardio ? <Activity size={10} /> : item.nutrition ? <Check size={10} /> : null}</i></div>)}</div><div className="consistency-key"><span><i className="low" /> Eén activiteit</span><span><i className="mid" /> Twee activiteiten</span><span><i className="high" /> Drie activiteiten</span></div></article>
    </section>

    <section className="trend-grid" hidden={progressTab !== 'training' && progressTab !== 'nutrition'}>
      {progressTab === 'training' ? <><article className="card trend-chart"><div className="section-title"><div><h2>Trainingsvolume per week</h2></div><ToneIcon Icon={Dumbbell} tone="coral" /></div><div className="small-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={volumeSeries} margin={{ left: 4, right: 16, top: 8, bottom: 4 }}><CartesianGrid stroke="rgba(139,161,171,.12)" vertical={false} /><XAxis dataKey="week" stroke="#778991" tickLine={false} axisLine={false} /><YAxis stroke="#778991" tickLine={false} axisLine={false} width={48} /><Tooltip contentStyle={CHART_TOOLTIP_STYLE} /><Bar dataKey="volume" name="Working-set volume (kg)" fill="#f08a78" radius={[6, 6, 0, 0]} animationDuration={500} /></BarChart></ResponsiveContainer></div><p className="chart-note">Volume = gewicht × herhalingen van voltooide werksets. Opwarmsets tellen niet mee.</p></article>
      <article className="card trend-chart"><div className="section-title"><div><h2>Cardiominuten</h2></div><ToneIcon Icon={Activity} tone="cyan" /></div><div className="small-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={cardioSeries} margin={{ left: 4, right: 16, top: 8, bottom: 4 }}><CartesianGrid stroke="rgba(139,161,171,.12)" vertical={false} /><XAxis dataKey="week" stroke="#778991" tickLine={false} axisLine={false} /><YAxis stroke="#778991" tickLine={false} axisLine={false} width={42} /><Tooltip contentStyle={CHART_TOOLTIP_STYLE} /><Bar dataKey="minutes" name="Cardiominuten" fill="#51c8d8" radius={[6, 6, 0, 0]} animationDuration={500} /></BarChart></ResponsiveContainer></div><p className="chart-note">Alleen gelogde cardio wordt getoond.</p></article></> : null}
      {progressTab === 'nutrition' ? <article className="card trend-chart nutrition-trend"><div className="section-title"><div><h2>Voedingsdoelen</h2></div><ToneIcon Icon={Target} tone="blue" /></div><div className="small-chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={nutritionSeries} margin={{ left: 4, right: 16, top: 8, bottom: 4 }}><CartesianGrid stroke="rgba(139,161,171,.12)" vertical={false} /><XAxis dataKey="date" stroke="#778991" tickLine={false} axisLine={false} minTickGap={18} /><YAxis domain={[0, 120]} stroke="#778991" tickLine={false} axisLine={false} width={42} /><Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(value) => value == null ? 'Niet gelogd' : `${value}%`} /><Line connectNulls={false} type="monotone" dataKey="protein" name="Protein target" stroke="#5caef6" strokeWidth={2.5} dot={false} /><Line connectNulls={false} type="monotone" dataKey="calories" name="Calorie target" stroke="#efb44c" strokeWidth={2.2} dot={false} /></LineChart></ResponsiveContainer></div><p className="chart-note">Percentage van elk doel op gelogde dagen. Niet-gelogde dagen blijven leeg.</p></article> : null}
    </section>

    <section className="lower-progress-grid premium-lower-grid" hidden={progressTab === 'body' || progressTab === 'nutrition'}>
      {progressTab === 'training' ? <article className="card exercise-history"><div className="section-title"><div><h2>Voortgang per oefening</h2></div>{exerciseIds.length ? <label><span className="sr-only">Exercise</span><select value={exerciseId} onChange={(event) => setExerciseId(event.target.value)}>{exerciseIds.map((id) => <option key={id} value={id}>{exerciseMap.get(id)?.name ?? 'Opgeslagen oefening'}</option>)}</select></label> : null}</div>
        {exerciseHistory.length ? <><div className="small-chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={exerciseHistory}><CartesianGrid stroke="rgba(139,161,171,.12)" vertical={false} /><XAxis dataKey="date" stroke="#778991" tickLine={false} axisLine={false} /><YAxis stroke="#778991" tickLine={false} axisLine={false} width={35} /><Tooltip contentStyle={CHART_TOOLTIP_STYLE} /><Line type="monotone" dataKey="weight" name="Best kg" stroke="#77d3b7" strokeWidth={3} dot={{ r: 4, fill: '#77d3b7' }} /></LineChart></ResponsiveContainer></div><div className="history-caption">Laatste beste: <strong>{exerciseHistory.at(-1)?.weight} kg × {exerciseHistory.at(-1)?.reps}</strong><span>Volume {Math.round(exerciseHistory.at(-1)?.volume ?? 0).toLocaleString()} kg</span></div></> : <div className="empty-state"><Dumbbell size={28} /><h3>Nog geen oefengegevens</h3><p>Voltooi een werkset met gewicht om deze grafiek te maken.</p></div>}
      </article> : null}

      <article className="card record-timeline" hidden={progressTab !== 'training'}><div className="section-title"><div><h2>Persoonlijke records</h2></div><ToneIcon Icon={Medal} tone="amber" /></div>{records.length ? <div>{records.slice(-5).reverse().map((record) => <article key={`${record.date}-${record.exerciseId}-${record.estimatedOneRepMax}`}><span><Trophy size={15} /></span><div><strong>{record.exerciseName}</strong><p>{record.weightKg} kg × {record.reps} · {prettyDate(record.date)}</p></div></article>)}</div> : <div className="empty-state compact"><Trophy size={26} /><h3>Nog geen persoonlijke records</h3><p>Voltooi werksets met gewicht om records bij te houden.</p></div>}</article>

      <article className="card milestone-card" hidden={progressTab !== 'overview'}><div className="section-title"><div><h2>Milestones</h2></div><ToneIcon Icon={Award} tone="lime" /></div><div>{milestones.map(({ label, reached, detail, Icon }) => <article className={reached ? 'reached' : ''} key={label}><span>{reached ? <Check size={16} /> : <Icon size={16} />}</span><div><strong>{label}</strong><small>{detail}</small></div></article>)}</div></article>

      <article className="card habits-card" hidden={progressTab !== 'overview'}><div className="section-title"><div><h2>Dagelijkse gewoontes</h2></div><span>{Object.values(habit).filter((value) => value === true).length} / 3</span></div>{[{ key: 'water' as const, label: 'Waterdoel', detail: 'Genoeg drinken helpt je prestaties', Icon: Droplets }, { key: 'walk' as const, label: 'Dagelijkse wandeling', detail: 'Lichte beweging', Icon: Footprints }, { key: 'sleep' as const, label: 'Genoeg slaap', detail: 'Herstel en minder trek', Icon: BedDouble }].map(({ key, label, detail, Icon }) => <button type="button" key={key} className={habit[key] ? 'done' : ''} onClick={() => updateHabit(today, { [key]: !habit[key] })}><span><Icon size={19} /></span><p><strong>{label}</strong><small>{detail}</small></p><i>{habit[key] ? <Check size={16} /> : null}</i></button>)}</article>
    </section>

    <article className="card weekly-review premium-review" hidden={progressTab !== 'overview'}><div className="section-title"><div><h2>Weekoverzicht</h2></div><span>{coachDecision.confidence} confidence</span></div><div className="review-table"><div><span>Gemiddeld gewicht</span><strong>{trend.currentAverage ? `${trend.currentAverage.toFixed(1)} kg` : '—'}</strong><small>{previousAvgWeight ? `vs ${previousAvgWeight.toFixed(1)} kg` : 'Not enough data'}</small></div><div><span>Gem. calorieën</span><strong>{loggedTotals.length ? `${Math.round(averageCalories).toLocaleString()} kcal` : '—'}</strong><small>{loggedTotals.length ? `Gemiddeld over ${loggedTotals.length} gelogde dagen · ${withinTarget} rond doel` : 'No fully logged meals this week'}</small></div><div><span>Gem. eiwit</span><strong>{loggedTotals.length ? `${Math.round(averageProtein)} g` : '—'}</strong><small>{loggedTotals.length ? `Gemiddeld over ${loggedTotals.length} gelogde dagen · ${proteinDays} op doel` : 'No fully logged meals this week'}</small></div><div><span>Training</span><strong>{completedWorkouts} / {plannedWorkouts}</strong><small>geplande trainingen</small></div></div><div className="weekly-coach"><Sparkles size={21} /><p><strong>{coachDecision.title}</strong>{coachDecision.explanation}</p></div></article>
  </div>;
}
