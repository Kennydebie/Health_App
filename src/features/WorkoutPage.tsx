import { useEffect, useState } from 'react';
import { ArrowLeft, BadgeCheck, BarChart3, BedDouble, CalendarDays, Check, ChevronRight, Clock3, Dumbbell, ExternalLink, Flame, Footprints, GripVertical, HeartPulse, History, Pause, Pencil, Play, Plus, RotateCcw, Save, ShieldCheck, SkipForward, Sparkles, Trophy, X } from 'lucide-react';
import { Modal } from '../components/Modal';
import { exerciseMap, exercises } from '../data/exercises';
import { prettyDate, toDateKey } from '../lib/date';
import { formatDuration, workoutVolume } from '../lib/progress';
import type { AppController } from '../state/useAppData';
import type { Exercise, LoggedSet, ProgramExercise, WorkoutDay, WorkoutSession } from '../types/models';

interface WorkoutPageProps {
  controller: AppController;
  activeSessionId: string | null;
  setActiveSessionId: (id: string | null) => void;
  onStartWorkout: (dayId: WorkoutDay['id']) => void;
}

function previousSets(sessions: WorkoutSession[], exerciseId: string, currentSessionId?: string) {
  return sessions.filter((session) => session.id !== currentSessionId && session.completedAt).flatMap((session) => session.sets).filter((set) => set.exerciseId === exerciseId && set.completed).slice(-3);
}

function progressionMessage(sets: LoggedSet[], prescription: ProgramExercise) {
  const completed = sets.filter((set) => set.completed);
  if (completed.length < prescription.sets) return null;
  if (completed.every((set) => set.reps >= prescription.repMax)) return { earned: true, text: 'Progression earned. Add approximately 2–2.5 kg next session while keeping 1–2 reps in reserve.' };
  if (completed.some((set) => set.reps < prescription.repMin - 2)) return { earned: false, text: 'Keep the same weight next session. Prioritize recovery and aim to rebuild lost reps.' };
  return { earned: false, text: 'Good working range. Keep this load and add reps before increasing weight.' };
}

function ExerciseDetail({ exercise, onClose }: { exercise: Exercise; onClose: () => void }) {
  return (
    <Modal open onClose={onClose} title={exercise.name} subtitle={`${exercise.primaryMuscles.join(' · ')} — technique and safety`} wide>
      <div className="exercise-detail">
        <div className="demo-panel">
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${exercise.videoId}?rel=0`}
            title={`${exercise.name} technique demonstration`}
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
          <footer><span><Play size={16} /> Exercise-specific technique video</span><a href={`https://www.youtube.com/watch?v=${exercise.videoId}`} target="_blank" rel="noreferrer">Open on YouTube <ExternalLink size={15} /></a></footer>
        </div>
        <div className="muscle-tags"><span>Primary</span>{exercise.primaryMuscles.map((muscle) => <strong key={muscle}>{muscle}</strong>)}<span>Secondary</span>{exercise.secondaryMuscles.map((muscle) => <em key={muscle}>{muscle}</em>)}</div>
        <div className="detail-columns">
          <section><h3>Set up</h3><ol>{exercise.setup.map((step) => <li key={step}>{step}</li>)}</ol></section>
          <section><h3>Execution</h3><ol>{exercise.execution.map((step) => <li key={step}>{step}</li>)}</ol></section>
          <section><h3>Breathing</h3><p>{exercise.breathing}</p><h3>Common mistakes</h3><ul>{exercise.mistakes.map((mistake) => <li key={mistake}>{mistake}</li>)}</ul></section>
          <section className="safety-panel"><ShieldCheck size={22} /><div><h3>Safety note</h3><p>{exercise.safety}</p></div></section>
        </div>
        <div className="alternatives"><span>Smart alternatives</span>{exercise.alternatives.map((item) => <strong key={item}>{item}</strong>)}</div>
      </div>
    </Modal>
  );
}

