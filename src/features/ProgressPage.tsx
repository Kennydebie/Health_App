import { useState, type CSSProperties } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Activity, Award, BedDouble, Check, CircleAlert, Droplets, Dumbbell, Footprints, Medal, Plus, Scale, Sparkles, Target, TrendingDown, Trophy } from 'lucide-react';
import { ToneIcon } from '../components/Visuals';
import { FitDaysImport } from './FitDaysImport';
import { exerciseMap } from '../data/exercises';
import { datesInWeek, getWeekSnapshot, personalRecordEvents, weeklyConsistency, weeklyVolumeSeries } from '../lib/engagement';
import { prettyDate, shiftDate, toDateKey } from '../lib/date';
import { average, weightTrend } from '../lib/progress';
import { formatMeasurementTimestamp } from '../lib/fitdays';
import type { AppController } from '../state/useAppData';

interface ProgressPageProps { controller: AppController; }
type Range = '4w' | '3m' | 'all';
type ProgressTab = 'overview' | 'body' | 'training' | 'nutrition';

const CHART_TOOLTIP_STYLE = { background: '#101a20', border: '1px solid rgba(116, 140, 151, .28)', borderRadius: 12, color: '#f6f2ed' };

export function ProgressPage({ controller }: ProgressPageProps) {
  const { data, saveWeight, totalsForDate, updateHabit } = controller;
  const [weightDate, setWeightDate] = useState(toDateKey());
  const [weight, setWeight] = useState(String(data.profile.currentWeightKg));
  const exerciseIds = [...new Set(data.sessions.flatMap((session) => session.sets.map((set) => set.exerciseId)))];
  const [exerciseId, setExerciseId] = useState(exerciseIds[0] ?? 'bench-press');
  const [range, setRange] = useState<Range>('4w');
  const [saved, setSaved] = useState(false);
  const [progressTab, setProgressTab] = useState<ProgressTab>(() => (localStorage.getItem('cut-forward-progress-tab') as ProgressTab | null) ?? 'overview');
  const trend = weightTrend(data.weights);
  const today = toDateKey();
  const last7 = datesInWeek(today);
  const rangeStart = range === '4w' ? shiftDate(today, -27) : range === '3m' ? shiftDate(today, -89) : '0000-01-01';

  const sortedWeights = [...data.weights].sort((a, b) => a.date.localeCompare(b.date));
  const measurementHistory = [...data.bodyMeasurements].sort((a, b) => (b.timestamp ?? b.createdAt).localeCompare(a.timestamp ?? a.createdAt));
  const chartData = sortedWeights.map((entry, index) => ({ date: entry.date, label: entry.date.slice(5), weight: entry.weightKg, average: average(sortedWeights.slice(Math.max(0, index - 6), index + 1).map((item) => item.weightKg)) })).filter((entry) => entry.date >= rangeStart);

  const currentTotals = last7.map(totalsForDate);
  const loggedTotals = currentTotals.filter((item) => item.calories > 0);
  const averageCalories = average(loggedTotals.map((item) => item.calories));
  const averageProtein = average(loggedTotals.map((item) => item.protein));
  const withinTarget = currentTotals.filter((item) => item.calories > 0 && item.calories <= data.profile.calorieTarget + 100).length;
  const proteinDays = currentTotals.filter((item) => item.protein >= data.profile.proteinTarget * .95).length;
  const weekSnapshot = getWeekSnapshot(data, today);
  const completedWorkouts = weekSnapshot.completedStrength;
  const allCompletedWorkouts = data.sessions.filter((session) => session.completedAt).length;
  const plannedWorkouts = weekSnapshot.plannedStrength;
  const previousAvgWeight = trend.previousAverage;
  const weightChange = trend.weeklyChange;
  const consistency = weeklyConsistency(data, today);
  const records = personalRecordEvents(data.sessions);
  const volumeSeries = weeklyVolumeSeries(data.sessions, today, 6);

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

  const weeklyCoach = weightChange <= -.2 && weightChange >= -.75 && completedWorkouts >= 2 && averageProtein >= data.profile.proteinTarget * .85
    ? `Your average weight decreased ${Math.abs(weightChange).toFixed(2)} kg, you completed ${completedWorkouts} workouts, and protein averaged ${Math.round(averageProtein)} g/day. Keep the current calorie target.`
    : weightChange > -.1 && averageCalories <= data.profile.calorieTarget + 100
      ? 'Weight is nearly flat while logged calories average near target. Keep the plan for one more week before considering a small adjustment.'
      : weightChange < -.8
        ? 'Weight is falling quickly. Protect training quality and protein; a faster rate is not automatically better.'
        : `Keep calories near ${data.profile.calorieTarget} and make protein plus the planned strength sessions the priority.`;

  const exerciseHistory = data.sessions.filter((session) => session.completedAt).flatMap((session) => {
    const sets = session.sets.filter((set) => set.completed && !set.isWarmup && set.exerciseId === exerciseId);
    if (!sets.length) return [];
    const best = sets.reduce((result, set) => set.weightKg > result.weightKg || (set.weightKg === result.weightKg && set.reps > result.reps) ? set : result, sets[0]);
    return [{ date: session.date.slice(5), weight: best.weightKg, reps: best.reps, volume: sets.reduce((sum, set) => sum + set.weightKg * set.reps, 0) }];
  });
  const habit = data.habits.find((entry) => entry.date === today) ?? { date: today, water: false, walk: false, sleep: false };
  const denominator = data.profile.startWeightKg - data.profile.goalWeightKg;
  const weightProgress = denominator ? Math.max(0, Math.min(100, (data.profile.startWeightKg - trend.currentAverage) / denominator * 100)) : 0;
  const validWeight = Number(weight) > 30 && Number(weight) < 300;
  const lostKg = Math.max(0, data.profile.startWeightKg - trend.currentAverage);
  const milestones = [
    { label: 'First five workouts', reached: allCompletedWorkouts >= 5, detail: `${Math.min(allCompletedWorkouts, 5)} / 5 completed`, Icon: Dumbbell },
    { label: 'First 2 kg toward goal', reached: lostKg >= 2, detail: `${lostKg.toFixed(1)} / 2.0 kg`, Icon: Scale },
    { label: 'First personal record', reached: records.length > 0, detail: records.length ? `${records.length} real performance signals` : 'Complete a loaded exercise', Icon: Trophy },
  ];

  const selectProgressTab = (tab: ProgressTab) => { setProgressTab(tab); localStorage.setItem('cut-forward-progress-tab', tab); };

  return <div className="page progress-page premium-progress">
    <header className="page-header"><div><p className="eyebrow">Progress & review</p><h1>Proof of consistency.</h1><p>Measurements, training and nutrition shown as actual records—with trends clearly separated from daily values.</p></div><form className="weight-entry" onSubmit={(event) => { event.preventDefault(); if (!validWeight) return; saveWeight(weightDate, Number(weight)); setSaved(true); window.setTimeout(() => setSaved(false), 1800); }}><label>Date<input type="date" value={weightDate} onChange={(event) => setWeightDate(event.target.value)} /></label><label>Body weight<div><input type="number" inputMode="decimal" step="0.1" min="30" max="300" value={weight} onChange={(event) => setWeight(event.target.value)} /><span>kg</span></div></label><button className="primary-button" type="submit" disabled={!validWeight}>{saved ? <Check size={18} /> : <Plus size={18} />}{saved ? 'Saved' : 'Log weight'}</button></form></header>

    <nav className="progress-tabs" aria-label="Progress sections">{(['overview', 'body', 'training', 'nutrition'] as const).map((tab) => <button type="button" key={tab} aria-selected={progressTab === tab} className={progressTab === tab ? 'active' : ''} onClick={() => selectProgressTab(tab)}>{tab.charAt(0).toUpperCase() + tab.slice(1)}</button>)}</nav>

    {progressTab === 'body' ? <FitDaysImport controller={controller} /> : null}

    <section className="progress-hero card" hidden={progressTab !== 'overview' && progressTab !== 'body'}>
      <div className="goal-orbit" style={{ '--goal-progress': `${weightProgress * 3.6}deg` } as CSSProperties}><div><strong>{Math.round(weightProgress)}%</strong><span>to goal</span></div></div>
      <div className="progress-hero__copy"><p className="eyebrow">Project 75 journey</p><h2>{trend.currentAverage ? trend.currentAverage.toFixed(1) : '—'} kg</h2><p><strong>{data.profile.startWeightKg} kg</strong> start <span>→</span> <strong>{data.profile.goalWeightKg} kg</strong> goal</p><div className="pace-badge"><TrendingDown size={16} /> {Math.abs(weightChange).toFixed(2)} kg/week <span>seven-day average pace</span></div></div>
      <div className="progress-hero__consistency"><span>Weekly consistency</span><strong>{consistency.percent}%</strong><p>{consistency.strength} of {consistency.plannedStrength} strength sessions · {consistency.cardioMinutes} cardio min</p></div>
    </section>

    <section className="progress-metrics premium-metrics" hidden={progressTab !== 'overview'}>
      <article className="metric-card"><ToneIcon Icon={Scale} tone="blue" /><p>7-day average</p><strong>{trend.currentAverage ? trend.currentAverage.toFixed(1) : '—'} <small>kg</small></strong><span>Trend estimate</span></article>
      <article className="metric-card"><ToneIcon Icon={TrendingDown} tone="lime" /><p>Weekly pace</p><strong>{weightChange > 0 ? '+' : ''}{weightChange.toFixed(2)} <small>kg</small></strong><span>{weightChange <= -.2 ? 'Moving toward goal' : 'Still developing'}</span></article>
      <article className="metric-card"><ToneIcon Icon={Target} tone="amber" /><p>Strength sessions</p><strong>{completedWorkouts}<small> / {plannedWorkouts}</small></strong><span>This week</span></article>
      <article className="metric-card"><ToneIcon Icon={Award} tone="violet" /><p>Personal records</p><strong>{records.length}</strong><span>Actual set improvements</span></article>
    </section>

    <section className="progress-layout premium-progress-layout" hidden={progressTab !== 'overview' && progressTab !== 'body'}>
      {progressTab === 'body' ? <article className="card weight-chart-card"><div className="section-title"><div><p className="eyebrow">Body weight</p><h2>Daily readings + rolling trend</h2></div><div className="range-toggle" aria-label="Weight chart range">{([['4w', '4 weeks'], ['3m', '3 months'], ['all', 'All time']] as const).map(([id, label]) => <button type="button" key={id} className={range === id ? 'active' : ''} onClick={() => setRange(id)}>{label}</button>)}</div></div>
        {chartData.length ? <div className="chart-area"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData} margin={{ left: 8, right: 20, top: 12, bottom: 8 }}><defs><linearGradient id="weightGradientPremium" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#5caef6" stopOpacity={.38} /><stop offset="100%" stopColor="#5caef6" stopOpacity={0} /></linearGradient></defs><CartesianGrid stroke="rgba(139,161,171,.14)" vertical={false} /><XAxis dataKey="label" stroke="#778991" tickLine={false} axisLine={false} minTickGap={22} /><YAxis domain={['dataMin - 0.5', 'dataMax + 0.5']} stroke="#778991" tickLine={false} axisLine={false} width={54} tickFormatter={(value) => Number(value).toFixed(1)} /><Tooltip contentStyle={CHART_TOOLTIP_STYLE} labelFormatter={(_, payload) => payload?.[0]?.payload?.date ? prettyDate(payload[0].payload.date) : ''} /><Area type="monotone" dataKey="average" name="7-day average" stroke="#5caef6" strokeWidth={3} fill="url(#weightGradientPremium)" animationDuration={500} /><Line type="monotone" dataKey="weight" name="Daily measurement" stroke="#84969d" strokeWidth={1.4} dot={{ r: 2.5, fill: '#101a20' }} /></AreaChart></ResponsiveContainer></div> : <div className="empty-state"><Scale size={30} /><h3>No measurements in this range</h3><p>Log a weight or choose a longer time range.</p></div>}
        <div className="chart-legend"><span><i className="solid" /> Seven-day rolling average</span><span><i className="faint" /> Actual measurement</span></div>
      </article> : null}

      {progressTab === 'body' ? <article className="card measurement-history"><div className="section-title"><div><p className="eyebrow">Measurement history</p><h2>Saved body composition</h2></div><span>{measurementHistory.length} FitDays {measurementHistory.length === 1 ? 'entry' : 'entries'}</span></div>
        {measurementHistory.length ? <div className="measurement-history-list">{measurementHistory.slice(0, 8).map((measurement) => <article key={measurement.id}><span className="measurement-source"><Sparkles size={15} /></span><div><strong>{formatMeasurementTimestamp(measurement.timestamp)}</strong><small>FitDays AI screenshot</small></div><dl><div><dt>Weight</dt><dd>{measurement.weightKg == null ? '—' : `${measurement.weightKg} kg`}</dd></div><div><dt>Body fat</dt><dd>{measurement.bodyFatPercent == null ? '—' : `${measurement.bodyFatPercent}%`}</dd></div><div><dt>Muscle</dt><dd>{measurement.muscleMassKg == null ? '—' : `${measurement.muscleMassKg} kg`}</dd></div><div><dt>Water</dt><dd>{measurement.bodyWaterPercent == null ? '—' : `${measurement.bodyWaterPercent}%`}</dd></div></dl></article>)}</div> : <div className="empty-state compact"><Scale size={28} /><h3>No FitDays measurements yet</h3><p>Import a screenshot above. You will review every value before it appears here.</p></div>}
      </article> : null}

      <article className="card consistency-card" hidden={progressTab !== 'overview'}><div className="section-title"><div><p className="eyebrow">Last 28 days</p><h2>Consistency calendar</h2></div><span>{consistency.percent}% to date</span></div><div className="consistency-calendar">{consistencyDays.map((item) => <div key={item.date} className={`score-${item.score}`} title={`${prettyDate(item.date)} · ${item.workout ? 'Workout ' : ''}${item.nutrition ? 'Nutrition ' : ''}${item.cardio ? 'Cardio' : ''}`}><span>{new Date(`${item.date}T12:00:00`).getDate()}</span><i>{item.workout ? <Dumbbell size={10} /> : item.cardio ? <Activity size={10} /> : item.nutrition ? <Check size={10} /> : null}</i></div>)}</div><div className="consistency-key"><span><i className="low" /> One signal</span><span><i className="mid" /> Two signals</span><span><i className="high" /> Three signals</span></div></article>
    </section>

    <section className="trend-grid" hidden={progressTab !== 'training' && progressTab !== 'nutrition'}>
      {progressTab === 'training' ? <><article className="card trend-chart"><div className="section-title"><div><p className="eyebrow">Strength work</p><h2>Weekly training volume</h2></div><ToneIcon Icon={Dumbbell} tone="coral" /></div><div className="small-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={volumeSeries} margin={{ left: 4, right: 16, top: 8, bottom: 4 }}><CartesianGrid stroke="rgba(139,161,171,.12)" vertical={false} /><XAxis dataKey="week" stroke="#778991" tickLine={false} axisLine={false} /><YAxis stroke="#778991" tickLine={false} axisLine={false} width={48} /><Tooltip contentStyle={CHART_TOOLTIP_STYLE} /><Bar dataKey="volume" name="Working-set volume (kg)" fill="#f08a78" radius={[6, 6, 0, 0]} animationDuration={500} /></BarChart></ResponsiveContainer></div><p className="chart-note">Volume is the sum of completed working-set load × repetitions. Warm-ups are excluded.</p></article>
      <article className="card trend-chart"><div className="section-title"><div><p className="eyebrow">Conditioning</p><h2>Cardio minutes</h2></div><ToneIcon Icon={Activity} tone="cyan" /></div><div className="small-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={cardioSeries} margin={{ left: 4, right: 16, top: 8, bottom: 4 }}><CartesianGrid stroke="rgba(139,161,171,.12)" vertical={false} /><XAxis dataKey="week" stroke="#778991" tickLine={false} axisLine={false} /><YAxis stroke="#778991" tickLine={false} axisLine={false} width={42} /><Tooltip contentStyle={CHART_TOOLTIP_STYLE} /><Bar dataKey="minutes" name="Cardio minutes" fill="#51c8d8" radius={[6, 6, 0, 0]} animationDuration={500} /></BarChart></ResponsiveContainer></div><p className="chart-note">Only cardio you logged is shown.</p></article></> : null}
      {progressTab === 'nutrition' ? <article className="card trend-chart nutrition-trend"><div className="section-title"><div><p className="eyebrow">Nutrition adherence</p><h2>Target completion</h2></div><ToneIcon Icon={Target} tone="blue" /></div><div className="small-chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={nutritionSeries} margin={{ left: 4, right: 16, top: 8, bottom: 4 }}><CartesianGrid stroke="rgba(139,161,171,.12)" vertical={false} /><XAxis dataKey="date" stroke="#778991" tickLine={false} axisLine={false} minTickGap={18} /><YAxis domain={[0, 120]} stroke="#778991" tickLine={false} axisLine={false} width={42} /><Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(value) => value == null ? 'Not logged' : `${value}%`} /><Line connectNulls={false} type="monotone" dataKey="protein" name="Protein target" stroke="#5caef6" strokeWidth={2.5} dot={false} /><Line connectNulls={false} type="monotone" dataKey="calories" name="Calorie target" stroke="#efb44c" strokeWidth={2.2} dot={false} /></LineChart></ResponsiveContainer></div><p className="chart-note">Percent of each target on logged days. Unlogged days are gaps, never zero.</p></article> : null}
    </section>

    <section className="lower-progress-grid premium-lower-grid" hidden={progressTab === 'body' || progressTab === 'nutrition'}>
      {progressTab === 'training' ? <article className="card exercise-history"><div className="section-title"><div><p className="eyebrow">Exercise history</p><h2>Performance signal</h2></div>{exerciseIds.length ? <label><span className="sr-only">Exercise</span><select value={exerciseId} onChange={(event) => setExerciseId(event.target.value)}>{exerciseIds.map((id) => <option key={id} value={id}>{exerciseMap.get(id)?.name ?? 'Saved exercise'}</option>)}</select></label> : null}</div>
        {exerciseHistory.length ? <><div className="small-chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={exerciseHistory}><CartesianGrid stroke="rgba(139,161,171,.12)" vertical={false} /><XAxis dataKey="date" stroke="#778991" tickLine={false} axisLine={false} /><YAxis stroke="#778991" tickLine={false} axisLine={false} width={35} /><Tooltip contentStyle={CHART_TOOLTIP_STYLE} /><Line type="monotone" dataKey="weight" name="Best kg" stroke="#77d3b7" strokeWidth={3} dot={{ r: 4, fill: '#77d3b7' }} /></LineChart></ResponsiveContainer></div><div className="history-caption">Latest best: <strong>{exerciseHistory.at(-1)?.weight} kg × {exerciseHistory.at(-1)?.reps}</strong><span>Volume {Math.round(exerciseHistory.at(-1)?.volume ?? 0).toLocaleString()} kg</span></div></> : <div className="empty-state"><Dumbbell size={28} /><h3>No performance yet</h3><p>Complete a loaded working set to create this chart.</p></div>}
      </article> : null}

      <article className="card record-timeline" hidden={progressTab !== 'training'}><div className="section-title"><div><p className="eyebrow">Personal records</p><h2>Earned improvements</h2></div><ToneIcon Icon={Medal} tone="amber" /></div>{records.length ? <div>{records.slice(-5).reverse().map((record) => <article key={`${record.date}-${record.exerciseId}-${record.estimatedOneRepMax}`}><span><Trophy size={15} /></span><div><strong>{record.exerciseName}</strong><p>{record.weightKg} kg × {record.reps} · {prettyDate(record.date)}</p></div></article>)}</div> : <div className="empty-state compact"><Trophy size={26} /><h3>No personal records yet</h3><p>Records appear only when a completed set improves the previous performance estimate.</p></div>}</article>

      <article className="card milestone-card" hidden={progressTab !== 'overview'}><div className="section-title"><div><p className="eyebrow">Meaningful milestones</p><h2>Progress worth noticing</h2></div><ToneIcon Icon={Award} tone="lime" /></div><div>{milestones.map(({ label, reached, detail, Icon }) => <article className={reached ? 'reached' : ''} key={label}><span>{reached ? <Check size={16} /> : <Icon size={16} />}</span><div><strong>{label}</strong><small>{detail}</small></div></article>)}</div></article>

      <article className="card habits-card" hidden={progressTab !== 'overview'}><div className="section-title"><div><p className="eyebrow">Today’s support habits</p><h2>Keep the basics visible</h2></div><span>{Object.values(habit).filter((value) => value === true).length} / 3</span></div>{[{ key: 'water' as const, label: 'Water target', detail: 'Hydration supports performance', Icon: Droplets }, { key: 'walk' as const, label: 'Daily walk', detail: 'Low-fatigue activity', Icon: Footprints }, { key: 'sleep' as const, label: 'Sufficient sleep', detail: 'Recovery and appetite control', Icon: BedDouble }].map(({ key, label, detail, Icon }) => <button type="button" key={key} className={habit[key] ? 'done' : ''} onClick={() => updateHabit(today, { [key]: !habit[key] })}><span><Icon size={19} /></span><p><strong>{label}</strong><small>{detail}</small></p><i>{habit[key] ? <Check size={16} /> : null}</i></button>)}<p className="habit-note"><CircleAlert size={16} /> Habits support the plan; they are not a score of personal worth.</p></article>
    </section>

    <article className="card weekly-review premium-review" hidden={progressTab !== 'overview'}><div className="section-title"><div><p className="eyebrow">Weekly check-in</p><h2>What the records say</h2></div><span>Current week</span></div><div className="review-table"><div><span>Weight average</span><strong>{trend.currentAverage.toFixed(1)} kg</strong><small>vs {previousAvgWeight.toFixed(1)} kg</small></div><div><span>Average calories</span><strong>{Math.round(averageCalories).toLocaleString()} kcal</strong><small>Average across {loggedTotals.length} logged days · {withinTarget} near target</small></div><div><span>Average protein</span><strong>{Math.round(averageProtein)} g</strong><small>Average across {loggedTotals.length} logged days · {proteinDays} on target</small></div><div><span>Training</span><strong>{completedWorkouts} / {plannedWorkouts}</strong><small>planned sessions</small></div></div><div className="weekly-coach"><Sparkles size={21} /><p><strong>Coach conclusion</strong>{weeklyCoach}</p></div></article>
  </div>;
}
