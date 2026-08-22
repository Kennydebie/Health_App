import { useMemo, useState, type ComponentType } from 'react';
import { AlertTriangle, CalendarDays, Check, ChevronLeft, ChevronRight, Clock3, Copy, Minus, Pencil, Plus, Settings2, Target } from 'lucide-react';
import { CartesianGrid, Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Modal } from '../components/Modal';
import { addMacros, entryMacros } from '../lib/nutrition';
import { foodForEntry } from '../lib/foodCatalog';
import {
  calendarMonthDates,
  calendarWeekDates,
  evaluateNutritionDay,
  explanationForDay,
  metricDifference,
  startOfCalendarWeek,
  statusLabel,
  targetSnapshotForDate,
  type NutritionDayEvaluation,
  type NutritionMetricStatus,
} from '../lib/nutritionEvaluation';
import { prettyDate, shiftDate, toDateKey } from '../lib/date';
import type { AppController } from '../state/useAppData';
import type { FoodLogEntry, Macros, NutritionEvaluationSettings } from '../types/models';

const STATUS_META: Record<NutritionMetricStatus, { label: string; Icon: ComponentType<{ size?: number }> }> = {
  on_target: { label: 'On target', Icon: Check },
  close: { label: 'Close', Icon: Target },
  under: { label: 'Below target', Icon: AlertTriangle },
  over: { label: 'Above target', Icon: AlertTriangle },
  in_progress: { label: 'In progress', Icon: Clock3 },
  no_data: { label: 'No data', Icon: Minus },
};

const CHART_STYLE = { background: '#101a20', border: '1px solid rgba(116,140,151,.28)', borderRadius: 12, color: '#f6f2ed' };

function useNutritionEvaluator(controller: AppController) {
  const { data } = controller;
  const totalsByDate = useMemo(() => {
    const byDate = new Map<string, Macros[]>();
    for (const entry of data.foodLog) {
      const food = foodForEntry(data, entry);
      const current = byDate.get(entry.date) ?? [];
      current.push(entryMacros(food, entry));
      byDate.set(entry.date, current);
    }
    return new Map([...byDate].map(([date, values]) => [date, addMacros(values)]));
  }, [data]);
  const recordByDate = useMemo(() => new Map(data.nutritionDayRecords.map((item) => [item.date, item])), [data.nutritionDayRecords]);
  const today = toDateKey();
  return (date: string) => evaluateNutritionDay({
    date,
    today,
    totals: totalsByDate.get(date) ?? { calories: 0, protein: 0, carbs: 0, fat: 0 },
    target: targetSnapshotForDate(data.nutritionTargetHistory, data.profile, date),
    settings: data.nutritionSettings,
    record: recordByDate.get(date),
  });
}

function percent(value: number, target: number) {
  return target > 0 ? Math.round(value / target * 100) : 0;
}

function MetricBar({ label, value, target, unit, status, tone }: { label: string; value: number; target: number; unit: string; status: NutritionMetricStatus; tone: string }) {
  const reached = percent(value, target);
  const fill = Math.min(100, reached);
  const detail = metricDifference(value, target, unit);
  return <div className={`adherence-bar status-${status}`}>
    <div className="adherence-bar__heading"><span>{label}</span><strong>{Math.round(value).toLocaleString()} / {target.toLocaleString()} {unit}</strong><em>{reached}%</em></div>
    <div className="adherence-bar__track" aria-label={`${label}: ${reached}% of target. ${statusLabel(status)}.`}><i className="target-marker"/><span className={tone} style={{ width: `${fill}%` }}/>{reached > 100 ? <b className="overflow-stripe" style={{ width: `${Math.min(22, reached - 100)}%` }} /> : null}</div>
    <small>{detail} · {statusLabel(status)}</small>
  </div>;
}

