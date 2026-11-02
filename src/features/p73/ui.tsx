import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, LoaderCircle, OctagonAlert } from 'lucide-react';

export function Notice({ tone = 'info', title, children }: { tone?: 'info' | 'warn' | 'bad' | 'good'; title: ReactNode; children?: ReactNode }) {
  const Icon = tone === 'warn' ? AlertTriangle : tone === 'bad' ? OctagonAlert : tone === 'good' ? CheckCircle2 : Info;
  return <div className={`notice ${tone}`} role={tone === 'bad' ? 'alert' : undefined}><Icon size={18} /><div><strong>{title}</strong>{children ? <p>{children}</p> : null}</div></div>;
}

export function Spinner({ size = 16 }: { size?: number }) {
  return <LoaderCircle size={size} className="spin" aria-hidden="true" />;
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return <div className="stat"><small>{label}</small><strong>{value}</strong>{hint ? <em>{hint}</em> : null}</div>;
}

export function DemoBanner({ children }: { children?: ReactNode }) {
  return <div className="demo-banner" role="note"><strong>DEMO</strong><span>{children ?? 'Voorbeeldproducten en -prijzen, geen echte Picnic-gegevens.'}</span></div>;
}

export function TargetBar({ label, value, target, unit, actual }: { label: string; value: number; target: number; unit: string; actual?: number }) {
  const percent = target > 0 ? Math.min(100, (value / target) * 100) : 0;
  const over = target > 0 && value > target * 1.08;
  return (
    <div className={`target-bar${over ? ' over' : ''}`}>
      <div className="target-bar__label"><span>{label}</span><span>{Math.round(value).toLocaleString('nl-NL')} / {Math.round(target).toLocaleString('nl-NL')} {unit}</span></div>
      <div className="target-bar__track" aria-hidden="true"><i style={{ width: `${percent}%` }} />{actual != null ? <i className="actual" style={{ width: `${Math.min(100, (actual / Math.max(1, target)) * 100)}%`, height: '40%', top: '30%' }} /> : null}</div>
    </div>
  );
}