function ProgramEditor({ day, onSave, onClose }: { day: WorkoutDay; onSave: (day: WorkoutDay) => void; onClose: () => void }) {
  const [draft, setDraft] = useState<WorkoutDay>(() => structuredClone(day));
  const updateExercise = (index: number, changes: Partial<ProgramExercise>) => setDraft((current) => ({ ...current, exercises: current.exercises.map((item, itemIndex) => itemIndex === index ? { ...item, ...changes } : item) }));
  const move = (index: number, direction: -1 | 1) => setDraft((current) => {
    const target = index + direction;
    if (target < 0 || target >= current.exercises.length) return current;
    const next = [...current.exercises];
    [next[index], next[target]] = [next[target], next[index]];
    return { ...current, exercises: next };
  });
  return <Modal open onClose={onClose} title={`Edit ${day.title}`} subtitle="Replace exercises, reorder the session, or adjust sets and rep ranges." wide>
    <form className="program-editor" onSubmit={(event) => { event.preventDefault(); onSave(draft); onClose(); }}>
      {draft.exercises.map((item, index) => <div className="program-edit-row" key={`${item.exerciseId}-${index}`}>
        <GripVertical size={17} />
        <label>Exercise<select value={item.exerciseId} onChange={(event) => updateExercise(index, { exerciseId: event.target.value })}>{exercises.map((exercise) => <option key={exercise.id} value={exercise.id}>{exercise.name}</option>)}</select></label>
        <label>Sets<input type="number" min="1" max="8" value={item.sets} onChange={(event) => updateExercise(index, { sets: Math.max(1, Number(event.target.value)) })} /></label>
        <label>Rep min<input type="number" min="1" max="50" value={item.repMin} onChange={(event) => updateExercise(index, { repMin: Math.max(1, Number(event.target.value)) })} /></label>
        <label>Rep max<input type="number" min={item.repMin} max="50" value={item.repMax} onChange={(event) => updateExercise(index, { repMax: Math.max(item.repMin, Number(event.target.value)) })} /></label>
        <div className="reorder-buttons"><button type="button" onClick={() => move(index, -1)} aria-label="Move exercise up">↑</button><button type="button" onClick={() => move(index, 1)} aria-label="Move exercise down">↓</button><button type="button" className="danger" onClick={() => setDraft((current) => ({ ...current, exercises: current.exercises.filter((_, itemIndex) => itemIndex !== index) }))} aria-label="Remove exercise"><X size={15} /></button></div>
      </div>)}
      <button className="secondary-button full" type="button" onClick={() => setDraft((current) => ({ ...current, exercises: [...current.exercises, { exerciseId: 'db-curl', sets: 2, repMin: 10, repMax: 15, restSeconds: 75, rir: '1–2' }] }))}><Plus size={17} /> Add exercise</button>
      <button className="primary-button full" type="submit"><Save size={18} /> Save program</button>
    </form>
  </Modal>;
}