export function NutritionGoalBars({ evaluation, compact = false }: { evaluation: NutritionDayEvaluation; compact?: boolean }) {
  return <section className={`nutrition-goal-bars ${compact ? 'compact' : ''}`} aria-live="polite">
    <header><div><p className="eyebrow">Daily targets</p><h2>{statusLabel(evaluation.overall, true)}</h2></div><StatusBadge status={evaluation.overall}/></header>
    <div className="nutrition-goal-bars__grid">
      <MetricBar label="Calories" value={evaluation.totals.calories} target={evaluation.target.caloriesKcal} unit="kcal" status={evaluation.calories} tone="calories"/>
      <MetricBar label="Protein" value={evaluation.totals.protein} target={evaluation.target.proteinGrams} unit="g" status={evaluation.protein} tone="protein"/>
      <MetricBar label="Carbohydrates" value={evaluation.totals.carbs} target={evaluation.target.carbohydrateGrams} unit="g" status={evaluation.carbohydrates} tone="carbs"/>
      <MetricBar label="Fat" value={evaluation.totals.fat} target={evaluation.target.fatGrams} unit="g" status={evaluation.fat} tone="fat"/>
    </div>
  </section>;
}

function StatusBadge({ status, label: labelOverride }: { status: NutritionMetricStatus; label?: string }) {
  const { Icon, label } = STATUS_META[status];
  return <span className={`nutrition-status-badge status-${status}`}><Icon size={14}/>{labelOverride ?? label}</span>;
}

function MacroIndicator({ letter, value, target, status }: { letter: string; value: number; target: number; status: NutritionMetricStatus }) {
  return <span className={`macro-indicator status-${status}`} aria-label={`${letter}: ${statusLabel(status)}, ${percent(value, target)}%`}><b>{letter}</b>{status === 'on_target' ? <Check size={11}/> : status === 'over' || status === 'under' ? <AlertTriangle size={11}/> : <small>{percent(value, target)}%</small>}</span>;
}

function NutritionCalendarCell({ evaluation, currentMonth, selected, onSelect }: { evaluation: NutritionDayEvaluation; currentMonth: string; selected: boolean; onSelect: () => void }) {
  const date = new Date(`${evaluation.date}T12:00:00`);
  const day = date.getDate();
  const outOfMonth = !evaluation.date.startsWith(currentMonth);
  const meta = STATUS_META[evaluation.overall];
  const Icon = meta.Icon;
  const accessible = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }).format(date);
  return <button type="button" className={`nutrition-calendar-cell status-${evaluation.overall} ${outOfMonth ? 'outside-month' : ''} ${selected ? 'selected' : ''}`} onClick={onSelect} aria-label={`${accessible}. ${statusLabel(evaluation.overall, true)}. ${Math.round(evaluation.totals.calories).toLocaleString()} of ${evaluation.target.caloriesKcal.toLocaleString()} calories.`} aria-current={selected ? 'date' : undefined}>
    <span className="calendar-cell-date">{day}</span>
    <strong><Icon size={14}/>{evaluation.overall === 'under' ? 'Below target' : evaluation.overall === 'over' ? 'Above target' : meta.label}</strong>
    <p>{Math.round(evaluation.totals.calories).toLocaleString()} / {evaluation.target.caloriesKcal.toLocaleString()} <small>kcal</small></p>
    <div className="calendar-cell-macros">
      <MacroIndicator letter="P" value={evaluation.totals.protein} target={evaluation.target.proteinGrams} status={evaluation.protein}/>
      <MacroIndicator letter="C" value={evaluation.totals.carbs} target={evaluation.target.carbohydrateGrams} status={evaluation.carbohydrates}/>
      <MacroIndicator letter="F" value={evaluation.totals.fat} target={evaluation.target.fatGrams} status={evaluation.fat}/>
    </div>
    <span className="calendar-completion">{percent(evaluation.totals.calories, evaluation.target.caloriesKcal)}%</span>
  </button>;
}

