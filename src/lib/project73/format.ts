import { addDays } from './weightTrend';

export const nlNumber = (value: number, digits = 0) => value.toLocaleString('nl-NL', { minimumFractionDigits: digits, maximumFractionDigits: digits });
export const kg = (value: number | null | undefined, digits = 1) => value == null ? '—' : `${nlNumber(value, digits)} kg`;
export const kcal = (value: number) => `${nlNumber(Math.round(value))} kcal`;
export const grams = (value: number) => `${nlNumber(Math.round(value))} g`;
export const euro = (cents: number) => (cents / 100).toLocaleString('nl-NL', { style: 'currency', currency: 'EUR' });

export function dayLabel(date: string, today: string) {
  if (date === today) return 'Vandaag';
  if (date === addDays(today, 1)) return 'Morgen';
  if (date === addDays(today, -1)) return 'Gisteren';
  return new Date(`${date}T12:00:00`).toLocaleDateString('nl-NL', { weekday: 'long' }).replace(/^./, (char) => char.toUpperCase());
}

export function shortDate(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
}

export function longDate(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function timeWindow(start: string, end: string) {
  const options: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' };
  const day = new Date(start).toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' });
  return { day, time: `${new Date(start).toLocaleTimeString('nl-NL', options)}–${new Date(end).toLocaleTimeString('nl-NL', options)}` };
}

export function servingsLabel(servings: number) {
  return servings === 1 ? '1 portie' : `${nlNumber(servings, servings % 1 ? 2 : 0).replace(/0$/, '')} portie`;
}
