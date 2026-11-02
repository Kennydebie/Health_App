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
  return new Intl.DateTimeFormat('nl-NL', {
    weekday: 'short', day: 'numeric', month: 'short',
    ...(includeYear ? { year: 'numeric' } : {}),
  }).format(date);
}

export function relativeDay(dateKey: string): string {
  const today = toDateKey();
  if (dateKey === today) return 'Vandaag';
  if (dateKey === shiftDate(today, -1)) return 'Gisteren';
  if (dateKey === shiftDate(today, 1)) return 'Morgen';
  return prettyDate(dateKey);
}
