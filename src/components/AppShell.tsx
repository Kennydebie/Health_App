import type { ReactNode } from 'react';
import { ChartNoAxesCombined, House, Settings2, ShoppingBasket, Sparkles, UtensilsCrossed } from 'lucide-react';

export type Page = 'dashboard' | 'plan' | 'shopping' | 'progress' | 'settings';

interface AppShellProps {
  page: Page;
  setPage: (page: Page) => void;
  children: ReactNode;
  name: string;
  subtitle: string;
}

const navItems = [
  { id: 'dashboard' as const, label: 'Dashboard', short: 'Vandaag', Icon: House },
  { id: 'plan' as const, label: 'Mijn voedingsplan', short: 'Plan', Icon: UtensilsCrossed },
  { id: 'shopping' as const, label: 'Boodschappen', short: 'Boodschap', Icon: ShoppingBasket },
  { id: 'progress' as const, label: 'Mijn voortgang', short: 'Voortgang', Icon: ChartNoAxesCombined },
  { id: 'settings' as const, label: 'Instellingen', short: 'Instellen', Icon: Settings2 },
];

export function AppShell({ page, setPage, children, name, subtitle }: AppShellProps) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand" type="button" onClick={() => setPage('dashboard')} aria-label="Naar dashboard">
          <span className="brand-mark"><Sparkles size={18} /></span><span><strong>PROJECT</strong> 73</span>
        </button>
        <nav aria-label="Hoofdnavigatie">
          {navItems.map(({ id, label, Icon }) => <button key={id} type="button" data-page={id} aria-current={page === id ? 'page' : undefined} className={page === id ? 'active' : ''} onClick={() => setPage(id)}><Icon size={20} /><span>{label}</span></button>)}
        </nav>
        <div className="sidebar-coach">
          <div className="avatar">{name.charAt(0).toUpperCase()}</div>
          <div><span>{subtitle}</span><strong>{name}</strong></div>
        </div>
      </aside>
      <main className="main-content">{children}</main>
      <nav className="bottom-nav" aria-label="Hoofdnavigatie mobiel">
        {navItems.map(({ id, label, short, Icon }) => <button key={id} type="button" data-page={id} aria-label={label} aria-current={page === id ? 'page' : undefined} className={page === id ? 'active' : ''} onClick={() => setPage(id)}><Icon size={21} /><span>{short}</span></button>)}
      </nav>
    </div>
  );
}
