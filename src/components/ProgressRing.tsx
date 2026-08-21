interface ProgressRingProps {
  value: number;
  max: number;
  size?: number;
  label: string;
  valueLabel: string;
  warning?: boolean;
  tone?: 'coral' | 'blue' | 'amber' | 'violet' | 'cyan' | 'teal' | 'lime';
}

export function ProgressRing({ value, max, size = 184, label, valueLabel, warning = false, tone = 'coral' }: ProgressRingProps) {
  const radius = 47;
  const circumference = 2 * Math.PI * radius;
  const percent = Math.min(Math.max(value / Math.max(max, 1), 0), 1);
  return (
    <div className={`progress-ring tone-${tone} ${warning ? 'progress-ring--warning' : ''}`} style={{ width: size, height: size }}>
      <svg viewBox="0 0 110 110" aria-hidden="true">
        <circle className="progress-ring__track" cx="55" cy="55" r={radius} />
        <circle className="progress-ring__value" cx="55" cy="55" r={radius} strokeDasharray={circumference} strokeDashoffset={circumference * (1 - percent)} />
      </svg>
      <div className="progress-ring__label"><strong>{valueLabel}</strong><span>{label}</span></div>
    </div>
  );
}
