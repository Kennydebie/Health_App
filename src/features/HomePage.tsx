import { ArrowRight, CalendarDays, Check, ChevronRight, Clock3, Dumbbell, Flame, HeartPulse, Scale, Sparkles, Target, TrendingDown } from 'lucide-react';
import { ProgressRing } from '../components/ProgressRing';
import type { Page } from '../components/AppShell';
import { exerciseMap } from '../data/exercises';
import { prettyDate, toDateKey } from '../lib/date';
import { weightTrend } from '../lib/progress';
import type { AppController } from '../state/useAppData';
import type { WorkoutDay } from '../types/models';

interface HomePageProps { controller: AppController; setPage: (page: Page) => void; onStartWorkout: (dayId: WorkoutDay['id']) => void; }

function coachMessage(calories: number, protein: number, calorieTarget: number, proteinTarget: number, weeklyChange: number) {
  const remaining = calorieTarget - calories;
  const proteinRemaining = proteinTarget - protein;
  const hour = new Date().getHours();
  if (remaining < 0) return { tone: 'warning', title: 'Calories exceeded', text: `You are ${Math.round(Math.abs(remaining))} kcal over target today. Do not compensate with extreme restriction tomorrow—return to your normal target and tighten logging.` };
  if (hour >= 16 && proteinRemaining > 45) return { tone: 'focus', title: 'Protein needs attention', text: `You have ${Math.round(remaining)} kcal left but still need ${Math.round(proteinRemaining)} g protein. Prioritize chicken, skyr, tuna or whey tonight.` };
  if (weeklyChange > -0.05) return { tone: 'focus', title: 'Watch the trend', text: 'Your 7-day average is nearly flat. Keep logging accurately; adjust only if this continues for a second week.' };
  if (remaining < 350) return { tone: 'warning', title: 'Spend carefully', text: `Only ${Math.round(remaining)} kcal remain. Choose a lean protein and avoid calorie-dense grazing tonight.` };
  return { tone: 'positive', title: 'Cut is on track', text: 'Weight is trending down while calories and training remain controlled. Keep dinner protein-led and do not change the plan.' };
}

