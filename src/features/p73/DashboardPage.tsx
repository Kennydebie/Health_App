import { useMemo, useState } from 'react';
import { ArrowRight, CalendarDays, Check, ChefHat, Dumbbell, Scale, ShoppingBasket, Sparkles } from 'lucide-react';
import { isStrengthTemplate, sessionOption } from '../../lib/adaptivePlanner';
import type { SessionTemplateId } from '../../types/models';
import type { AppController } from '../../state/useAppData';
import type { ShoppingController } from '../../state/useShopping';
import type { Page } from '../../components/AppShell';
import { toDateKey } from '../../lib/date';
import { acceptSuggestedTargets, createPlan, dismissUpgradeNotice, recalculateTargets } from '../../lib/project73/actions';
import { actualDayTotals, mealsOn, plannedDayTotals, plannedDaysAhead, progressAssessment, weightOverview } from '../../lib/project73/selectors';
import { dayLabel, euro, kg, longDate, nlNumber, shortDate } from '../../lib/project73/format';
import { MealRow } from './MealRow';
import { Notice, Stat, TargetBar } from './ui';

function greeting(hour: number) {
  if (hour < 6) return 'Goedenacht';
  if (hour < 12) return 'Goedemorgen';
  if (hour < 18) return 'Goedemiddag';
  return 'Goedenavond';
}

export function QuickWeight({ controller, compact = false }: { controller: AppController; compact?: boolean }) {
  const [value, setValue] = useState('');
  const [saved, setSaved] = useState(false);
  const numeric = Number(value.replace(',', '.'));
  const valid = numeric >= 30 && numeric <= 300;
  return (
    <form className="p73-row" onSubmit={(event) => {
      event.preventDefault();
      if (!valid) return;
      const today = toDateKey();
      controller.saveWeight(today, Math.round(numeric * 10) / 10);
      controller.apply(recalculateTargets(today));
      setValue('');
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2000);
    }}>
      <label className="p73-field" style={{ flex: 1, minWidth: 130 }}>
        {compact ? null : 'Gewicht van vandaag'}
        <input inputMode="decimal" placeholder="bijv. 84,9" value={value} onChange={(event) => setValue(event.target.value)} aria-label="Gewicht in kilogram" />
      </label>
      <button type="submit" className="p73-btn primary" disabled={!valid} style={{ alignSelf: 'end' }}>{saved ? <Check size={16} /> : <Scale size={16} />}{saved ? 'Opgeslagen' : 'Weeg'}</button>
    </form>
  );
}

