import { useMemo, useState } from 'react';
import { Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { BedDouble, Check, CircleAlert, Droplets, Dumbbell, Footprints, Plus, Scale, Sparkles, Target, TrendingDown } from 'lucide-react';
import { exerciseMap } from '../data/exercises';
import { shiftDate, toDateKey } from '../lib/date';
import { average, weightTrend } from '../lib/progress';
import type { AppController } from '../state/useAppData';

interface ProgressPageProps { controller: AppController; }

export function ProgressPage({ controller }: ProgressPageProps) {
  const { data, saveWeight, totalsForDate, updateHabit } = controller;
  const [weightDate, setWeightDate] = useState(toDateKey());
  const [weight, setWeight] = useState(String(data.profile.currentWeightKg));
  const [exerciseId, setExerciseId] = useState('bench-press');
  const [saved, setSaved] = useState(false);
  const trend = weightTrend(data.weights);
  const today = toDateKey();
  const last7 = Array.from({ length: 7 }, (_, index) => shiftDate(today, index - 6));

  const chartData = useMemo(() => {
    const sorted = [...data.weights].sort((a, b) => a.date.localeCompare(b.date));
    return sorted.map((entry, index) => ({ date: entry.date.slice(5), weight: entry.weightKg, average: average(sorted.slice(Math.max(0, index - 6), index + 1).map((item) => item.weightKg)) }));
  }, [data.weights]);

  const currentTotals = last7.map(totalsForDate);
  const loggedTotals = currentTotals.filter((item) => item.calories > 0);
  const averageCalories = average(loggedTotals.map((item) => item.calories));
  const averageProtein = average(loggedTotals.map((item) => item.protein));
  const withinTarget = currentTotals.filter((item) => item.calories > 0 && item.calories <= data.profile.calorieTarget + 100).length;
  const proteinDays = currentTotals.filter((item) => item.protein >= data.profile.proteinTarget * 0.95).length;
  const completedWorkouts = data.sessions.filter((session) => session.completedAt && last7.includes(session.date)).length;
  const previousAvgWeight = trend.previousAverage;
  const weightChange = trend.weeklyChange;

  const weeklyCoach = weightChange <= -0.2 && weightChange >= -0.75 && completedWorkouts >= 2 && averageProtein >= data.profile.proteinTarget * 0.85
    ? `Good week. Your average weight decreased ${Math.abs(weightChange).toFixed(2)} kg, you completed ${completedWorkouts} workouts, and protein averaged ${Math.round(averageProtein)} g/day. Do not change calories.`
    : weightChange > -0.1 && averageCalories <= data.profile.calorieTarget + 100
      ? 'Weight is nearly flat while logged calories average near target. Keep the plan for one more week; reduce by 100–150 kcal only if accurate adherence and the stall continue.'
      : weightChange < -0.8
        ? 'Weight is falling quickly. Protect training quality and protein; an unnecessarily aggressive deficit can cost performance and lean mass.'
        : `This week is mixed. Keep calories near ${data.profile.calorieTarget} and make protein plus all three training sessions the priority.`;

  const exerciseHistory = data.sessions.filter((session) => session.completedAt).flatMap((session) => {
    const sets = session.sets.filter((set) => set.completed && set.exerciseId === exerciseId);
    if (!sets.length) return [];
    const best = sets.reduce((result, set) => set.weightKg > result.weightKg || (set.weightKg === result.weightKg && set.reps > result.reps) ? set : result, sets[0]);
    return [{ date: session.date.slice(5), weight: best.weightKg, reps: best.reps, volume: sets.reduce((sum, set) => sum + set.weightKg * set.reps, 0) }];
  });
  const habit = data.habits.find((entry) => entry.date === today) ?? { date: today, water: false, walk: false, sleep: false };
  const weightProgress = Math.max(0, Math.min(100, (data.profile.startWeightKg - trend.currentAverage) / (data.profile.startWeightKg - data.profile.goalWeightKg) * 100));
  const validWeight = Number(weight) > 30 && Number(weight) < 300;

  return <div className="page progress-page">
    <header className="page-header"><div><p className="eyebrow">Progress & review</p><h1>Read the trend.</h1><p>Daily noise matters less than weekly averages, adherence and gym performance.</p></div><form className="weight-entry" onSubmit={(event) => { event.preventDefault(); if (!validWeight) return; saveWeight(weightDate, Number(weight)); setSaved(true); window.setTimeout(() => setSaved(false), 1800); }}><label>Date<input type="date" value={weightDate} onChange={(event) => setWeightDate(event.target.value)} /></label><label>Body weight<div><input type="number" inputMode="decimal" step="0.1" min="30" max="300" value={weight} onChange={(event) => setWeight(event.target.value)} /><span>kg</span></div></label><button className="primary-button" type="submit" disabled={!validWeight}>{saved ? <Check size={18} /> : <Plus size={18} />}{saved ? 'Saved' : 'Log weight'}</button></form></header>

    <section className="progress-metrics">
      <article className="metric-card"><span className="metric-icon blue"><Scale size={19} /></span><p>7-day average</p><strong>{trend.currentAverage.toFixed(1)} <small>kg</small></strong><span>Current signal</span></article>
      <article className="metric-card"><span className="metric-icon lime"><TrendingDown size={19} /></span><p>Weekly trend</p><strong>{weightChange > 0 ? '+' : ''}{weightChange.toFixed(2)} <small>kg</small></strong><span>{weightChange <= -0.2 ? 'Productive rate' : 'Monitor'}</span></article>
      <article className="metric-card"><span className="metric-icon orange"><Target size={19} /></span><p>Goal progress</p><strong>{Math.round(weightProgress)}<small>%</small></strong><span>{Math.max(0, trend.currentAverage - data.profile.goalWeightKg).toFixed(1)} kg to goal</span></article>
      <article className="metric-card"><span className="metric-icon purple"><Dumbbell size={19} /></span><p>Training</p><strong>{completedWorkouts}<small> / 3</small></strong><span>Last 7 days</span></article>
    </section>

    <section className="progress-layout">
      <article className="card weight-chart-card"><div className="section-title"><div><p className="eyebrow">Body weight</p><h2>Rolling average leads</h2></div><span className="pill success"><TrendingDown size={14} /> {Math.abs(weightChange).toFixed(2)} kg / week</span></div>
        {chartData.length ? <div className="chart-area"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData} margin={{ left: -12, right: 8, top: 10, bottom: 0 }}><defs><linearGradient id="weightGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#b8f34a" stopOpacity={0.32} /><stop offset="100%" stopColor="#b8f34a" stopOpacity={0} /></linearGradient></defs><CartesianGrid stroke="#263029" vertical={false} /><XAxis dataKey="date" stroke="#738078" tickLine={false} axisLine={false} /><YAxis domain={['dataMin - 0.5', 'dataMax + 0.5']} stroke="#738078" tickLine={false} axisLine={false} width={48} /><Tooltip contentStyle={{ background: '#171c19', border: '1px solid #2b332e', borderRadius: 12 }} /><Area type="monotone" dataKey="average" name="7-day avg" stroke="#b8f34a" strokeWidth={3} fill="url(#weightGradient)" /><Line type="monotone" dataKey="weight" name="Daily" stroke="#657169" strokeWidth={1.5} dot={{ r: 3, fill: '#0c100e' }} /></AreaChart></ResponsiveContainer></div> : <div className="empty-state"><Scale size={30} /><h3>No weight entries</h3><p>Log your first weight to start the trend.</p></div>}
        <div className="chart-legend"><span><i className="solid" /> 7-day rolling average</span><span><i className="faint" /> Daily weigh-in</span></div>
      </article>

      <article className="card weekly-review"><div className="section-title"><div><p className="eyebrow">Weekly check-in</p><h2>Plan quality</h2></div><span>Last 7 days</span></div>
        <div className="review-table"><div><span>Weight average</span><strong>{trend.currentAverage.toFixed(1)} kg</strong><small>vs {previousAvgWeight.toFixed(1)} kg</small></div><div><span>Average calories</span><strong>{Math.round(averageCalories).toLocaleString()} kcal</strong><small>{withinTarget} days controlled</small></div><div><span>Average protein</span><strong>{Math.round(averageProtein)} g</strong><small>{proteinDays} days on target</small></div><div><span>Training</span><strong>{completedWorkouts} / 3</strong><small>planned sessions</small></div></div>
        <div className="weekly-coach"><Sparkles size={21} /><p><strong>Coach conclusion</strong>{weeklyCoach}</p></div>
      </article>
    </section>

    <section className="lower-progress-grid">
      <article className="card exercise-history"><div className="section-title"><div><p className="eyebrow">Exercise history</p><h2>Performance signal</h2></div><label><span className="sr-only">Exercise</span><select value={exerciseId} onChange={(event) => setExerciseId(event.target.value)}>{[...new Set(data.sessions.flatMap((session) => session.sets.map((set) => set.exerciseId)))].map((id) => <option key={id} value={id}>{exerciseMap.get(id)?.name}</option>)}</select></label></div>
        {exerciseHistory.length ? <><div className="small-chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={exerciseHistory}><CartesianGrid stroke="#263029" vertical={false} /><XAxis dataKey="date" stroke="#738078" tickLine={false} axisLine={false} /><YAxis stroke="#738078" tickLine={false} axisLine={false} width={35} /><Tooltip contentStyle={{ background: '#171c19', border: '1px solid #2b332e', borderRadius: 12 }} /><Line type="monotone" dataKey="weight" name="Best kg" stroke="#5ad7ff" strokeWidth={3} dot={{ r: 4, fill: '#5ad7ff' }} /></LineChart></ResponsiveContainer></div><div className="history-caption">Latest best: <strong>{exerciseHistory.at(-1)?.weight} kg × {exerciseHistory.at(-1)?.reps}</strong><span>Volume {Math.round(exerciseHistory.at(-1)?.volume ?? 0).toLocaleString()} kg</span></div></> : <div className="empty-state"><Dumbbell size={28} /><h3>No performance yet</h3><p>Complete this exercise in a workout to create a trend.</p></div>}
      </article>

      <article className="card habits-card"><div className="section-title"><div><p className="eyebrow">Today's support habits</p><h2>Keep the basics visible</h2></div><span>{Object.values(habit).filter((value) => value === true).length} / 3</span></div>
        {[{ key: 'water' as const, label: 'Water target', detail: 'Hydration supports performance', Icon: Droplets }, { key: 'walk' as const, label: 'Daily walk', detail: 'Low-fatigue activity', Icon: Footprints }, { key: 'sleep' as const, label: 'Sufficient sleep', detail: 'Recovery and appetite control', Icon: BedDouble }].map(({ key, label, detail, Icon }) => <button type="button" key={key} className={habit[key] ? 'done' : ''} onClick={() => updateHabit(today, { [key]: !habit[key] })}><span><Icon size={19} /></span><p><strong>{label}</strong><small>{detail}</small></p><i>{habit[key] ? <Check size={16} /> : null}</i></button>)}
        <p className="habit-note"><CircleAlert size={16} /> Nutrition and strength remain the plan. Habits only support them.</p>
      </article>
    </section>
  </div>;
}