function streaks(evaluate: (date: string) => NutritionDayEvaluation, firstDate: string, today: string) {
  let best = 0;
  let run = 0;
  let current = 0;
  for (let date = firstDate; date <= today; date = shiftDate(date, 1)) {
    const item = evaluate(date);
    if (item.record?.untrackedTreatment === 'excluded') continue;
    if (item.overall === 'on_target' && item.counted) { run += 1; best = Math.max(best, run); }
    else if (item.complete) run = 0;
  }
  for (let date = today; date >= firstDate; date = shiftDate(date, -1)) {
    const item = evaluate(date);
    if (item.record?.untrackedTreatment === 'excluded') continue;
    if (!item.complete) continue;
    if (item.overall !== 'on_target' || !item.counted) break;
    current += 1;
  }
  return { current, best };
}

function summarize(evaluations: NutritionDayEvaluation[]) {
  const completed = evaluations.filter((item) => item.counted);
  const onTarget = completed.filter((item) => item.overall === 'on_target').length;
  const close = completed.filter((item) => item.overall === 'close').length;
  const outside = completed.filter((item) => item.overall === 'under' || item.overall === 'over').length;
  const average = (key: keyof Macros) => completed.length ? completed.reduce((sum, item) => sum + item.totals[key], 0) / completed.length : 0;
  return { completed, onTarget, close, outside, averageCalories: average('calories'), averageProtein: average('protein') };
}

function DayDetail({ evaluation, entries, onClose, onDiary, onAdd, onEdit, controller }: { evaluation: NutritionDayEvaluation; entries: FoodLogEntry[]; onClose: () => void; onDiary: () => void; onAdd: () => void; onEdit: (entry: FoodLogEntry) => void; controller: AppController }) {
  const [copyDate, setCopyDate] = useState(shiftDate(evaluation.date, 1));
  const mealGroups = entries.reduce<Record<string, FoodLogEntry[]>>((groups, entry) => ({ ...groups, [entry.meal]: [...(groups[entry.meal] ?? []), entry] }), {});
  return <Modal open onClose={onClose} title={prettyDate(evaluation.date, true)} subtitle={statusLabel(evaluation.overall, true)} size="large" footer={<><button type="button" className="secondary-button" onClick={onDiary}>View diary</button><button type="button" className="primary-button" onClick={onAdd}><Plus size={16}/> Add food</button></>}>
    <div className="nutrition-day-detail">
      <NutritionGoalBars evaluation={evaluation} compact/>
      <section className="nutrition-explanation"><h3>{statusLabel(evaluation.overall, true)}</h3>{explanationForDay(evaluation).map((line) => <p key={line}>{line}</p>)}</section>
      <section className="nutrition-meals-detail"><header><h3>Foods logged</h3><span>{entries.length} {entries.length === 1 ? 'entry' : 'entries'}</span></header>{entries.length ? Object.entries(mealGroups).map(([meal, items]) => <div key={meal}><strong>{meal.charAt(0).toUpperCase() + meal.slice(1)}</strong>{items.map((entry) => { const food = foodForEntry(controller.data, entry); return <button type="button" key={entry.id} onClick={() => onEdit(entry)}><span>{food?.name ?? entry.snapshot?.foodName ?? 'Saved food'}</span><small>{Math.round(entryMacros(food, entry).calories)} kcal</small><Pencil size={14}/></button>; })}</div>) : <p>No food was logged for this date.</p>}</section>
      <section className="copy-day-controls"><div><h3>Copy meals to another day</h3><p>Copies every logged entry without changing this day.</p></div><input type="date" value={copyDate} onChange={(event) => setCopyDate(event.target.value)}/><button type="button" className="secondary-button" disabled={!entries.length || copyDate === evaluation.date} onClick={() => controller.copyNutritionDay(evaluation.date, copyDate)}><Copy size={16}/> Copy meals</button></section>
      <section className="day-tracking-controls"><div><h3>Logging completeness</h3><p>Only fully logged days can support a calorie-target decision.</p></div><button type="button" className={evaluation.record?.completeness === 'fully_logged' ? 'active' : ''} onClick={() => controller.setNutritionDayCompleteness(evaluation.date, 'fully_logged')}>Fully logged</button><button type="button" className={evaluation.record?.completeness === 'partially_logged' ? 'active' : ''} onClick={() => controller.setNutritionDayCompleteness(evaluation.date, 'partially_logged')}>Partially logged</button><button type="button" className={evaluation.record?.untrackedTreatment === 'excluded' ? 'active' : ''} onClick={() => controller.setNutritionDayTreatment(evaluation.date, 'excluded')}>Exclude day</button><button type="button" className={evaluation.record?.untrackedTreatment === 'no_data' ? 'active' : ''} onClick={() => controller.setNutritionDayTreatment(evaluation.date, 'no_data')}>No data</button></section>
      {evaluation.date === toDateKey() && !evaluation.complete && evaluation.hasData ? <button type="button" className="finish-today-button" onClick={() => controller.finishNutritionDay(evaluation.date)}><Check size={17}/> Finish today</button> : null}
    </div>
  </Modal>;
}

