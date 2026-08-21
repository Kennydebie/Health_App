const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric', month: '2-digit', day: '2-digit',
});

export function toDateKey(date = new Date()): string {
  return dateFormatter.format(date);
}

export function shiftDate(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T12:00:00`);
  date.setDate(date.getDate() + days);
  return toDateKey(date);
}

export function prettyDate(dateKey: string, includeYear = false): string {
  const date = new Date(`${dateKey}T12:00:00`);
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short',
    ...(includeYear ? { year: 'numeric' } : {}),
  }).format(date);
}

export function relativeDay(dateKey: string): string {
  const today = toDateKey();
  if (dateKey === today) return 'Today';
  if (dateKey === shiftDate(today, -1)) return 'Yesterday';
  if (dateKey === shiftDate(today, 1)) return 'Tomorrow';
  return prettyDate(dateKey);
}
