import type { LucideIcon } from 'lucide-react';
import { Check, Dumbbell, HeartPulse, MoonStar, Utensils } from 'lucide-react';

export type VisualTone = 'coral' | 'blue' | 'amber' | 'violet' | 'cyan' | 'teal' | 'lime';

export function ToneIcon({ Icon, tone, label }: { Icon: LucideIcon; tone: VisualTone; label?: string }) {
  return <span className={`tone-icon tone-${tone}`} aria-label={label}><Icon size={19} aria-hidden="true" /></span>;
}

export function MacroMeter({ label, value, target, unit = 'g', tone }: { label: string; value: number; target: number; unit?: string; tone: VisualTone }) {
  const percent = Math.max(0, Math.min(100, value / Math.max(1, target) * 100));
  const remaining = Math.max(0, target - value);
  return <div className={`macro-meter tone-${tone}`}>
    <div><span>{label}</span><strong>{Math.round(value)}<small> / {target}{unit}</small></strong></div>
    <div className="macro-meter__track" role="progressbar" aria-label={`${label}: ${Math.round(value)} of ${target} ${unit}`} aria-valuemin={0} aria-valuemax={target} aria-valuenow={Math.round(value)}><span style={{ width: `${percent}%` }} /></div>
    <small>{remaining > 0 ? `${Math.round(remaining)} ${unit} remaining` : 'Target reached'}</small>
  </div>;
}

export interface WeekStripItem {
  date: string;
  day: string;
  status: 'workout' | 'nutrition' | 'cardio' | 'recovery' | 'upcoming' | 'mixed';
  complete?: boolean;
  today?: boolean;
}

const weekIcons = { workout: Dumbbell, nutrition: Utensils, cardio: HeartPulse, recovery: MoonStar, upcoming: MoonStar, mixed: Check };

export function WeekStrip({ items }: { items: WeekStripItem[] }) {
  return <div className="week-strip" aria-label="Weekly consistency">
    {items.map((item) => {
      const Icon = weekIcons[item.status];
      return <div className={`week-strip__day ${item.status} ${item.complete ? 'complete' : ''} ${item.today ? 'today' : ''}`} key={item.date} title={`${item.day}: ${item.status}`}>
        <span>{item.day.slice(0, 1)}</span><i><Icon size={14} /></i><small>{item.today ? 'Today' : item.complete ? 'Done' : item.status === 'upcoming' ? 'Next' : item.status}</small>
      </div>;
    })}
  </div>;
}

function muscleRegion(muscles: string[]) {
  const normalized = muscles.join(' ').toLowerCase();
  if (/chest|pec/.test(normalized)) return 'chest';
  if (/lat|back|rear delt/.test(normalized)) return 'back';
  if (/quad|glute|hamstring|calf|adductor/.test(normalized)) return 'lower';
  if (/shoulder|delt|triceps|biceps/.test(normalized)) return 'upper';
  if (/core|ab/.test(normalized)) return 'core';
  return 'full';
}

export function BodyFocus({ muscles, compact = false }: { muscles: string[]; compact?: boolean }) {
  const region = muscleRegion(muscles);
  return <div className={`body-focus region-${region} ${compact ? 'compact' : ''}`} role="img" aria-label={`Stylized body focus: ${muscles.join(', ')}`}>
    <span className="body-focus__head" />
    <span className="body-focus__torso" />
    <span className="body-focus__arm left" /><span className="body-focus__arm right" />
    <span className="body-focus__leg left" /><span className="body-focus__leg right" />
    <i className="body-focus__highlight" />
  </div>;
}

export function PageSkeleton() {
  return <div className="page page-skeleton" aria-label="Loading page"><div className="skeleton-line wide" /><div className="skeleton-line" /><div className="skeleton-grid"><span /><span /><span /></div></div>;
}
