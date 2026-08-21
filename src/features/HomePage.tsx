import { useMemo } from 'react';
import { Area, AreaChart, ResponsiveContainer, Tooltip } from 'recharts';
import { ArrowRight, CalendarDays, ChevronRight, Dumbbell, Flame, HeartPulse, Play, Scale, Sparkles, Target, TrendingDown, Utensils } from 'lucide-react';
import { ProgressRing } from '../components/ProgressRing';
import { MacroMeter, ToneIcon, WeekStrip, type WeekStripItem } from '../components/Visuals';
import type { Page } from '../components/AppShell';
import { exerciseMap } from '../data/exercises';
import { prettyDate, toDateKey } from '../lib/date';
import { activePlanWeek, datesInWeek, displayWorkoutTitle, weeklyConsistency } from '../lib/engagement';
import { average, weightTrend } from '../lib/progress';
import type { AppController } from '../state/useAppData';
import type { WorkoutDay } from '../types/models';

interface HomePageProps { controller: AppController; setPage: (page: Page) => void; onStartWorkout: (dayId: WorkoutDay['id']) => void; }

function coachMessage(calories: number, protein: number, calorieTarget: number, proteinTarget: number, weeklyChange: number) {
  const remaining = calorieTarget - calories;
  const proteinRemaining = proteinTarget - protein;
  const hour = new Date().getHours();
  if (remaining < 0) return { tone: 'warning', title: 'Return to the normal plan', text: `Today is ${Math.round(Math.abs(remaining))} kcal over target. There is no need to compensate aggressively tomorrow—resume the usual target and keep logging accurately.` };
  if (hour >= 16 && proteinRemaining > 45) return { tone: 'focus', title: 'Protein is today’s best next move', text: `${Math.round(proteinRemaining)} g remains. A lean protein-led meal can close the gap without crowding the calorie target.` };
  if (weeklyChange > -0.05) return { tone: 'focus', title: 'Let the trend develop', text: 'The seven-day average is nearly flat. Keep logging consistently and only adjust if the same signal continues next week.' };
  return { tone: 'positive', title: 'The trend is moving forward', text: 'Weight is trending toward the goal while the plan remains manageable. Keep the next action simple and repeatable.' };
}

