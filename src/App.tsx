import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { AppShell, type Page } from './components/AppShell';
import { useAppData } from './state/useAppData';
import { useShopping } from './state/useShopping';
import type { SessionTemplateId } from './types/models';
import { PageSkeleton } from './components/Visuals';
import { DataMigrationModal } from './features/DataBackups';
import { OnboardingFlow } from './features/OnboardingFlow';
import { AssistantPanel } from './features/p73/AssistantPanel';
import { toDateKey } from './lib/date';
import { weightOverview } from './lib/project73/selectors';

const DashboardPage = lazy(() => import('./features/p73/DashboardPage').then((module) => ({ default: module.DashboardPage })));
const MealPlanPage = lazy(() => import('./features/p73/MealPlanPage').then((module) => ({ default: module.MealPlanPage })));
const ShoppingPage = lazy(() => import('./features/p73/ShoppingPage').then((module) => ({ default: module.ShoppingPage })));
const ProgressHub = lazy(() => import('./features/p73/ProgressHub').then((module) => ({ default: module.ProgressHub })));
const SettingsPage = lazy(() => import('./features/p73/SettingsPage').then((module) => ({ default: module.SettingsPage })));

export type SubTab = string;

function initialCheckoutAttempt() {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('picnicCheckout');
}

export default function App() {
  const controller = useAppData();
  const shopping = useShopping(controller);
  const [checkoutReturn, setCheckoutReturn] = useState<string | null>(initialCheckoutAttempt);
  const [page, setPage] = useState<Page>(() => checkoutReturn ? 'shopping' : 'dashboard');
  const [subTabs, setSubTabs] = useState<Record<Page, SubTab>>({ dashboard: '', plan: 'plan', shopping: '', progress: 'overview', settings: 'profile' });
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [profileDirty, setProfileDirty] = useState(false);
  const [progressVisit, setProgressVisit] = useState(0);
  const today = toDateKey();
  const theme = controller.data.planningPreferences.theme;

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') delete root.dataset.theme;
    else root.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    if (!checkoutReturn) return;
    const url = new URL(window.location.href);
    url.searchParams.delete('picnicCheckout');
    window.history.replaceState(null, '', url.toString());
  }, [checkoutReturn]);

  const navigate = (nextPage: Page, sub?: SubTab) => {
    if (page === 'settings' && subTabs.settings === 'app' && nextPage !== 'settings' && profileDirty && !window.confirm('Je hebt niet-opgeslagen wijzigingen. Toch verlaten?')) return;
    if (nextPage === 'progress') setProgressVisit((visit) => visit + 1);
    if (sub) setSubTabs((current) => ({ ...current, [nextPage]: sub }));
    setPage(nextPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const setSub = (target: Page, sub: SubTab) => setSubTabs((current) => ({ ...current, [target]: sub }));

  const startWorkout = (templateId: SessionTemplateId, date?: string) => {
    const sessionId = controller.startWorkoutTemplate(templateId, date);
    if (!sessionId) return;
    setActiveSessionId(sessionId);
    navigate('progress', 'training');
  };

  const overview = useMemo(() => weightOverview(controller.data, today), [controller.data, today]);
  const subtitle = overview.progress.currentKg != null
    ? `${overview.progress.currentKg.toLocaleString('nl-NL', { maximumFractionDigits: 1 })} kg → ${controller.data.profile.goalWeightKg} kg`
    : `Doel ${controller.data.profile.goalWeightKg} kg`;

  return <>
    <AppShell page={page} setPage={(next) => navigate(next)} name={controller.data.profile.name} subtitle={subtitle}>
      <Suspense fallback={<PageSkeleton />}>
        {page === 'dashboard' ? <DashboardPage controller={controller} shopping={shopping} navigate={navigate} onStartWorkout={startWorkout} /> : null}
        {page === 'plan' ? <MealPlanPage controller={controller} shopping={shopping} navigate={navigate} tab={subTabs.plan} setTab={(tab: string) => setSub('plan', tab)} /> : null}
        {page === 'shopping' ? <ShoppingPage controller={controller} shopping={shopping} navigate={navigate} intent={subTabs.shopping} clearIntent={() => setSub('shopping', '')} checkoutReturn={checkoutReturn} clearCheckoutReturn={() => setCheckoutReturn(null)} /> : null}
        {page === 'progress' ? <ProgressHub key={progressVisit} controller={controller} tab={subTabs.progress} setTab={(tab: string) => setSub('progress', tab)} activeSessionId={activeSessionId} setActiveSessionId={setActiveSessionId} onStartWorkout={startWorkout} navigate={navigate} /> : null}
        {page === 'settings' ? <SettingsPage controller={controller} shopping={shopping} tab={subTabs.settings} setTab={(tab: string) => setSub('settings', tab)} onProfileDirtyChange={setProfileDirty} /> : null}
      </Suspense>
    </AppShell>
    <AssistantPanel controller={controller} shopping={shopping} navigate={navigate} />
    <DataMigrationModal controller={controller} />
    <OnboardingFlow controller={controller} />
  </>;
}
