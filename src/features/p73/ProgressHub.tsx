import { lazy, Suspense, useMemo } from 'react';
import { CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from 'recharts';
import { Activity, Dumbbell, Target } from 'lucide-react';
import type { AppController } from '../../state/useAppData';
import type { Page } from '../../components/AppShell';
import type { SessionTemplateId } from '../../types/models';
import { PageSkeleton } from '../../components/Visuals';
import { toDateKey } from '../../lib/date';
import { updateMetabolicSettings } from '../../lib/project73/actions';
import { adherenceSummary, progressAssessment, targetRecommendation, weightOverview } from '../../lib/project73/selectors';
import { addDays, dayIndex, expectedWeightOn, mondayOf } from '../../lib/project73/weightTrend';
import { kg, nlNumber, shortDate } from '../../lib/project73/format';
import { getNutritionTotals } from '../../lib/selectors';
import { QuickWeight } from './DashboardPage';
import { Notice, Stat } from './ui';

const ProgressPage = lazy(() => import('../ProgressPage').then((module) => ({ default: module.ProgressPage })));
const WorkoutPage = lazy(() => import('../WorkoutPage').then((module) => ({ default: module.WorkoutPage })));
const CoachPage = lazy(() => import('../CoachPage').then((module) => ({ default: module.CoachPage })));

const TABS = [
  { id: 'overview', label: 'Overzicht' },
  { id: 'body', label: 'Lichaam & metingen' },
  { id: 'training', label: 'Training' },
  { id: 'coach', label: 'Weekcheck' },
];

function Overview({ controller }: { controller: AppController }) {
  const { data } = controller;
  const today = toDateKey();
  const overview = useMemo(() => weightOverview(data, today), [data, today]);
  const assessment = useMemo(() => progressAssessment(data, today), [data, today]);
  const adherence = useMemo(() => adherenceSummary(data, today, 21), [data, today]);
  const recommendation = useMemo(() => targetRecommendation(data, today), [data, today]);
  const { progress, trend, weekly } = overview;
  const planStart = data.activeGoal.startDate;
  const startKg = progress.startKg;

  const chartData = useMemo(() => {
    if (!trend.length || startKg == null) return [];
    const first = trend[0].date;
    const lastDate = overview.forecastDate && overview.forecastDate > today ? (dayIndex(overview.forecastDate) - dayIndex(today) > 120 ? addDays(today, 120) : overview.forecastDate) : addDays(today, 28);
    const points: Array<{ date: string; label: string; weight?: number; trend?: number; planned?: number }> = [];
    const byDate = new Map(trend.map((point) => [point.date, point]));
    for (let date = first; date <= lastDate; date = addDays(date, 1)) {
      const point = byDate.get(date);
      const planned = date >= planStart ? expectedWeightOn(date, planStart, startKg, overview.expectedKgPerWeek, data.profile.goalWeightKg) : undefined;
      if (point || date === lastDate || dayIndex(date) % 3 === 0) points.push({ date, label: shortDate(date), weight: point?.weightKg, trend: point?.trendKg, planned });
    }
    return points;
  }, [trend, startKg, overview.forecastDate, overview.expectedKgPerWeek, today, planStart, data.profile.goalWeightKg]);

  const lastWeeks = weekly.slice(-6).reverse();
  const calendarStart = mondayOf(addDays(today, -27));
  const weighed = new Set(trend.map((point) => point.date));
  const eatenDays = new Set(data.foodLog.map((entry) => entry.date));
  const strength28 = data.sessions.filter((session) => session.completedAt && session.date >= addDays(today, -28)).length;
  const eatenShare = adherence.plannedMeals ? Math.round((adherence.eatenMeals / adherence.plannedMeals) * 100) : null;
  const yValues = chartData.flatMap((point) => [point.weight, point.trend, point.planned]).filter((value): value is number => value != null);
  const yMin = Math.floor(Math.min(data.profile.goalWeightKg, ...yValues) - 1);
  const yMax = Math.ceil(Math.max(...yValues, data.profile.goalWeightKg + 1) + 0.5);

  return (
    <section className="page p73">
      <header className="p73-title">
        <div><p className="p73-kicker">Mijn voortgang</p><h1>{progress.currentKg != null ? `${kg(progress.currentKg)} · nog ${kg(progress.remainingKg)}` : 'Begin met wegen'}</h1><p>Trendgewicht vlakt water en maaltijden uit. Kijk naar de lijn, niet naar één dag.</p></div>
        <div style={{ minWidth: 260 }}><QuickWeight controller={controller} /></div>
      </header>

      <div className="stat-row">
        <Stat label="Start" value={kg(progress.startKg)} hint={shortDate(planStart)} />
        <Stat label="Nu (trend)" value={kg(progress.currentKg)} hint={progress.latestRawKg != null ? `laatste weging ${kg(progress.latestRawKg)}` : undefined} />
        <Stat label="Afgevallen" value={kg(Math.max(0, progress.lostKg))} hint={`${nlNumber(progress.percent)}% van je doel`} />
        <Stat label="Tempo (4 weken)" value={overview.rate28 ? `${nlNumber(overview.rate28.kgPerWeek, 2)} kg/wk` : '—'} hint={`gepland ${nlNumber(overview.expectedKgPerWeek, 2)} kg/wk`} />
        <Stat label="Verwacht op doel" value={overview.forecastDate ? shortDate(overview.forecastDate) : '—'} hint={overview.forecastBasis === 'observed' ? 'volgens je trend' : 'volgens je plan'} />
      </div>

      <div className="p73-grid">
        <article className="p73-card p73-span-8">
          <div className="p73-card-head"><div><h2>Gewicht en trend</h2><p>Punten zijn wegingen, de groene lijn je trend, de stippellijn je geplande tempo.</p></div></div>
          {chartData.length ? (
            <div className="chart-box">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
                  <CartesianGrid stroke="var(--line-soft)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: 'var(--muted)', fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={28} />
                  <YAxis domain={[yMin, yMax]} tick={{ fill: 'var(--muted)', fontSize: 11 }} tickLine={false} axisLine={false} width={46} />
                  <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 12, color: 'var(--text)' }} formatter={(value) => typeof value === 'number' ? `${nlNumber(value, 1)} kg` : value} />
                  <ReferenceLine y={data.profile.goalWeightKg} stroke="var(--accent)" strokeDasharray="4 4" label={{ value: `Doel ${data.profile.goalWeightKg} kg`, fill: 'var(--accent)', fontSize: 11, position: 'insideBottomRight' }} />
                  {progress.milestoneKg != null ? <ReferenceLine y={progress.milestoneKg} stroke="var(--muted-2)" strokeDasharray="2 6" label={{ value: `${progress.milestoneKg} kg`, fill: 'var(--muted)', fontSize: 11, position: 'insideTopRight' }} /> : null}
                  <Line type="monotone" dataKey="planned" name="Gepland" stroke="var(--blue)" strokeDasharray="6 5" dot={false} strokeWidth={1.5} connectNulls />
                  <Scatter dataKey="weight" name="Weging" fill="var(--muted)" />
                  <Line type="monotone" dataKey="trend" name="Trend" stroke="var(--accent)" strokeWidth={2.5} dot={false} connectNulls />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          ) : <div className="empty-p73"><Activity size={30} /><h3>Nog geen wegingen</h3><p>Weeg jezelf ’s ochtends; na een paar wegingen verschijnt je trend.</p></div>}
        </article>

        <aside className="p73-span-4 p73-stack" style={{ gap: 18, alignContent: 'start' }}>
          <div className="coach-box">
            <p className="p73-kicker" style={{ margin: 0 }}>Coach · betrouwbaarheid {assessment.confidence}</p>
            <h3>{assessment.title}</h3>
            <p>{assessment.message}</p>
            {assessment.actions.length ? <ul>{assessment.actions.map((action) => <li key={action}>{action}</li>)}</ul> : null}
            {assessment.calorieAdjustment ? (
              <div className="p73-stack" style={{ gap: 6 }}>
                <span className="muted small">{assessment.calorieAdjustment.reason}</span>
                <button type="button" className="p73-btn secondary small" onClick={() => controller.apply(updateMetabolicSettings({ overrides: { ...data.metabolicSettings.overrides, kcal: data.profile.calorieTarget + (assessment.calorieAdjustment?.deltaKcal ?? 0) } }, today))}>
                  <Target size={14} />Doel naar {nlNumber(data.profile.calorieTarget + assessment.calorieAdjustment.deltaKcal)} kcal
                </button>
              </div>
            ) : null}
          </div>
          <article className="p73-card">
            <h2>Afgelopen 3 weken</h2>
            <div className="stat-row" style={{ marginTop: 12 }}>
              <Stat label="Dagen met inname" value={`${adherence.daysWithIntake}/${adherence.windowDays}`} />
              <Stat label="Maaltijden gegeten" value={eatenShare != null ? `${eatenShare}%` : '—'} hint={adherence.plannedMeals ? `${adherence.eatenMeals} van ${adherence.plannedMeals}` : 'nog geen plan'} />
              <Stat label="Gem. inname" value={adherence.averageKcal != null ? `${nlNumber(adherence.averageKcal)} kcal` : '—'} hint={`doel ${nlNumber(data.profile.calorieTarget)}`} />
              <Stat label="Krachttraining" value={`${strength28}×`} hint="laatste 4 weken" />
            </div>
          </article>
        </aside>

        <article className="p73-card p73-span-6">
          <h2>Weekgemiddelden</h2>
          {lastWeeks.length ? (
            <ul className="diff-list" style={{ marginTop: 12 }}>
              {lastWeeks.map((week, index) => {
                const previous = lastWeeks[index + 1];
                const change = previous ? week.averageKg - previous.averageKg : null;
                const expected = startKg != null ? expectedWeightOn(addDays(week.weekStart, 3), planStart, startKg, recommendation.expectedKgPerWeek, data.profile.goalWeightKg) : null;
                return <li key={week.weekStart} className="keep"><span>Week van {shortDate(week.weekStart)} <span className="muted">({week.count}×)</span></span><b className="num">{kg(week.averageKg)}{change != null ? ` · ${change <= 0 ? '' : '+'}${nlNumber(change, 2)}` : ''}{expected != null && week.weekStart >= mondayOf(planStart) ? ` · plan ${kg(expected)}` : ''}</b></li>;
              })}
            </ul>
          ) : <p className="muted">Nog geen wegingen.</p>}
        </article>

        <article className="p73-card p73-span-6">
          <div className="p73-card-head"><div><h2>Kalender</h2><p>Blauw: gewogen · groene streep: inname bevestigd.</p></div><Dumbbell size={18} color="var(--muted)" /></div>
          <div className="calendar-grid">
            {['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'].map((day) => <b key={day}>{day}</b>)}
            {Array.from({ length: 35 }, (_, index) => addDays(calendarStart, index)).map((date) => (
              <span key={date} className={`${weighed.has(date) ? 'weighed' : ''} ${eatenDays.has(date) && getNutritionTotals(data, date).calories > 0 ? 'eaten' : ''} ${date === today ? 'today' : ''}`} title={date}>{Number(date.slice(8))}</span>
            ))}
          </div>
        </article>
      </div>
      {recommendation.warnings.some((warning) => warning.severity === 'warning') ? <Notice tone="warn" title="Let op je doelen">{recommendation.warnings.filter((warning) => warning.severity === 'warning').map((warning) => warning.message).join(' ')}</Notice> : null}
    </section>
  );
}

