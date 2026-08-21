import { useEffect, useMemo, useState } from 'react';
import { Area, AreaChart, ResponsiveContainer, Tooltip } from 'recharts';
import { ArrowRight, CalendarDays, ChevronRight, Dumbbell, Flame, HeartPulse, Play, Scale, Sparkles, Target, TrendingDown, Utensils } from 'lucide-react';
import { ProgressRing } from '../components/ProgressRing';
import { MacroMeter, ToneIcon, WeekStrip, type WeekStripItem } from '../components/Visuals';
import type { Page } from '../components/AppShell';
import { exerciseMap } from '../data/exercises';
import { prettyDate, toDateKey } from '../lib/date';
import { displayWorkoutTitle } from '../lib/engagement';
import { weightTrend } from '../lib/progress';
import { rollingWeightSeries, weightHistory } from '../lib/bodyMeasurements';
import { plannerWarnings } from '../lib/adaptivePlanner';
import type { AppController } from '../state/useAppData';
import type { SessionTemplateId } from '../types/models';
import { getDashboardSummary } from '../lib/selectors';
import { greetingForHour } from '../lib/greeting';

interface HomePageProps { controller: AppController; setPage: (page: Page) => void; onStartWorkout: (templateId: SessionTemplateId, date?: string) => void; }

function weightSummary(measurementCount: number, currentAverage: number, previousAverage: number, weeklyChange: number) {
  if (measurementCount < 2 || !previousAverage) return { tone: 'focus', title: 'Not enough data yet', text: 'Add at least two weight measurements to calculate a trend.' };
  if (Math.abs(weeklyChange) < .05) return { tone: 'focus', title: 'Weight is stable', text: `Your seven-day average is ${currentAverage.toFixed(1)} kg, which is unchanged from the previous week. Keep the current targets and continue measuring.` };
  if (weeklyChange < 0) return { tone: 'positive', title: 'Average weight decreased', text: `Your seven-day average decreased by ${Math.abs(weeklyChange).toFixed(2)} kg from the previous week. Keep the current calorie target.` };
  return { tone: 'warning', title: 'Average weight increased', text: `Your seven-day average increased by ${weeklyChange.toFixed(2)} kg from the previous week. Keep logging accurately and review the next weekly average before changing targets.` };
}

