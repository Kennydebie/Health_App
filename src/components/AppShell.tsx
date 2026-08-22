import type { ReactNode } from 'react';
import { Apple, ChartNoAxesCombined, Dumbbell, House, Settings2, Sparkles } from 'lucide-react';

export type Page = 'home' | 'coach' | 'food' | 'workout' | 'progress' | 'profile';

interface AppShellProps {
  page: Page;
  setPage: (page: Page) => void;
  children: ReactNode;
  name: string;
  planWeek: number;
  trainingStreak: number;
}

const navItems = [
  { id: 'home' as const, label: 'Home', Icon: House },
  { id: 'coach' as const, label: 'Coach', Icon: Sparkles },
  { id: 'food' as const, label: 'Nutrition', Icon: Apple },
  { id: 'workout' as const, label: 'Workout', Icon: Dumbbell },
  { id: 'progress' as const, label: 'Progress', Icon: ChartNoAxesCombined },
  { id: 'profile' as const, label: 'Profile', Icon: Settings2 },
];

export function AppShell({ page, setPage, children, name, planWeek, trainingStreak }: AppShellProps) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand" type="button" onClick={() => setPage('home')} aria-label="Go home">
          <span className="brand-mark"><Sparkles size={18} /></span><span><strong>PROJECT</strong> 75</span>
        </button>
        <nav aria-label="Primary navigation">
          {navItems.map(({ id, label, Icon }) => <button key={id} type="button" data-page={id} aria-label={label} aria-current={page === id ? 'page' : undefined} className={page === id ? 'active' : ''} onClick={() => setPage(id)}><Icon size={20} /><span>{label}</span></button>)}
        </nav>
        <div className="sidebar-coach">
          <div className="avatar">{name.charAt(0).toUpperCase()}</div>
          <div><span>Week {planWeek} · {trainingStreak} week streak</span><strong>{name}</strong></div>
        </div>
      </aside>
      <main className="main-content">{children}</main>
      <nav className="bottom-nav" aria-label="Mobile primary navigation">
        {navItems.map(({ id, label, Icon }) => <button key={id} type="button" data-page={id} aria-label={label} aria-current={page === id ? 'page' : undefined} className={page === id ? 'active' : ''} onClick={() => setPage(id)}><Icon size={21} /><span>{label}</span></button>)}
      </nav>
    </div>
  );
}
