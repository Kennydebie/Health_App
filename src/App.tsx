import { lazy, Suspense, useState } from 'react';
import { AppShell, type Page } from './components/AppShell';
import { useAppData } from './state/useAppData';

const HomePage = lazy(() => import('./features/HomePage').then((module) => ({ default: module.HomePage })));
const FoodPage = lazy(() => import('./features/FoodPage').then((module) => ({ default: module.FoodPage })));
const WorkoutPage = lazy(() => import('./features/WorkoutPage').then((module) => ({ default: module.WorkoutPage })));
const ProgressPage = lazy(() => import('./features/ProgressPage').then((module) => ({ default: module.ProgressPage })));
const ProfilePage = lazy(() => import('./features/ProfilePage').then((module) => ({ default: module.ProfilePage })));

export default function App() {
  const controller = useAppData();
  const [page, setPage] = useState<Page>('home');
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  const startWorkout = (dayId: 'monday' | 'wednesday' | 'friday') => {
    const day = controller.data.program.find((item) => item.id === dayId);
    if (!day) return;
    const sessionId = controller.startWorkout(day);
    setActiveSessionId(sessionId);
    setPage('workout');
  };

  return (
    <AppShell page={page} setPage={setPage} name={controller.data.profile.name}>
      <Suspense fallback={<div className="page page-loading"><span /><p>Loading your plan…</p></div>}>
        {page === 'home' ? <HomePage controller={controller} setPage={setPage} onStartWorkout={startWorkout} /> : null}
        {page === 'food' ? <FoodPage controller={controller} /> : null}
        {page === 'workout' ? <WorkoutPage controller={controller} activeSessionId={activeSessionId} setActiveSessionId={setActiveSessionId} onStartWorkout={startWorkout} /> : null}
        {page === 'progress' ? <ProgressPage controller={controller} /> : null}
        {page === 'profile' ? <ProfilePage controller={controller} /> : null}
      </Suspense>
    </AppShell>
  );
}