export function HomePage({ controller, setPage, onStartWorkout }: HomePageProps) {
  const { data, totalsForDate } = controller;
  const today = toDateKey();
  const totals = totalsForDate(today);
  const profile = data.profile;
  const trend = weightTrend(data.weights);
  const workoutDay = data.program.find((day) => {
    const todayName = new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(new Date()).toLowerCase();
    return day.id === todayName;
  }) ?? data.program[0];
  const completedToday = !workoutDay.isRestDay && data.sessions.some((session) => session.date === today && session.dayId === workoutDay.id && session.completedAt);
  const coach = coachMessage(totals.calories, totals.protein, profile.calorieTarget, profile.proteinTarget, trend.weeklyChange);
  const caloriesRemaining = profile.calorieTarget - totals.calories;
  const proteinRemaining = profile.proteinTarget - totals.protein;
  const macroCalories = Math.max(1, totals.protein * 4 + totals.carbs * 4 + totals.fat * 9);
  const proteinStop = totals.protein * 4 / macroCalories * 100;
  const carbsStop = proteinStop + totals.carbs * 4 / macroCalories * 100;

  return (
    <div className="page home-page">
      <header className="page-header home-header">
        <div><p className="eyebrow">{prettyDate(today, true)}</p><h1>Good morning, {profile.name}.</h1><p>One clear job today: hit protein, control calories, train with intent.</p></div>
        <div className="header-status"><span className="status-dot" /> Plan active · Week 4</div>
      </header>

      <section className="hero-grid">
        <article className="calorie-hero">
          <div className="calorie-hero__image" />
          <div className="calorie-hero__content">
            <div><p className="eyebrow">Today's fuel</p><h2>{Math.round(totals.calories).toLocaleString()} <span>/ {profile.calorieTarget.toLocaleString()} kcal</span></h2><p className={caloriesRemaining < 0 ? 'text-warning' : ''}>{Math.abs(Math.round(caloriesRemaining))} kcal {caloriesRemaining >= 0 ? 'remaining' : 'over target'}</p></div>
            <ProgressRing value={totals.calories} max={profile.calorieTarget} valueLabel={`${Math.round((totals.calories / profile.calorieTarget) * 100)}%`} label="daily target" warning={caloriesRemaining < 0} />
          </div>
          <button type="button" className="hero-action" onClick={() => setPage('food')}>Log food <ArrowRight size={18} /></button>
        </article>

        <article className="protein-card card">
          <div className="card-heading"><span className="metric-icon lime"><Target size={19} /></span><div><p className="eyebrow">Muscle insurance</p><h3>Protein</h3></div></div>
          <strong className="metric-number">{Math.round(totals.protein)}<small> / {profile.proteinTarget}g</small></strong>
          <div className="segmented-progress" aria-label={`${Math.round(totals.protein)} of ${profile.proteinTarget} grams protein`}><span style={{ width: `${Math.min(100, totals.protein / profile.proteinTarget * 100)}%` }} /></div>
          <p>{proteinRemaining > 0 ? `${Math.round(proteinRemaining)} g left—make the next meal count.` : 'Target secured. Muscle retention supported.'}</p>
          <button type="button" className="text-button" onClick={() => setPage('food')}>View protein sources <ChevronRight size={17} /></button>
        </article>
      </section>

      <section className="dashboard-grid">
        <article className="card macro-card">
          <div className="section-title"><div><p className="eyebrow">Fuel split</p><h3>Macro balance</h3></div><span>{Math.round(totals.calories)} kcal</span></div>
          <div className="macro-chart-wrap">
            <div className="macro-chart"><div className="macro-donut" style={{ background: `conic-gradient(var(--lime) 0 ${proteinStop}%, var(--blue) ${proteinStop}% ${carbsStop}%, var(--orange) ${carbsStop}% 100%)` }} /><span>Today</span></div>
            <div className="macro-list">
              {[['Protein', totals.protein, profile.proteinTarget, 'lime'], ['Carbs', totals.carbs, profile.carbTarget, 'blue'], ['Fat', totals.fat, profile.fatTarget, 'orange']].map(([label, value, target, color]) => <div key={String(label)}><span><i className={String(color)} />{label}</span><strong>{Math.round(Number(value))} <small>/ {target}g</small></strong></div>)}
            </div>
          </div>
        </article>

        <article className="card workout-today">
          <div className="section-title"><div><p className="eyebrow">{workoutDay.isRestDay ? "Today's recovery" : "Today's training"}</p><h3>{workoutDay.title}</h3></div><span className={completedToday ? 'pill success' : `pill ${workoutDay.isRestDay ? 'recovery' : ''}`}>{completedToday ? 'Completed' : workoutDay.isRestDay ? 'Rest day' : 'Programmed'}</span></div>
          {workoutDay.isRestDay ? <><div className="workout-meta"><span><HeartPulse size={16} /> No lifting today</span><span><Clock3 size={16} /> Recovery is part of the plan</span></div><div className="exercise-preview recovery-preview">{workoutDay.recovery?.slice(0, 3).map((item) => <div key={item}><span><Check size={14} /></span><p>{item}</p></div>)}</div><button type="button" className="primary-button" onClick={() => setPage('workout')}><CalendarDays size={18} /> View weekly schedule</button></> : <><div className="workout-meta"><span><Clock3 size={16} /> {workoutDay.duration}</span><span><Dumbbell size={16} /> {workoutDay.exercises.length} exercises</span></div><div className="exercise-preview">{workoutDay.exercises.slice(0, 4).map((item, index) => <div key={item.exerciseId}><span>{String(index + 1).padStart(2, '0')}</span><p>{exerciseMap.get(item.exerciseId)?.name}<small>{item.sets} × {item.repMin}–{item.repMax}</small></p></div>)}</div><button type="button" className="primary-button" onClick={() => completedToday ? setPage('workout') : onStartWorkout(workoutDay.id)}>{completedToday ? <Check size={18} /> : <Flame size={18} />}{completedToday ? 'View workout' : 'Start workout'}</button></>}
        </article>

        <article className="card weight-card">
          <div className="section-title"><div><p className="eyebrow">Body-weight trend</p><h3>Moving correctly</h3></div><span className="metric-icon blue"><Scale size={19} /></span></div>
          <div className="weight-numbers"><strong>{trend.currentAverage.toFixed(1)}<small> kg</small></strong><span className="trend-down"><TrendingDown size={16} /> {Math.abs(trend.weeklyChange).toFixed(2)} kg / week</span></div>
          <div className="weight-track"><span style={{ width: `${Math.min(100, Math.max(0, ((profile.startWeightKg - trend.currentAverage) / (profile.startWeightKg - profile.goalWeightKg)) * 100))}%` }} /></div>
          <div className="weight-labels"><span>Started {profile.startWeightKg} kg</span><span>Goal {profile.goalWeightKg} kg</span></div>
          <button type="button" className="text-button" onClick={() => setPage('progress')}>Open weight trend <ChevronRight size={17} /></button>
        </article>

        <article className={`coach-card ${coach.tone}`}>
          <div className="coach-orb"><Sparkles size={22} /></div><div><p className="eyebrow">Coach read</p><h3>{coach.title}</h3><p>{coach.text}</p></div>
        </article>
      </section>
    </div>
  );
}
