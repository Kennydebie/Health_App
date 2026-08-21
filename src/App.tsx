import { lazy, Suspense, useMemo, useState } from 'react';
import { AppShell, type Page } from './components/AppShell';
import { useAppData } from './state/useAppData';
import type { SessionTemplateId } from './types/models';
import { PageSkeleton } from './components/Visuals';
import { DataMigrationModal } from './features/DataBackups';
import { getDashboardSummary } from './lib/selectors';

const HomePage = lazy(() => import('./features/HomePage').then((module) => ({ default: module.HomePage })));
const FoodPage = lazy(() => import('./features/FoodPage').then((module) => ({ default: module.FoodPage })));
const WorkoutPage = lazy(() => import('./features/WorkoutPage').then((module) => ({ default: module.WorkoutPage })));
const ProgressPage = lazy(() => import('./features/ProgressPage').then((module) => ({ default: module.ProgressPage })));
const ProfilePage = lazy(() => import('./features/ProfilePage').then((module) => ({ default: module.ProfilePage })));

export default function App() {
  const controller = useAppData();
  const [page, setPage] = useState<Page>('home');
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [profileDirty, setProfileDirty] = useState(false);
  const summary = useMemo(() => getDashboardSummary(controller.data), [controller.data]);

  const navigate = (nextPage: Page) => {
    if (page === 'profile' && nextPage !== 'profile' && profileDirty && !window.confirm('You have unsaved profile changes. Leave without saving?')) return;
    setPage(nextPage);
  };

  const startWorkout = (templateId: SessionTemplateId, date?: string) => {
    const sessionId = controller.startWorkoutTemplate(templateId, date);
    if (!sessionId) return;
    setActiveSessionId(sessionId);
    setPage('workout');
  };

  return <>
    <AppShell page={page} setPage={navigate} name={controller.data.profile.name} planWeek={summary.planWeek} trainingStreak={summary.streak.weeks}>
      <Suspense fallback={<PageSkeleton />}>
        {page === 'home' ? <HomePage controller={controller} setPage={setPage} onStartWorkout={startWorkout} /> : null}
        {page === 'food' ? <FoodPage controller={controller} /> : null}
        {page === 'workout' ? <WorkoutPage controller={controller} activeSessionId={activeSessionId} setActiveSessionId={setActiveSessionId} onStartWorkout={startWorkout} /> : null}
        {page === 'progress' ? <ProgressPage controller={controller} /> : null}
        {page === 'profile' ? <ProfilePage controller={controller} onDirtyChange={setProfileDirty} /> : null}
      </Suspense>
    </AppShell>
    <DataMigrationModal controller={controller} />
  </>;
}