export function NutritionCalendar({ controller, selectedDate, onSelectDate, onOpenDiary, onAddFood, onEditEntry }: { controller: AppController; selectedDate: string; onSelectDate: (date: string) => void; onOpenDiary: (date: string) => void; onAddFood: (date: string) => void; onEditEntry: (entry: FoodLogEntry) => void }) {
  const evaluate = useNutritionEvaluator(controller);
  const [monthDate, setMonthDate] = useState(selectedDate);
  const [view, setView] = useState<'month' | 'week'>('month');
  const [detailDate, setDetailDate] = useState<string | null>(null);
  const monthKey = monthDate.slice(0, 7);
  const dates = view === 'month' ? calendarMonthDates(monthDate) : calendarWeekDates(selectedDate);
  const evaluations = dates.map(evaluate);
  const weekEvaluations = calendarWeekDates(selectedDate).map(evaluate);
  const week = summarize(weekEvaluations);
  const today = toDateKey();
  const monthDays = new Date(Number(monthKey.slice(0, 4)), Number(monthKey.slice(5, 7)), 0).getDate();
  const monthEvaluations = Array.from({ length: monthDays }, (_, index) => evaluate(`${monthKey}-${String(index + 1).padStart(2, '0')}`));
  const month = summarize(monthEvaluations);
  const noData = monthEvaluations.filter((item) => (item.date < today || Boolean(item.record?.finishedAt)) && item.overall === 'no_data' && item.record?.untrackedTreatment !== 'excluded').length;
  const firstDate = controller.data.foodLog.map((entry) => entry.date).sort()[0] ?? today;
  const streak = streaks(evaluate, firstDate, today);
  const misses = (['calories', 'protein', 'carbohydrates', 'fat'] as const).map((metric) => ({ metric, count: month.completed.filter((item) => item[metric] === 'under' || item[metric] === 'over').length })).sort((a, b) => b.count - a.count);
  const commonMiss = misses[0]?.count ? misses[0].metric : 'none';
  const selectedEvaluation = detailDate ? evaluate(detailDate) : null;
  const selectedEntries = detailDate ? controller.data.foodLog.filter((entry) => entry.date === detailDate) : [];
  const moveMonth = (offset: number) => { const date = new Date(`${monthDate.slice(0, 7)}-15T12:00:00`); date.setMonth(date.getMonth() + offset); const next = toDateKey(date); setMonthDate(next); onSelectDate(`${next.slice(0, 7)}-01`); };

  return <div className="nutrition-calendar-view">
    <section className="nutrition-week-summary card"><header><div><p className="eyebrow">Selected week</p><h2>{prettyDate(startOfCalendarWeek(selectedDate))}–{prettyDate(shiftDate(startOfCalendarWeek(selectedDate), 6))}</h2></div><strong>{week.onTarget} of {week.completed.length} completed days on target</strong></header><div><span><b>{week.onTarget}</b> On target</span><span><b>{week.close}</b> Close</span><span><b>{week.outside}</b> Outside</span><span><b>{weekEvaluations.filter((item) => (item.date < today || Boolean(item.record?.finishedAt)) && item.overall === 'no_data' && item.record?.untrackedTreatment !== 'excluded').length}</b> No data</span><span><b>{week.completed.length ? Math.round(week.averageCalories).toLocaleString() : '—'}</b> avg kcal</span><span><b>{week.completed.length ? `${Math.round(week.averageProtein)} g` : '—'}</b> avg protein</span><span><b>{streak.current}</b> current streak</span><span><b>{streak.best}</b> best streak</span></div></section>
    <section className="nutrition-month-summary"><div><span>{new Intl.DateTimeFormat('en', { month: 'long' }).format(new Date(`${monthKey}-15T12:00:00`))}</span><strong>{month.completed.length ? Math.round(month.onTarget / month.completed.length * 100) : 0}%</strong><small>of completed days on target</small></div><p><b>{month.onTarget}</b> green · <b>{month.close}</b> amber · <b>{month.outside}</b> red · <b>{noData}</b> no data</p><p>Most commonly missed: <b>{commonMiss}</b></p><p>Average difference: <b>{month.completed.length ? `${Math.round(month.averageCalories - month.completed.reduce((sum, item) => sum + item.target.caloriesKcal, 0) / month.completed.length) >= 0 ? '+' : ''}${Math.round(month.averageCalories - month.completed.reduce((sum, item) => sum + item.target.caloriesKcal, 0) / month.completed.length)} kcal` : '—'}</b> · <b>{month.completed.length ? `${Math.round(month.averageProtein - month.completed.reduce((sum, item) => sum + item.target.proteinGrams, 0) / month.completed.length)} g protein` : '—'}</b></p></section>
    <section className="nutrition-calendar-shell card">
      <header className="nutrition-calendar-toolbar"><div><button type="button" className="icon-button" onClick={() => moveMonth(-1)} aria-label="Previous month"><ChevronLeft size={19}/></button><h2>{new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' }).format(new Date(`${monthKey}-15T12:00:00`))}</h2><button type="button" className="icon-button" onClick={() => moveMonth(1)} aria-label="Next month"><ChevronRight size={19}/></button></div><div className="calendar-view-toggle" aria-label="Calendar view"><button type="button" className={view === 'month' ? 'active' : ''} onClick={() => setView('month')}>Month</button><button type="button" className={view === 'week' ? 'active' : ''} onClick={() => setView('week')}>Week</button></div></header>
      <div className="nutrition-calendar-legend" aria-label="Nutrition status legend">{(['on_target', 'close', 'over', 'in_progress', 'no_data'] as const).map((status) => <StatusBadge status={status} label={status === 'over' ? 'Outside range' : undefined} key={status}/>)}</div>
      <div className="nutrition-weekdays" aria-hidden="true">{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((day) => <span key={day}>{day}</span>)}</div>
      <div className={`nutrition-calendar-grid view-${view}`}>{evaluations.map((item) => <NutritionCalendarCell key={item.date} evaluation={item} currentMonth={monthKey} selected={item.date === selectedDate} onSelect={() => { onSelectDate(item.date); if (!item.date.startsWith(monthKey)) setMonthDate(item.date); setDetailDate(item.date); }}/>)}</div>
    </section>
    {selectedEvaluation ? <DayDetail evaluation={selectedEvaluation} entries={selectedEntries} controller={controller} onClose={() => setDetailDate(null)} onDiary={() => { onOpenDiary(selectedEvaluation.date); setDetailDate(null); }} onAdd={() => { onAddFood(selectedEvaluation.date); setDetailDate(null); }} onEdit={(entry) => { onEditEntry(entry); setDetailDate(null); }}/> : null}
  </div>;
}

function TrendChart({ title, data, dataKey, targetKey, unit, range, domain }: { title: string; data: Array<Record<string, string | number | null>>; dataKey: string; targetKey?: string; unit: string; range?: [number, number]; domain?: [number, number] }) {
  const hasData = data.some((item) => item[dataKey] != null);
  return <article className="nutrition-trend-card card"><header><h3>{title}</h3><span>{unit}</span></header>{hasData ? <ResponsiveContainer width="100%" height={230}><LineChart data={data} margin={{ top: 12, right: 12, left: -12, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" vertical={false}/>{range ? <ReferenceArea y1={range[0]} y2={range[1]} fill="#75d9a6" fillOpacity={.08}/> : null}<XAxis dataKey="label" tickLine={false} axisLine={false}/><YAxis domain={domain} unit={unit === '%' ? '%' : undefined} tickLine={false} axisLine={false}/><Tooltip contentStyle={CHART_STYLE}/><Line type="monotone" dataKey={dataKey} name="Actual" stroke="#83bde5" strokeWidth={2.5} connectNulls={false}/>{targetKey ? <Line type="stepAfter" dataKey={targetKey} name="Target" stroke="#f08a78" strokeDasharray="6 5" dot={false}/> : null}</LineChart></ResponsiveContainer> : <div className="nutrition-trend-empty"><CalendarDays size={25}/><strong>Not enough nutrition history yet</strong><p>Log food on more days to build this trend. Available entries will appear automatically.</p></div>}</article>;
}

export function NutritionTrends({ controller }: { controller: AppController }) {
  const evaluate = useNutritionEvaluator(controller);
  const today = toDateKey();
  const daily = Array.from({ length: 28 }, (_, index) => {
    const date = shiftDate(today, index - 27);
    const item = evaluate(date);
    return { label: date.slice(5), calories: item.hasData ? Math.round(item.totals.calories) : null, calorieTarget: item.target.caloriesKcal, protein: item.hasData ? Math.round(item.totals.protein) : null, proteinTarget: item.target.proteinGrams };
  });
  const weeks = Array.from({ length: 8 }, (_, index) => shiftDate(startOfCalendarWeek(today), (index - 7) * 7)).map((start) => {
    const items = calendarWeekDates(start).map(evaluate);
    const summary = summarize(items);
    return { label: start.slice(5), adherence: summary.completed.length ? Math.round(summary.onTarget / summary.completed.length * 100) : null, calories: summary.completed.length ? Math.round(summary.averageCalories) : null, protein: summary.completed.length ? Math.round(summary.averageProtein) : null };
  });
  const latestTarget = targetSnapshotForDate(controller.data.nutritionTargetHistory, controller.data.profile, today);
  return <div className="nutrition-trends-view"><header><div><p className="eyebrow">Nutrition trends</p><h2>Actual intake and adherence</h2><p>Charts use your logged food and the target that applied on each date. Missing days stay empty.</p></div></header><div className="nutrition-trends-grid">
    <TrendChart title="Daily calories versus target" data={daily} dataKey="calories" targetKey="calorieTarget" unit="kcal" range={[latestTarget.caloriesKcal * controller.data.nutritionSettings.calories.onTargetMin, latestTarget.caloriesKcal * controller.data.nutritionSettings.calories.onTargetMax]}/>
    <TrendChart title="Daily protein versus target" data={daily} dataKey="protein" targetKey="proteinTarget" unit="g" range={[latestTarget.proteinGrams * controller.data.nutritionSettings.protein.onTargetMin, latestTarget.proteinGrams * 1.15]}/>
    <TrendChart title="Weekly on-target percentage" data={weeks} dataKey="adherence" unit="%" range={[90, 100]} domain={[0, 100]}/>
    <TrendChart title="Weekly calorie average" data={weeks} dataKey="calories" unit="kcal" range={[latestTarget.caloriesKcal * controller.data.nutritionSettings.calories.onTargetMin, latestTarget.caloriesKcal * controller.data.nutritionSettings.calories.onTargetMax]}/>
    <TrendChart title="Weekly protein average" data={weeks} dataKey="protein" unit="g" range={[latestTarget.proteinGrams * controller.data.nutritionSettings.protein.onTargetMin, latestTarget.proteinGrams * 1.15]}/>
  </div></div>;
}

function PercentField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <label><span>{label}</span><div><input type="number" min="0" max="200" step="1" value={Math.round(value * 100)} onChange={(event) => onChange(Number(event.target.value) / 100)}/><small>%</small></div></label>;
}

export function NutritionSettingsModal({ settings, onSave, onClose }: { settings: NutritionEvaluationSettings; onSave: (settings: NutritionEvaluationSettings) => void; onClose: () => void }) {
  const [draft, setDraft] = useState(() => structuredClone(settings));
  const valid = draft.calories.closeMin <= draft.calories.onTargetMin && draft.calories.onTargetMin <= draft.calories.onTargetMax && draft.calories.onTargetMax <= draft.calories.closeMax
    && draft.protein.closeMin <= draft.protein.onTargetMin
    && draft.macros.closeMin <= draft.macros.onTargetMin && draft.macros.onTargetMin <= draft.macros.onTargetMax && draft.macros.onTargetMax <= draft.macros.closeMax;
  return <Modal open onClose={onClose} title="Nutrition settings" subtitle="Adjust the ranges used for daily status labels." size="large" footer={<><button type="button" className="text-button" onClick={onClose}>Cancel</button><button type="button" className="primary-button" disabled={!valid} onClick={() => { onSave(draft); onClose(); }}><Settings2 size={16}/> Save ranges</button></>}><div className="nutrition-settings-form"><section><h3>Calories</h3><div><PercentField label="Close minimum" value={draft.calories.closeMin} onChange={(value) => setDraft((current) => ({ ...current, calories: { ...current.calories, closeMin: value } }))}/><PercentField label="On-target minimum" value={draft.calories.onTargetMin} onChange={(value) => setDraft((current) => ({ ...current, calories: { ...current.calories, onTargetMin: value } }))}/><PercentField label="On-target maximum" value={draft.calories.onTargetMax} onChange={(value) => setDraft((current) => ({ ...current, calories: { ...current.calories, onTargetMax: value } }))}/><PercentField label="Close maximum" value={draft.calories.closeMax} onChange={(value) => setDraft((current) => ({ ...current, calories: { ...current.calories, closeMax: value } }))}/></div></section><section><h3>Protein minimum</h3><div><PercentField label="Close minimum" value={draft.protein.closeMin} onChange={(value) => setDraft((current) => ({ ...current, protein: { ...current.protein, closeMin: value } }))}/><PercentField label="On-target minimum" value={draft.protein.onTargetMin} onChange={(value) => setDraft((current) => ({ ...current, protein: { ...current.protein, onTargetMin: value } }))}/></div></section><section><h3>Carbohydrates and fat</h3><div><PercentField label="Close minimum" value={draft.macros.closeMin} onChange={(value) => setDraft((current) => ({ ...current, macros: { ...current.macros, closeMin: value } }))}/><PercentField label="On-target minimum" value={draft.macros.onTargetMin} onChange={(value) => setDraft((current) => ({ ...current, macros: { ...current.macros, onTargetMin: value } }))}/><PercentField label="On-target maximum" value={draft.macros.onTargetMax} onChange={(value) => setDraft((current) => ({ ...current, macros: { ...current.macros, onTargetMax: value } }))}/><PercentField label="Close maximum" value={draft.macros.closeMax} onChange={(value) => setDraft((current) => ({ ...current, macros: { ...current.macros, closeMax: value } }))}/></div></section><label className="untracked-default">Intentionally untracked days<select value={draft.untrackedDayDefault} onChange={(event) => setDraft((current) => ({ ...current, untrackedDayDefault: event.target.value as NutritionEvaluationSettings['untrackedDayDefault'] }))}><option value="excluded">Exclude from summaries</option><option value="no_data">Count as no data</option></select></label>{!valid ? <p className="form-error">Keep the percentages ordered from the outer close range to the inner on-target range.</p> : null}<p className="settings-note">Range changes affect status labels. Daily calorie and macro goals keep their dated history, so editing today’s goals does not rewrite older days.</p></div></Modal>;
}