export function DashboardPage({ controller, shopping, navigate, onStartWorkout }: { controller: AppController; shopping: ShoppingController; navigate: (page: Page, sub?: string) => void; onStartWorkout: (templateId: SessionTemplateId, date?: string) => void }) {
  const { data } = controller;
  const today = toDateKey();
  const overview = useMemo(() => weightOverview(data, today), [data, today]);
  const assessment = useMemo(() => progressAssessment(data, today), [data, today]);
  const meals = mealsOn(data, today);
  const planned = plannedDayTotals(data, today);
  const actual = actualDayTotals(data, today);
  const daysAhead = plannedDaysAhead(data, today);
  const { progress } = overview;
  const notice = data.upgradeNotice && !data.upgradeNotice.dismissed ? data.upgradeNotice : null;
  const training = data.trainingPlanner.dailyPlans.find((plan) => plan.date === today);
  const trainingToday = training && training.status !== 'completed' && isStrengthTemplate(training.selectedSessionTemplateId) ? sessionOption(data.program, training.selectedSessionTemplateId) : null;
  const statusTone = assessment.tone === 'on_track' ? 'good' : assessment.tone === 'insufficient_data' ? 'info' : 'warn';
  const span = progress.startKg != null ? Math.max(0.1, progress.startKg - progress.targetKg) : 1;
  const milestonePosition = progress.startKg != null && progress.milestoneKg != null && progress.milestoneKg < progress.startKg ? ((progress.startKg - progress.milestoneKg) / span) * 100 : null;
  const shoppingSummary = data.shoppingStatus;
  const connection = shopping.status?.connection?.status;
  const picnicLabel = shopping.status?.mode === 'mock' ? 'Demo-modus' : connection === 'connected' ? 'Gekoppeld' : connection === 'expired' ? 'Opnieuw inloggen' : connection === 'pending_2fa' ? 'Wacht op sms-code' : shopping.signedOut ? 'Log in om te koppelen' : 'Niet gekoppeld';

  const planMeals = () => {
    const hasFuturePlan = daysAhead.length > 0;
    if (hasFuturePlan && !window.confirm('Je huidige plan wordt vervangen. Gegeten en vastgezette maaltijden blijven staan. Doorgaan?')) return;
    controller.apply(createPlan(today, data.planningPreferences.horizonDays, today));
    navigate('plan', 'plan');
  };

  return (
    <section className="page p73">
      <header className="p73-title">
        <div>
          <p className="p73-kicker">{longDate(today)}</p>
          <h1>{greeting(new Date().getHours())}, {data.profile.name}</h1>
        </div>
        <div className="p73-row">
          <button type="button" className="p73-btn secondary" onClick={planMeals}><ChefHat size={17} />Plan mijn maaltijden</button>
          <button type="button" className="p73-btn primary" onClick={() => navigate('shopping', 'prepare')} disabled={!daysAhead.length}><ShoppingBasket size={17} />Bereid boodschappen voor</button>
        </div>
      </header>

      {notice ? (
        <div className="p73-card fade-in" style={{ borderColor: 'color-mix(in srgb, var(--accent) 35%, transparent)' }}>
          <div className="p73-card-head"><div><p className="p73-kicker">Welkom bij Project 73</p><h2>Je app is bijgewerkt</h2></div><Sparkles size={22} color="var(--accent)" /></div>
          <ul style={{ margin: '0 0 14px', paddingLeft: 18, color: 'var(--muted)', lineHeight: 1.6, fontSize: 14 }}>{notice.changes.map((change) => <li key={change}>{change}</li>)}</ul>
          <div className="p73-row">
            {notice.pendingTargets ? <button type="button" className="p73-btn primary" onClick={() => controller.apply(acceptSuggestedTargets(today))}>Gebruik nieuwe doelen ({nlNumber(notice.pendingTargets.kcal)} kcal · {notice.pendingTargets.protein} g eiwit)</button> : null}
            <button type="button" className="p73-btn secondary" onClick={() => controller.apply(dismissUpgradeNotice())}>{notice.pendingTargets ? 'Mijn eigen doelen houden' : 'Begrepen'}</button>
          </div>
        </div>
      ) : null}

      <article className="p73-card weight-hero">
        <div className="weight-hero__now">
          <p className="p73-kicker">Huidig gewicht</p>
          <div className="big">{progress.currentKg != null ? nlNumber(progress.currentKg, 1) : '—'}<small>kg</small></div>
          <p>{progress.latestRawKg != null && progress.currentKg != null && Math.abs(progress.latestRawKg - progress.currentKg) >= 0.1 ? `Laatste weging ${kg(progress.latestRawKg)} · trend ${kg(progress.currentKg)}` : progress.currentKg == null ? 'Weeg jezelf om je startpunt vast te leggen.' : 'Trendgewicht: dagelijkse schommelingen zijn uitgevlakt.'}</p>
          <span className={`pill ${statusTone}`} style={{ justifySelf: 'start' }}>{assessment.title}</span>
          <QuickWeight controller={controller} compact />
        </div>
        <div className="weight-hero__side">
          <div className="journey" aria-label={`Voortgang ${nlNumber(progress.percent)} procent`}>
            <div className="journey__track">
              <div className="journey__fill" style={{ width: `${progress.percent}%` }} />
              {milestonePosition != null ? <div className="journey__tick" style={{ left: `${milestonePosition}%` }}><span>{progress.milestoneReached ? '✓ ' : ''}{progress.milestoneKg} kg</span></div> : null}
            </div>
            <div className="journey__labels"><span>Start {kg(progress.startKg)}</span><span>Doel {kg(progress.targetKg, 0)}</span></div>
          </div>
          <div className="stat-row">
            <Stat label="Afgevallen" value={progress.currentKg != null ? kg(Math.max(0, progress.lostKg)) : '—'} />
            <Stat label="Nog te gaan" value={kg(progress.remainingKg)} />
            <Stat label="Voortgang" value={`${nlNumber(progress.percent)}%`} />
            <Stat label="Verwachte doeldatum" value={overview.forecastDate ? shortDate(overview.forecastDate) : '—'} hint={overview.forecastBasis === 'observed' ? 'op basis van je trend' : overview.forecastBasis === 'planned' ? 'volgens je plan (schatting)' : 'nog onbekend'} />
          </div>
          <p className="muted small" style={{ margin: 0 }}>{assessment.message}</p>
        </div>
      </article>

      <div className="p73-grid">
        <article className="p73-card p73-span-7">
          <div className="p73-card-head">
            <div><h2>Wat eet ik vandaag?</h2><p>{meals.length ? `Gepland ${nlNumber(planned.kcal)} kcal en ${nlNumber(planned.protein)} g eiwit.` : 'Nog geen maaltijden gepland voor vandaag.'}</p></div>
            <button type="button" className="p73-btn ghost small" onClick={() => navigate('plan', 'plan')}>Plan <ArrowRight size={14} /></button>
          </div>
          {meals.length ? <div className="meal-list">{meals.map((meal) => <MealRow key={meal.id} meal={meal} controller={controller} onOpen={() => navigate('plan', 'plan')} />)}</div> : (
            <div className="empty-p73"><ChefHat size={30} /><h3>Laat de app je maaltijden plannen</h3><p>Eén klik voor {data.planningPreferences.horizonDays} dagen eten dat past bij {nlNumber(data.profile.calorieTarget)} kcal en {data.profile.proteinTarget} g eiwit.</p><button type="button" className="p73-btn primary" onClick={planMeals}>Plan mijn maaltijden</button></div>
          )}
        </article>

        <div className="p73-span-5 p73-stack" style={{ gap: 18 }}>
          <article className="p73-card">
            <div className="p73-card-head"><div><h2>Voeding vandaag</h2><p>Dagdoel {nlNumber(data.profile.calorieTarget)} kcal · {data.profile.proteinTarget} g eiwit</p></div></div>
            <div className="target-bars">
              <TargetBar label="Gepland · calorieën" value={planned.kcal} target={data.profile.calorieTarget} unit="kcal" />
              <TargetBar label="Gepland · eiwit" value={planned.protein} target={data.profile.proteinTarget} unit="g" />
              <hr className="p73-divider" />
              <TargetBar label="Gegeten · calorieën" value={actual.calories} target={data.profile.calorieTarget} unit="kcal" />
              <TargetBar label="Gegeten · eiwit" value={actual.protein} target={data.profile.proteinTarget} unit="g" />
            </div>
            <p className="muted small" style={{ margin: '12px 0 0' }}>“Gegeten” telt alleen wat je hebt bevestigd. Geplande maaltijden tellen nooit automatisch mee.</p>
          </article>

          {trainingToday && training ? (
            <article className="p73-card">
              <div className="p73-card-head"><div><p className="p73-kicker">Training vandaag</p><h2>{trainingToday.name}</h2><p>{trainingToday.duration} · helpt spiermassa te behouden tijdens het afvallen.</p></div><Dumbbell size={20} color="var(--muted)" /></div>
              <div className="p73-row"><button type="button" className="p73-btn secondary" onClick={() => onStartWorkout(training.selectedSessionTemplateId, today)}>Start training</button><button type="button" className="p73-btn ghost" onClick={() => navigate('progress', 'training')}>Schema bekijken</button></div>
            </article>
          ) : null}

          <article className="p73-card">
            <div className="p73-card-head"><div><h2>Boodschappen</h2><p>{daysAhead.length ? `${daysAhead.length} ${daysAhead.length === 1 ? 'dag' : 'dagen'} gepland, t/m ${dayLabel(daysAhead[daysAhead.length - 1], today).toLowerCase()} ${shortDate(daysAhead[daysAhead.length - 1])}.` : 'Nog geen dagen gepland.'}</p></div><CalendarDays size={20} color="var(--muted)" /></div>
            <div className="stat-row">
              <Stat label="Geschatte kosten" value={shoppingSummary ? euro(shoppingSummary.totalCents) : '—'} hint={shoppingSummary ? (shoppingSummary.source === 'demo' ? 'demoprijzen' : `waarvan ${euro(shoppingSummary.consumedCostCents)} opgegeten`) : 'nog niet berekend'} />
              <Stat label="Picnic" value={picnicLabel} hint={shoppingSummary?.cartSyncedAt ? `mandje bijgewerkt ${shortDate(shoppingSummary.cartSyncedAt.slice(0, 10))}` : undefined} />
            </div>
            {shoppingSummary?.order?.status === 'confirmed' ? <div style={{ marginTop: 12 }}><Notice tone="good" title="Bestelling bevestigd door Picnic" /></div> : null}
            {shoppingSummary?.order?.status === 'handoff' ? <div style={{ marginTop: 12 }}><Notice tone="info" title="Mandje klaargezet">Rond je bestelling af in de Picnic-app.</Notice></div> : null}
            <div className="p73-row" style={{ marginTop: 14 }}>
              <button type="button" className="p73-btn primary block" onClick={() => navigate('shopping', 'prepare')} disabled={!daysAhead.length}><ShoppingBasket size={16} />Bereid boodschappen voor</button>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