interface RestTimerProps { initialSeconds: number; onClose: () => void; }
function RestTimer({ initialSeconds, onClose }: RestTimerProps) {
  const [preset, setPreset] = useState(initialSeconds);
  const [remaining, setRemaining] = useState(initialSeconds);
  const [running, setRunning] = useState(true);
  useEffect(() => {
    if (!running || remaining <= 0) return;
    const timer = window.setInterval(() => setRemaining((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [running, remaining]);
  useEffect(() => {
    if (remaining !== 0 || !('vibrate' in navigator)) return;
    navigator.vibrate([150, 80, 150]);
  }, [remaining]);
  const choose = (seconds: number) => { setPreset(seconds); setRemaining(seconds); setRunning(true); };
  return <div className={`rest-timer ${remaining === 0 ? 'complete' : ''}`}>
    <div className="rest-timer__top"><div><p className="eyebrow">Rest timer</p><h2>{remaining === 0 ? 'Next set ready' : formatDuration(remaining)}</h2></div><button className="icon-button" type="button" onClick={onClose} aria-label="Close rest timer"><X size={18} /></button></div>
    <div className="timer-progress"><span style={{ width: `${Math.max(0, Math.min(100, remaining / preset * 100))}%` }} /></div>
    <div className="timer-presets">{[60, 90, 120, 180].map((seconds) => <button type="button" className={preset === seconds ? 'active' : ''} key={seconds} onClick={() => choose(seconds)}>{seconds}s</button>)}</div>
    <div className="timer-controls"><button type="button" onClick={() => setRunning((value) => !value)}>{running ? <Pause size={17} /> : <Play size={17} />}{running ? 'Pause' : 'Resume'}</button><button type="button" onClick={() => { setRemaining(preset); setRunning(true); }}><RotateCcw size={17} /> Reset</button><button type="button" onClick={onClose}><SkipForward size={17} /> Skip</button></div>
  </div>;
}

function ActiveWorkout({ controller, session, onBack, onFinished }: { controller: AppController; session: WorkoutSession; onBack: () => void; onFinished: () => void }) {
  const day = controller.data.program.find((item) => item.id === session.dayId)!;
  const [exerciseId, setExerciseId] = useState(session.sets.find((set) => !set.completed)?.exerciseId ?? day.exercises[0].exerciseId);
  const [elapsed, setElapsed] = useState(() => Math.floor((Date.now() - new Date(session.startedAt).getTime()) / 1000));
  const [restSeconds, setRestSeconds] = useState<number | null>(null);
  const [details, setDetails] = useState<Exercise | null>(null);
  useEffect(() => { const timer = window.setInterval(() => setElapsed((value) => value + 1), 1000); return () => window.clearInterval(timer); }, []);
  const prescription = day.exercises.find((item) => item.exerciseId === exerciseId)!;
  const currentSets = session.sets.filter((set) => set.exerciseId === exerciseId);
  const previous = previousSets(controller.data.sessions, exerciseId, session.id);
  const progress = progressionMessage(currentSets, prescription);
  const completedCount = session.sets.filter((set) => set.completed).length;
  const currentExercise = exerciseMap.get(exerciseId)!;

  const completeSet = (set: LoggedSet) => {
    controller.updateWorkoutSet(session.id, set.id, { completed: !set.completed });
    if (!set.completed) setRestSeconds(prescription.restSeconds);
  };

  return <div className="active-workout page">
    <header className="active-workout__header"><div><button type="button" className="back-button" onClick={onBack}><ArrowLeft size={18} /> Back to program</button><p className="eyebrow">Live session · {day.label}</p><h1>{session.title}</h1></div><div className="session-clock"><Clock3 size={18} /><strong>{formatDuration(elapsed)}</strong><span>{completedCount} / {session.sets.length} sets</span></div></header>
    <div className="session-progress"><span style={{ width: `${completedCount / session.sets.length * 100}%` }} /></div>
    <div className="active-layout">
      <aside className="session-exercises"><p className="eyebrow">Exercise order</p>{day.exercises.map((item, index) => {
        const sets = session.sets.filter((set) => set.exerciseId === item.exerciseId);
        const done = sets.filter((set) => set.completed).length;
        return <button type="button" key={item.exerciseId} onClick={() => setExerciseId(item.exerciseId)} className={exerciseId === item.exerciseId ? 'active' : done === sets.length ? 'done' : ''}><span>{done === sets.length ? <Check size={16} /> : index + 1}</span><p>{exerciseMap.get(item.exerciseId)?.name}<small>{done} / {sets.length} sets</small></p><ChevronRight size={17} /></button>;
      })}<button type="button" className="finish-session" onClick={() => { controller.finishWorkout(session.id, elapsed); onFinished(); }} disabled={completedCount === 0}><Trophy size={18} /> Finish workout</button></aside>
      <section className="set-logger">
        <header><div><p className="eyebrow">Current exercise</p><h2>{currentExercise.name}</h2><p>Target: {prescription.sets} × {prescription.repMin}–{prescription.repMax} · {prescription.rir} RIR · Rest {formatDuration(prescription.restSeconds)}</p></div><button type="button" className="secondary-button" onClick={() => setDetails(currentExercise)}>Technique <ChevronRight size={17} /></button></header>
        <div className="previous-performance"><span>Previous workout</span>{previous.length ? previous.map((set) => <strong key={set.id}>{set.weightKg} kg × {set.reps}</strong>) : <em>No previous performance—start conservatively.</em>}</div>
        <div className="set-table"><div className="set-table__head"><span>Set</span><span>Weight (kg)</span><span>Reps</span><span>Complete</span></div>{currentSets.map((set) => <div className={`set-row ${set.completed ? 'complete' : ''}`} key={set.id}>
          <strong>{set.setNumber}</strong><label><span className="sr-only">Set {set.setNumber} weight</span><input inputMode="decimal" min="0" step="0.5" type="number" value={set.weightKg || ''} onChange={(event) => controller.updateWorkoutSet(session.id, set.id, { weightKg: Math.max(0, Number(event.target.value)) })} /></label><label><span className="sr-only">Set {set.setNumber} reps</span><input inputMode="numeric" min="0" max="100" type="number" value={set.reps || ''} onChange={(event) => controller.updateWorkoutSet(session.id, set.id, { reps: Math.max(0, Number(event.target.value)) })} /></label><button type="button" onClick={() => completeSet(set)} disabled={!set.completed && set.reps <= 0} aria-label={`${set.completed ? 'Unmark' : 'Complete'} set ${set.setNumber}`}>{set.completed ? <Check size={19} /> : <span />}</button>
        </div>)}</div>
        {progress ? <div className={`progression-callout ${progress.earned ? 'earned' : ''}`}><Sparkles size={20} /><p><strong>{progress.earned ? 'Progression earned' : 'Next-session guidance'}</strong>{progress.text}</p></div> : null}
      </section>
    </div>
    {restSeconds !== null ? <RestTimer initialSeconds={restSeconds} onClose={() => setRestSeconds(null)} /> : null}
    {details ? <ExerciseDetail exercise={details} onClose={() => setDetails(null)} /> : null}
  </div>;
}

function WorkoutHistory({ sessions, onOpen }: { sessions: WorkoutSession[]; onOpen: (session: WorkoutSession) => void }) {
  const completed = [...sessions].filter((session) => session.completedAt).sort((a, b) => b.date.localeCompare(a.date));
  return <section className="history-list">{completed.length ? completed.map((session) => <button type="button" className="history-card card" key={session.id} onClick={() => onOpen(session)}><div className="history-date"><span>{new Date(`${session.date}T12:00:00`).getDate()}</span><small>{new Intl.DateTimeFormat('en', { month: 'short' }).format(new Date(`${session.date}T12:00:00`))}</small></div><div><p className="eyebrow">{prettyDate(session.date)}</p><h3>{session.title}</h3><span>{formatDuration(session.durationSeconds)} · {session.sets.filter((set) => set.completed).length} working sets</span></div><div className="volume-stat"><strong>{Math.round(workoutVolume(session)).toLocaleString()}</strong><span>kg volume</span></div><ChevronRight size={19} /></button>) : <div className="empty-state card"><History size={30} /><h3>No workouts yet</h3><p>Finish your first session and the full log will appear here.</p></div>}</section>;
}

export function WorkoutPage({ controller, activeSessionId, setActiveSessionId, onStartWorkout }: WorkoutPageProps) {
  const fallbackActive = [...controller.data.sessions].reverse().find((session) => !session.completedAt);
  const activeSession = controller.data.sessions.find((session) => session.id === activeSessionId) ?? fallbackActive;
  const [selectedDayId, setSelectedDayId] = useState<WorkoutDay['id']>(() => new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(new Date()).toLowerCase() as WorkoutDay['id']);
  const [view, setView] = useState<'program' | 'history'>('program');
  const [details, setDetails] = useState<Exercise | null>(null);
  const [editingDay, setEditingDay] = useState<WorkoutDay | null>(null);
  const [historySession, setHistorySession] = useState<WorkoutSession | null>(null);
  const [hideActiveSession, setHideActiveSession] = useState(false);
  const day = controller.data.program.find((item) => item.id === selectedDayId)!;
  const selectedIndex = controller.data.program.findIndex((item) => item.id === selectedDayId);
  const nextTrainingDay = [...controller.data.program.slice(selectedIndex + 1), ...controller.data.program.slice(0, selectedIndex + 1)].find((item) => !item.isRestDay);
  const today = toDateKey();
  const previousCompleted = controller.data.sessions.filter((session) => session.completedAt);

  if (activeSession && !activeSession.completedAt && !hideActiveSession) return <ActiveWorkout controller={controller} session={activeSession} onBack={() => setHideActiveSession(true)} onFinished={() => { setActiveSessionId(null); setHideActiveSession(true); setView('history'); }} />;

  return <div className="page workout-page">
    <header className="page-header workout-header"><div><p className="eyebrow">Seven-day strength plan</p><h1>Keep the muscle.</h1><p>Four focused lifting days, three recovery days, and every major muscle group trained twice weekly.</p></div><div className="view-toggle"><button type="button" className={view === 'program' ? 'active' : ''} onClick={() => setView('program')}><Dumbbell size={17} /> Program</button><button type="button" className={view === 'history' ? 'active' : ''} onClick={() => setView('history')}><History size={17} /> History</button></div></header>
    {view === 'program' ? <>
      {activeSession && !activeSession.completedAt ? <button type="button" className="resume-banner" onClick={() => setHideActiveSession(false)}><Play size={18} /><span><strong>{activeSession.title} is in progress</strong><small>{activeSession.sets.filter((set) => set.completed).length} of {activeSession.sets.length} sets complete</small></span><ChevronRight size={18} /></button> : null}
      <section className="day-tabs" aria-label="Weekly workout schedule">{controller.data.program.map((item) => { const completed = !item.isRestDay && controller.data.sessions.some((session) => session.dayId === item.id && session.completedAt && session.date === today); const isSelected = selectedDayId === item.id; return <button type="button" key={item.id} aria-current={isSelected ? 'date' : undefined} className={`${isSelected ? 'active' : ''} ${item.isRestDay ? 'rest-day' : 'training-day'}`} onClick={() => setSelectedDayId(item.id)}><span>{item.label}</span><strong>{item.title}</strong><small>{completed ? <><BadgeCheck size={14} /> Completed</> : item.isRestDay ? 'Recovery day' : isSelected ? 'Selected session' : 'Training day'}</small></button>; })}</section>
      <section className={`program-layout ${day.isRestDay ? 'rest-layout' : ''}`}>
        {day.isRestDay ? <article className="program-main recovery-main card"><header><div><p className="eyebrow">{day.label} recovery</p><h2>{day.title}</h2><span><HeartPulse size={16} /> No lifting scheduled</span></div><span className="recovery-badge">Rest day</span></header>
          <div className="recovery-plan"><span className="recovery-orb"><HeartPulse size={26} /></span><div><p className="eyebrow">Today’s objective</p><h3>Recover without turning rest into another workout.</h3><p>The adaptation happens between sessions. Keep optional movement easy enough that you feel better afterward.</p></div><ul>{day.recovery?.map((item) => <li key={item}><Check size={16} />{item}</li>)}</ul></div>
          {nextTrainingDay ? <button type="button" className="secondary-button next-session" onClick={() => setSelectedDayId(nextTrainingDay.id)}><CalendarDays size={18} /> Next: {nextTrainingDay.label} · {nextTrainingDay.title}<ChevronRight size={17} /></button> : null}
        </article> : <article className="program-main card"><header><div><p className="eyebrow">{day.label} session</p><h2>{day.title}</h2><span><Clock3 size={16} /> {day.duration} · {day.exercises.length} exercises</span></div><button type="button" className="secondary-button" onClick={() => setEditingDay(day)}><Pencil size={16} /> Edit program</button></header>
          <div className="program-list">{day.exercises.map((item, index) => {
            const exercise = exerciseMap.get(item.exerciseId)!;
            const previous = previousSets(previousCompleted, item.exerciseId);
            const best = previous.reduce((max, set) => Math.max(max, set.weightKg), 0);
            return <div className="program-exercise" key={`${item.exerciseId}-${index}`}><span className="exercise-index">{String(index + 1).padStart(2, '0')}</span><button type="button" className="program-exercise__main" onClick={() => setDetails(exercise)}><div><h3>{exercise.name}</h3><p>{exercise.primaryMuscles.join(' · ')}</p></div><div className="prescription"><strong>{item.sets} × {item.repMin}–{item.repMax}</strong><span>{formatDuration(item.restSeconds)} rest · {item.rir} RIR</span></div>{best ? <div className="last-load"><strong>{best} kg</strong><span>recent best</span></div> : <div className="last-load"><strong>—</strong><span>no history</span></div>}<ChevronRight size={19} /></button></div>;
          })}</div>
          <button type="button" className="primary-button start-workout" onClick={() => activeSession && !activeSession.completedAt ? setHideActiveSession(false) : onStartWorkout(day.id)}><Flame size={19} /> {activeSession && !activeSession.completedAt ? 'Resume active workout' : `Start ${day.title}`}</button>
        </article>}
        <aside className="workout-guidance">
          {day.isRestDay ? <><article className="card overload-card"><span className="metric-icon lime"><BedDouble size={19} /></span><p className="eyebrow">Recovery is programmed</p><h3>Nothing to make up.</h3><p>Rest days are part of the four-day split. Missing the urge to add hard cardio is not missing training.</p><div><Sparkles size={16} /> Recover → adapt → train</div></article><article className="card squat-card"><span className="metric-icon blue"><Footprints size={19} /></span><p className="eyebrow">Optional movement</p><h3>Easy means easy</h3><p>A relaxed walk or short mobility session is enough. Stop before it adds fatigue.</p></article></> : <><article className="card overload-card"><span className="metric-icon lime"><BarChart3 size={19} /></span><p className="eyebrow">Progressive overload</p><h3>Earn the increase.</h3><p>Reach the top of the rep range across all working sets at the planned effort before adding load.</p><div><Sparkles size={16} /> Reps → load → repeat</div></article><article className="card squat-card"><p className="eyebrow">Balance-first squat path</p><h3>Control before load</h3><ol><li>Assisted squat</li><li>Box squat</li><li>Supported goblet squat</li><li>Goblet squat</li><li>Split squat</li></ol><button type="button" className="text-button" onClick={() => setDetails(exerciseMap.get('goblet-squat')!)}>Open squat guide <ChevronRight size={17} /></button></article></>}
        </aside>
      </section>
    </> : <WorkoutHistory sessions={controller.data.sessions} onOpen={setHistorySession} />}
    {details ? <ExerciseDetail exercise={details} onClose={() => setDetails(null)} /> : null}
    {editingDay ? <ProgramEditor day={editingDay} onSave={controller.updateProgramDay} onClose={() => setEditingDay(null)} /> : null}
    <Modal open={Boolean(historySession)} onClose={() => setHistorySession(null)} title={historySession?.title ?? 'Workout'} subtitle={historySession ? `${prettyDate(historySession.date, true)} · ${formatDuration(historySession.durationSeconds)}` : undefined} wide>
      {historySession ? <div className="workout-log-detail"><div className="history-totals"><div><strong>{historySession.sets.filter((set) => set.completed).length}</strong><span>sets</span></div><div><strong>{Math.round(workoutVolume(historySession)).toLocaleString()}</strong><span>kg volume</span></div><div><strong>{new Set(historySession.sets.filter((set) => set.completed).map((set) => set.exerciseId)).size}</strong><span>exercises</span></div></div>{[...new Set(historySession.sets.map((set) => set.exerciseId))].map((exerciseId) => <section key={exerciseId}><h3>{exerciseMap.get(exerciseId)?.name}</h3>{historySession.sets.filter((set) => set.exerciseId === exerciseId).map((set) => <p key={set.id}><span>Set {set.setNumber}</span><strong>{set.weightKg} kg × {set.reps}</strong>{set.completed ? <Check size={16} /> : null}</p>)}</section>)}</div> : null}
    </Modal>
  </div>;
}