export function ProgressHub({ controller, tab, setTab, activeSessionId, setActiveSessionId, onStartWorkout }: {
  controller: AppController;
  tab: string;
  setTab: (tab: string) => void;
  activeSessionId: string | null;
  setActiveSessionId: (id: string | null) => void;
  onStartWorkout: (templateId: SessionTemplateId, date?: string) => void;
  navigate: (page: Page, sub?: string) => void;
}) {
  const nav = <div className="page" style={{ paddingBottom: 0, paddingTop: 28 }}><div className="subnav" role="tablist" aria-label="Voortgang">{TABS.map((item) => <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} className={tab === item.id ? 'active' : ''} onClick={() => setTab(item.id)}>{item.label}</button>)}</div></div>;
  return (
    <>
      {nav}
      {tab === 'overview' ? <Overview controller={controller} /> : null}
      <Suspense fallback={<PageSkeleton />}>
        {tab === 'body' ? <ProgressPage controller={controller} /> : null}
        {tab === 'training' ? <WorkoutPage controller={controller} activeSessionId={activeSessionId} setActiveSessionId={setActiveSessionId} onStartWorkout={onStartWorkout} /> : null}
        {tab === 'coach' ? <CoachPage controller={controller} /> : null}
      </Suspense>
    </>
  );
}