export function HomePage({ controller, setPage, onStartWorkout }: HomePageProps) {
  const { data } = controller;
  const [currentHour, setCurrentHour] = useState(() => new Date().getHours());
  useEffect(() => {
    const timer = window.setInterval(() => setCurrentHour(new Date().getHours()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const today = toDateKey();
  const dashboard = useMemo(() => getDashboardSummary(data, today), [data, today]);
  const totals = dashboard.totals;
  const profile = data.profile;
  const trend = weightTrend(data.measurements);
  const todayName = new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(new Date()).toLowerCase();
  const activeSession = [...data.sessions].reverse().find((session) => !session.completedAt);
  const weekSnapshot = dashboard.training;
  const todayPlan = weekSnapshot.days.find((item) => item.date === today);
  const workoutDay = todayPlan?.day ?? data.program.find((day) => day.id === todayName) ?? data.program[0];
  const selectedTemplateId = todayPlan?.plan?.selectedSessionTemplateId ?? workoutDay.workoutId ?? 'cardio_recovery';
  const startWarnings = plannerWarnings(data, today, selectedTemplateId, todayPlan?.plan?.readinessResponse);
  const completedToday = !workoutDay.isRestDay && todayPlan?.status === 'completed';
  const cardioToday = data.cardioLog.filter((entry) => entry.date === today).reduce((sum, entry) => sum + entry.minutes, 0);
  const weightMeasurementCount = weightHistory(data.measurements).length;
  const coach = weightSummary(weightMeasurementCount, trend.currentAverage, trend.previousAverage, trend.weeklyChange);
  const caloriesRemaining = profile.calorieTarget - totals.calories;
  const proteinRemaining = profile.proteinTarget - totals.protein;
  const consistency = dashboard.weekly;
  const week = dashboard.planWeek;
  const score = dashboard.daily;
  const greeting = greetingForHour(currentHour);

  const weekItems: WeekStripItem[] = weekSnapshot.days.map((item) => {
    const dayName = new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(new Date(`${item.date}T12:00:00`)).toLowerCase();
    const workout = item.status === 'completed' && !item.day?.isRestDay;
    const nutrition = data.foodLog.some((entry) => entry.date === item.date);
    const cardio = item.cardioMinutes > 0;
    const signals = Number(workout) + Number(nutrition) + Number(cardio);
    return {
      date: item.date,
      day: dayName,
      status: workout ? (signals > 1 ? 'mixed' : 'workout') : cardio ? (nutrition ? 'mixed' : 'cardio') : item.status === 'upcoming' ? 'upcoming' : item.day?.isRestDay ? 'recovery' : nutrition ? 'nutrition' : 'workout',
      complete: item.status === 'completed',
      today: item.date === today,
      stateLabel: ({ completed: 'Completed', today: 'Today', upcoming: 'Upcoming', skipped: 'Skipped', missed: 'Missed', 'not-scheduled': 'Not scheduled' } as const)[item.status],
    };
  });

  const weightChart = useMemo(() => {
    return rollingWeightSeries(data.measurements).slice(-14).map((entry) => ({ date: entry.date.slice(5), average: entry.average }));
  }, [data.measurements]);

  const action = activeSession
    ? { label: 'Continue workout', Icon: Play, run: () => setPage('workout') }
    : !workoutDay.isRestDay && !completedToday
      ? startWarnings.length
        ? { label: `Review ${displayWorkoutTitle(workoutDay)}`, Icon: Flame, run: () => setPage('workout') }
        : { label: `Start ${displayWorkoutTitle(workoutDay)}`, Icon: Flame, run: () => onStartWorkout(selectedTemplateId, today) }
      : workoutDay.isRestDay
        ? { label: 'View today’s recovery', Icon: HeartPulse, run: () => setPage('workout') }
        : { label: 'Log your next meal', Icon: Utensils, run: () => setPage('food') };
  const ActionIcon = action.Icon;

  return <div className="page home-page premium-home">
    <section className="daily-command">
      <div className="daily-command__glow" aria-hidden="true" />
      <div className="daily-command__copy">
        <div className="daily-command__meta"><span>Week {week}</span><span>{prettyDate(today, true)}</span></div>
        <p className="eyebrow">Goal: {profile.goalWeightKg} kg</p>
        <h1>{greeting}, {profile.name}</h1>
        <p className="daily-objective">Today’s recommendation: <strong>{workoutDay.isRestDay ? displayWorkoutTitle(workoutDay).toLowerCase() : `${displayWorkoutTitle(workoutDay).toLowerCase()} with controlled effort`}</strong>. {todayPlan?.plan?.recommendationReason}</p>
        <button className="primary-button command-action" type="button" onClick={action.run}><ActionIcon size={19} /> {action.label}<ArrowRight size={18} /></button>
      </div>
      <div className="daily-score">
        <ProgressRing value={score.completed} max={Math.max(1, score.due)} size={188} valueLabel={`${score.completed}/${score.due}`} label="daily goals completed" tone="coral" />
        <p><strong>{score.status === 'in_progress' ? 'Today is in progress' : 'Today is finished'}</strong><span>{consistency.completed} of {consistency.due} due weekly goals completed</span></p>
        <details className="score-explanation"><summary>Daily goal checklist</summary><div>{score.goals.map((item) => <span key={item.id}><b>{item.label}</b><small>{!item.due ? 'Not due' : item.complete ? 'Done' : item.detail}</small></span>)}</div><p>The percentage is completed goals divided by visible due goals. Future goals are excluded.</p></details>
      </div>
    </section>

    <section className="command-grid">
      <article className="card calorie-command category-card calorie-tone">
        <div className="section-title"><div><h2>Calories</h2></div><ToneIcon Icon={Flame} tone="coral" /></div>
        <div className="calorie-command__body"><ProgressRing value={totals.calories} max={profile.calorieTarget} size={156} valueLabel={`${Math.round(totals.calories).toLocaleString()}`} label={`of ${profile.calorieTarget} kcal`} warning={caloriesRemaining < 0} tone="coral" /><div><strong className={caloriesRemaining < 0 ? 'text-warning' : ''}>{Math.abs(Math.round(caloriesRemaining)).toLocaleString()}<small> kcal</small></strong><span>{caloriesRemaining >= 0 ? 'remaining today' : 'over today’s target'}</span><button type="button" className="text-button" onClick={() => setPage('food')}>Open food diary <ChevronRight size={16} /></button></div></div>
      </article>

      <article className="card macro-command category-card nutrition-tone">
        <div className="section-title"><div><h2>Macros</h2></div><span>{Math.round(totals.calories)} kcal logged</span></div>
        <div className="macro-command__meters"><MacroMeter label="Protein" value={totals.protein} target={profile.proteinTarget} tone="blue" /><MacroMeter label="Carbohydrates" value={totals.carbs} target={profile.carbTarget} tone="amber" /><MacroMeter label="Fat" value={totals.fat} target={profile.fatTarget} tone="violet" /></div>
      </article>
    </section>

    <section className="week-card card">
      <div className="section-title"><div><h2>This week</h2></div><span>{consistency.percent}% · {consistency.completed} of {consistency.due} due goals</span></div>
      <WeekStrip items={weekItems} />
      <div className="week-legend"><span><i className="strength" /> Strength</span><span><i className="cardio" /> Cardio</span><span><i className="nutrition" /> Nutrition</span><span><i className="recovery" /> Recovery</span></div>
    </section>

    <section className="glance-section">
      <div className="glance-heading"><div><h2>Today</h2></div><span>{consistency.cardioMinutes} / {data.weeklyCardioTarget} cardio min this week</span></div>
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
        <div className="section-title"><div><p className="eyebrow">{workoutDay.isRestDay ? 'Today’s recovery' : 'Today’s workout'}</p><h2>{displayWorkoutTitle(workoutDay)}</h2></div><span className={`pill ${completedToday ? 'success' : workoutDay.isRestDay ? 'recovery' : ''}`}>{completedToday ? 'Completed' : workoutDay.isRestDay ? 'Recovery' : 'Planned'}</span></div>
        {workoutDay.isRestDay ? <div className="recovery-command"><HeartPulse size={28} /><div><strong>{workoutDay.cardioSuggestion}</strong><p>{workoutDay.recovery?.[0]}</p></div></div> : <div className="session-sequence">{workoutDay.exercises.slice(0, 4).map((item, index) => <div key={`${item.exerciseId}-${index}`}><span>{String(index + 1).padStart(2, '0')}</span><p>{exerciseMap.get(item.exerciseId)?.name}<small>{item.sets} × {item.repMin}–{item.repMax}</small></p></div>)}</div>}
        <button type="button" className="secondary-button full" onClick={() => setPage('workout')}>{workoutDay.isRestDay ? <HeartPulse size={18} /> : <Dumbbell size={18} />} Open full plan</button>
      </article>

      <article className="card mini-trend-card">
        <div className="section-title"><div><h2>Weight trend</h2></div><ToneIcon Icon={Scale} tone="blue" /></div>
        {weightMeasurementCount >= 2 ? <div className="mini-weight-chart" aria-label="Recent weight trend chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={weightChart} margin={{ top: 12, right: 4, left: 4, bottom: 0 }}><defs><linearGradient id="homeWeight" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#5caef6" stopOpacity={.38} /><stop offset="100%" stopColor="#5caef6" stopOpacity={0} /></linearGradient></defs><Tooltip contentStyle={{ background: '#111b20', border: '1px solid rgba(92,174,246,.25)', borderRadius: 12 }} labelFormatter={(label) => `Date ${label}`} /><Area type="monotone" dataKey="average" name="7-day average" stroke="#5caef6" strokeWidth={3} fill="url(#homeWeight)" animationDuration={500} /></AreaChart></ResponsiveContainer></div> : <div className="empty-state compact"><Scale size={25} /><h3>Not enough measurements yet</h3><p>Add at least two weight measurements to calculate a trend.</p></div>}
        <div className="trend-summary">{weightMeasurementCount >= 2 ? <><strong>{trend.currentAverage.toFixed(1)} kg</strong><span className={trend.weeklyChange <= 0 ? 'trend-down' : ''}><TrendingDown size={15} /> {trend.previousAverage ? `${Math.abs(trend.weeklyChange).toFixed(2)} kg / week` : 'More history needed'}</span></> : null}<button type="button" className="text-button" onClick={() => setPage('progress')}>View progress <ChevronRight size={16} /></button></div>
      </article>

      <article className={`coach-card premium-coach ${coach.tone}`}><div className="coach-orb"><Sparkles size={22} /></div><div><p className="eyebrow">Weight summary</p><h3>{coach.title}</h3><p>{coach.text}</p></div></article>
    </section>
  </div>;
}