export function HomePage({ controller, setPage, onStartWorkout }: HomePageProps) {
  const { data, totalsForDate } = controller;
  const today = toDateKey();
  const totals = totalsForDate(today);
  const profile = data.profile;
  const trend = weightTrend(data.weights);
  const todayName = new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(new Date()).toLowerCase();
  const workoutDay = data.program.find((day) => day.id === todayName) ?? data.program[0];
  const activeSession = [...data.sessions].reverse().find((session) => !session.completedAt);
  const completedToday = !workoutDay.isRestDay && data.sessions.some((session) => session.date === today && session.dayId === workoutDay.id && session.completedAt);
  const cardioToday = data.cardioLog.filter((entry) => entry.date === today).reduce((sum, entry) => sum + entry.minutes, 0);
  const coach = coachMessage(totals.calories, totals.protein, profile.calorieTarget, profile.proteinTarget, trend.weeklyChange);
  const caloriesRemaining = profile.calorieTarget - totals.calories;
  const proteinRemaining = profile.proteinTarget - totals.protein;
  const consistency = weeklyConsistency(data, today);
  const week = activePlanWeek(data.weights, today);
  const nutritionLogged = totals.calories > 0;
  const sessionScore = workoutDay.isRestDay ? Math.min(30, cardioToday / Math.max(1, workoutDay.cardioTargetMinutes ?? 30) * 30) : completedToday ? 30 : activeSession ? 12 : 0;
  const dailyScore = Math.round(Math.min(100,
    (nutritionLogged ? 25 : 0) +
    Math.min(25, totals.protein / Math.max(1, profile.proteinTarget) * 25) +
    sessionScore +
    (nutritionLogged && totals.calories <= profile.calorieTarget * 1.05 ? 20 : 0),
  ));

  const weekItems: WeekStripItem[] = datesInWeek(today).map((date) => {
    const dayName = new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(new Date(`${date}T12:00:00`)).toLowerCase();
    const planned = data.program.find((item) => item.id === dayName);
    const workout = data.sessions.some((session) => session.date === date && session.completedAt);
    const nutrition = data.foodLog.some((entry) => entry.date === date);
    const cardio = data.cardioLog.some((entry) => entry.date === date);
    const signals = Number(workout) + Number(nutrition) + Number(cardio);
    return {
      date,
      day: dayName,
      status: workout ? (signals > 1 ? 'mixed' : 'workout') : cardio ? (nutrition ? 'mixed' : 'cardio') : planned?.isRestDay ? 'recovery' : nutrition ? 'nutrition' : date > today ? 'upcoming' : 'workout',
      complete: workout || cardio || (nutrition && Boolean(planned?.isRestDay)),
      today: date === today,
    };
  });

  const weightChart = useMemo(() => {
    const sorted = [...data.weights].sort((a, b) => a.date.localeCompare(b.date)).slice(-14);
    return sorted.map((entry, index) => ({ date: entry.date.slice(5), average: average(sorted.slice(Math.max(0, index - 6), index + 1).map((item) => item.weightKg)) }));
  }, [data.weights]);

  const action = activeSession
    ? { label: 'Continue workout', Icon: Play, run: () => setPage('workout') }
    : !workoutDay.isRestDay && !completedToday
      ? { label: `Start ${displayWorkoutTitle(workoutDay)}`, Icon: Flame, run: () => onStartWorkout(workoutDay.id) }
      : workoutDay.isRestDay
        ? { label: 'View today’s recovery', Icon: HeartPulse, run: () => setPage('workout') }
        : { label: 'Log your next meal', Icon: Utensils, run: () => setPage('food') };
  const ActionIcon = action.Icon;

  return <div className="page home-page premium-home">
    <section className="daily-command">
      <div className="daily-command__glow" aria-hidden="true" />
      <div className="daily-command__copy">
        <div className="daily-command__meta"><span>Plan week {week}</span><span>{prettyDate(today, true)}</span></div>
        <p className="eyebrow">Daily command center</p>
        <h1>Good morning, {profile.name}.</h1>
        <p className="daily-objective">Today’s objective: <strong>{workoutDay.isRestDay ? 'recover, move, and stay consistent' : `${displayWorkoutTitle(workoutDay).toLowerCase()} with controlled effort`}</strong>.</p>
        <button className="primary-button command-action" type="button" onClick={action.run}><ActionIcon size={19} /> {action.label}<ArrowRight size={18} /></button>
      </div>
      <div className="daily-score">
        <ProgressRing value={dailyScore} max={100} size={188} valueLabel={`${dailyScore}%`} label="today complete" tone="coral" />
        <p><strong>{consistency.percent}% weekly consistency</strong><span>{consistency.strength} of {consistency.plannedStrength} strength sessions complete</span></p>
      </div>
    </section>

    <section className="command-grid">
      <article className="card calorie-command category-card calorie-tone">
        <div className="section-title"><div><p className="eyebrow">Energy budget</p><h2>Calories</h2></div><ToneIcon Icon={Flame} tone="coral" /></div>
        <div className="calorie-command__body"><ProgressRing value={totals.calories} max={profile.calorieTarget} size={156} valueLabel={`${Math.round(totals.calories).toLocaleString()}`} label={`of ${profile.calorieTarget} kcal`} warning={caloriesRemaining < 0} tone="coral" /><div><strong className={caloriesRemaining < 0 ? 'text-warning' : ''}>{Math.abs(Math.round(caloriesRemaining)).toLocaleString()}<small> kcal</small></strong><span>{caloriesRemaining >= 0 ? 'remaining today' : 'over today’s target'}</span><button type="button" className="text-button" onClick={() => setPage('food')}>Open food diary <ChevronRight size={16} /></button></div></div>
      </article>

      <article className="card macro-command category-card nutrition-tone">
        <div className="section-title"><div><p className="eyebrow">Macro targets</p><h2>Fuel balance</h2></div><span>{Math.round(totals.calories)} kcal logged</span></div>
        <div className="macro-command__meters"><MacroMeter label="Protein" value={totals.protein} target={profile.proteinTarget} tone="blue" /><MacroMeter label="Carbohydrates" value={totals.carbs} target={profile.carbTarget} tone="amber" /><MacroMeter label="Fat" value={totals.fat} target={profile.fatTarget} tone="violet" /></div>
      </article>
    </section>

    <section className="week-card card">
      <div className="section-title"><div><p className="eyebrow">This week</p><h2>Consistency, not perfection</h2></div><span>{consistency.percent}% complete</span></div>
      <WeekStrip items={weekItems} />
      <div className="week-legend"><span><i className="strength" /> Strength</span><span><i className="cardio" /> Cardio</span><span><i className="nutrition" /> Nutrition</span><span><i className="recovery" /> Recovery</span></div>
    </section>

    <section className="glance-section">
      <div className="glance-heading"><div><p className="eyebrow">Today at a glance</p><h2>The signals that matter</h2></div><span>{consistency.cardioMinutes} / {data.weeklyCardioTarget} cardio min this week</span></div>
      <div className="glance-grid">
        <article className="glance-card calories"><ToneIcon Icon={Flame} tone="coral" /><div><span>Calories remaining</span><strong>{Math.max(0, Math.round(caloriesRemaining)).toLocaleString()}<small> kcal</small></strong></div></article>
        <article className="glance-card protein"><ToneIcon Icon={Target} tone="blue" /><div><span>Protein remaining</span><strong>{Math.max(0, Math.round(proteinRemaining))}<small> g</small></strong></div></article>
        <article className="glance-card training"><ToneIcon Icon={workoutDay.isRestDay ? HeartPulse : Dumbbell} tone={workoutDay.isRestDay ? 'teal' : 'coral'} /><div><span>{workoutDay.isRestDay ? 'Recovery today' : 'Training today'}</span><strong>{displayWorkoutTitle(workoutDay)}</strong><small>{workoutDay.duration}</small></div></article>
        <article className="glance-card cardio"><ToneIcon Icon={HeartPulse} tone="cyan" /><div><span>Cardio today</span><strong>{cardioToday}<small> min</small></strong><small>{workoutDay.cardioTargetMinutes ? `${Math.max(0, workoutDay.cardioTargetMinutes - cardioToday)} min planned` : 'Short walks still count'}</small></div></article>
        <article className="glance-card adherence"><ToneIcon Icon={CalendarDays} tone="lime" /><div><span>Weekly adherence</span><strong>{consistency.percent}<small>%</small></strong><small>{consistency.nutritionDays} nutrition days logged</small></div></article>
      </div>
    </section>

    <section className="home-lower-grid">
      <article className="card today-session-card">
        <div className="section-title"><div><p className="eyebrow">{workoutDay.isRestDay ? 'Recovery plan' : 'Training sequence'}</p><h2>{displayWorkoutTitle(workoutDay)}</h2></div><span className={`pill ${completedToday ? 'success' : workoutDay.isRestDay ? 'recovery' : ''}`}>{completedToday ? 'Completed' : workoutDay.isRestDay ? 'Recovery' : 'Programmed'}</span></div>
        {workoutDay.isRestDay ? <div className="recovery-command"><HeartPulse size={28} /><div><strong>{workoutDay.cardioSuggestion}</strong><p>{workoutDay.recovery?.[0]}</p></div></div> : <div className="session-sequence">{workoutDay.exercises.slice(0, 4).map((item, index) => <div key={`${item.exerciseId}-${index}`}><span>{String(index + 1).padStart(2, '0')}</span><p>{exerciseMap.get(item.exerciseId)?.name}<small>{item.sets} × {item.repMin}–{item.repMax}</small></p></div>)}</div>}
        <button type="button" className="secondary-button full" onClick={() => setPage('workout')}>{workoutDay.isRestDay ? <HeartPulse size={18} /> : <Dumbbell size={18} />} Open full plan</button>
      </article>

      <article className="card mini-trend-card">
        <div className="section-title"><div><p className="eyebrow">Recent weight</p><h2>Trend, not noise</h2></div><ToneIcon Icon={Scale} tone="blue" /></div>
        {weightChart.length ? <div className="mini-weight-chart" aria-label="Recent weight trend chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={weightChart} margin={{ top: 12, right: 4, left: 4, bottom: 0 }}><defs><linearGradient id="homeWeight" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#5caef6" stopOpacity={.38} /><stop offset="100%" stopColor="#5caef6" stopOpacity={0} /></linearGradient></defs><Tooltip contentStyle={{ background: '#111b20', border: '1px solid rgba(92,174,246,.25)', borderRadius: 12 }} labelFormatter={(label) => `Date ${label}`} /><Area type="monotone" dataKey="average" name="7-day average" stroke="#5caef6" strokeWidth={3} fill="url(#homeWeight)" animationDuration={500} /></AreaChart></ResponsiveContainer></div> : <div className="empty-state compact"><Scale size={25} /><h3>No weight trend yet</h3><p>Log a first measurement to create this chart.</p></div>}
        <div className="trend-summary"><strong>{trend.currentAverage ? `${trend.currentAverage.toFixed(1)} kg` : '—'}</strong><span className={trend.weeklyChange <= 0 ? 'trend-down' : ''}><TrendingDown size={15} /> {Math.abs(trend.weeklyChange).toFixed(2)} kg / week</span><button type="button" className="text-button" onClick={() => setPage('progress')}>View progress <ChevronRight size={16} /></button></div>
      </article>

      <article className={`coach-card premium-coach ${coach.tone}`}><div className="coach-orb"><Sparkles size={22} /></div><div><p className="eyebrow">Coach read</p><h3>{coach.title}</h3><p>{coach.text}</p></div></article>
    </section>
  </div>;
}
