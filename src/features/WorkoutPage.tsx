import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Activity, AlertTriangle, ArrowLeft, BadgeCheck, BarChart3, BedDouble, CalendarDays, Check, CheckCircle2, ChevronLeft, ChevronRight, Circle, Clock3, Dumbbell, ExternalLink, Flame, Footprints, GripVertical, HeartPulse, History, Info, ListChecks, Minus, Move, Pause, Pencil, Play, Plus, RefreshCw, Save, ShieldCheck, Shuffle, SkipForward, Sparkles, Target, Trophy, X } from 'lucide-react';
import { Modal } from '../components/Modal';
import { BodyFocus, ToneIcon } from '../components/Visuals';
import { exerciseMap, exercises } from '../data/exercises';
import { prettyDate, toDateKey } from '../lib/date';
import { datesInCalendarMonth, displayWorkoutTitle, getWeekSnapshot } from '../lib/engagement';
import { formatDuration, workoutVolume } from '../lib/progress';
import { analyzeWeeklyProgram, exceedsBalanceLevel, isEquipmentCompatible, progressionRecommendation, squatProgressionLevels, squatReadinessCriteria } from '../lib/workout';
import { availableSessionOptions, isStrengthTemplate, lastPerformed, plannerWarnings, recoveryForSession, sessionOption, sessionType, weeklyBalance, weekDates, workoutTemplate } from '../lib/adaptivePlanner';
import type { AppController } from '../state/useAppData';
import type { CardioEntry, Exercise, LoggedSet, ProgramExercise, ReadinessResponse, SessionTemplateId, TrainingDayPlan, TrainingTemplate, UserProfile, WorkoutDay, WorkoutSession } from '../types/models';

interface WorkoutPageProps {
  controller: AppController;
  activeSessionId: string | null;
  setActiveSessionId: (id: string | null) => void;
  onStartWorkout: (templateId: SessionTemplateId, date?: string) => void;
}

const calendarMonthFormatter = new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' });
const calendarDayFormatter = new Intl.DateTimeFormat('en', { weekday: 'long', month: 'long', day: 'numeric' });

function previousSets(sessions: WorkoutSession[], exerciseId: string, currentSessionId?: string) {
  return sessions.filter((session) => session.id !== currentSessionId && session.completedAt).flatMap((session) => session.sets).filter((set) => set.exerciseId === exerciseId && set.completed && !set.isWarmup).slice(-3);
}

function ExerciseDetail({ exercise, onClose }: { exercise: Exercise; onClose: () => void }) {
  return <Modal open onClose={onClose} title={exercise.name} subtitle={`${exercise.primaryMuscles.join(' · ')} — technique and safety`} wide>
    <div className="exercise-detail">
      <div className="exercise-detail-hero"><div>{exercise.videoId ? <div className="demo-panel">
          <iframe src={`https://www.youtube-nocookie.com/embed/${exercise.videoId}?rel=0`} title={`${exercise.name} technique demonstration`} loading="lazy" referrerPolicy="strict-origin-when-cross-origin" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen />
          <footer><span><Play size={16} /> Exercise-specific technique video</span><a href={`https://www.youtube.com/watch?v=${exercise.videoId}`} target="_blank" rel="noreferrer">Open on YouTube <ExternalLink size={15} /></a></footer>
        </div> : <div className="video-fallback"><Play size={24} /><div><strong>No reliable embed selected</strong><p>{exercise.videoFallback}</p></div></div>}</div><aside><p className="eyebrow">Primary focus</p><BodyFocus muscles={exercise.primaryMuscles} /><strong>{exercise.primaryMuscles.join(' · ')}</strong><span>Stylized broad-region guide</span></aside></div>
      <div className="exercise-metadata"><span><strong>Pattern</strong>{exercise.movementPatterns.join(' · ') || 'Accessory'}</span><span><strong>Equipment</strong>{exercise.requiredEquipment.join(' · ')}</span><span><strong>Balance</strong>{exercise.balanceRequirement === 'none' ? 'No special demand' : exercise.balanceRequirement}</span></div>
      <div className="muscle-tags"><span>Primary</span>{exercise.primaryMuscles.map((muscle) => <strong key={muscle}>{muscle}</strong>)}<span>Secondary</span>{exercise.secondaryMuscles.map((muscle) => <em key={muscle}>{muscle}</em>)}</div>
      <div className="detail-columns">
        <section><h3>Set up</h3><ol>{exercise.setup.map((step) => <li key={step}>{step}</li>)}</ol></section>
        <section><h3>Execution</h3><ol>{exercise.execution.map((step) => <li key={step}>{step}</li>)}</ol></section>
        <section><h3>Breathing</h3><p>{exercise.breathing}</p><h3>Common mistakes</h3><ul>{exercise.mistakes.map((mistake) => <li key={mistake}>{mistake}</li>)}</ul></section>
        <section className="safety-panel"><ShieldCheck size={22} /><div><h3>Safety note</h3><p>{exercise.safety}</p></div></section>
      </div>
      <div className="alternatives"><span>Equipment-compatible alternatives</span>{exercise.alternatives.map((item) => <strong key={item}>{item}<ChevronRight size={14} /></strong>)}</div>
    </div>
  </Modal>;
}

function ProgramEditor({ day, program, profile, onSave, onClose }: { day: WorkoutDay; program: WorkoutDay[]; profile: UserProfile; onSave: (day: WorkoutDay) => void; onClose: () => void }) {
  const [draft, setDraft] = useState<WorkoutDay>(() => structuredClone(day));
  const [compatibleOnly, setCompatibleOnly] = useState(true);
  const updateExercise = (index: number, changes: Partial<ProgramExercise>) => setDraft((current) => ({ ...current, exercises: current.exercises.map((item, itemIndex) => itemIndex === index ? { ...item, ...changes } : item) }));
  const chooseExercise = (index: number, exerciseId: string) => {
    const selected = exerciseMap.get(exerciseId);
    if (!selected) return;
    updateExercise(index, { exerciseId, ...selected.defaultPrescription, variationGroup: undefined });
  };
  const move = (index: number, direction: -1 | 1) => setDraft((current) => {
    const target = index + direction;
    if (target < 0 || target >= current.exercises.length) return current;
    const next = [...current.exercises];
    [next[index], next[target]] = [next[target], next[index]];
    return { ...current, exercises: next };
  });
  const availableExercises = compatibleOnly ? exercises.filter((exercise) => isEquipmentCompatible(exercise.id, profile.equipment)) : exercises;
  const analyzedProgram = useMemo(() => analyzeWeeklyProgram(program.map((item) => item.id === draft.id ? draft : item), profile), [draft, profile, program]);

  return <Modal open onClose={onClose} title={`Edit ${displayWorkoutTitle(day)}`} subtitle="Changes are saved locally. Warnings guide you but never block deliberate choices." wide>
    <form className="program-editor" onSubmit={(event) => { event.preventDefault(); onSave(draft); onClose(); }}>
      <div className="editor-toolbar"><label><input type="checkbox" checked={compatibleOnly} onChange={(event) => setCompatibleOnly(event.target.checked)} /> Show equipment-compatible exercises only</label><span>{compatibleOnly ? `${availableExercises.length} compatible` : 'Override enabled'}</span></div>
      {draft.exercises.map((item, index) => {
        const selected = exerciseMap.get(item.exerciseId);
        const incompatible = !isEquipmentCompatible(item.exerciseId, profile.equipment);
        const balanceWarning = exceedsBalanceLevel(item.exerciseId, profile.balanceLevel);
        const options = availableExercises.some((exercise) => exercise.id === item.exerciseId) ? availableExercises : selected ? [selected, ...availableExercises] : availableExercises;
        return <div className="program-edit-row" key={`${item.exerciseId}-${index}`}>
          <GripVertical size={17} />
          <label className="editor-exercise">Exercise<select value={item.exerciseId} onChange={(event) => chooseExercise(index, event.target.value)}>{options.map((exercise) => <option key={exercise.id} value={exercise.id}>{exercise.name}</option>)}</select>{incompatible || balanceWarning ? <small className="editor-warning">{incompatible ? 'Unavailable equipment' : 'Above selected balance level'}</small> : null}</label>
          <label>Sets<input type="number" min="1" max="8" value={item.sets} onChange={(event) => updateExercise(index, { sets: Math.max(1, Number(event.target.value)) })} /></label>
          <label>Rep min<input type="number" min="1" max="60" value={item.repMin} onChange={(event) => updateExercise(index, { repMin: Math.max(1, Number(event.target.value)) })} /></label>
          <label>Rep max<input type="number" min={item.repMin} max="60" value={item.repMax} onChange={(event) => updateExercise(index, { repMax: Math.max(item.repMin, Number(event.target.value)) })} /></label>
          <label>Rest (sec)<input type="number" min="30" max="300" step="15" value={item.restSeconds} onChange={(event) => updateExercise(index, { restSeconds: Math.max(30, Number(event.target.value)) })} /></label>
          <label>Target RIR<input type="text" value={item.rir} onChange={(event) => updateExercise(index, { rir: event.target.value })} /></label>
          <label>Warm-ups<input type="number" min="0" max="4" value={item.warmupSets ?? 0} onChange={(event) => updateExercise(index, { warmupSets: Math.max(0, Number(event.target.value)) })} /></label>
          <label className="editor-notes">Notes<input type="text" value={item.notes ?? ''} placeholder="Optional technique or side-specific note" onChange={(event) => updateExercise(index, { notes: event.target.value })} /></label>
          {item.variationGroup === 'squat-progression' ? <label className="editor-variation">Squat level<select value={item.exerciseId} onChange={(event) => updateExercise(index, { exerciseId: event.target.value })}>{squatProgressionLevels.map((level) => <option key={level.id} value={level.id}>{level.label}</option>)}</select></label> : null}
          <div className="reorder-buttons"><button type="button" onClick={() => move(index, -1)} aria-label="Move exercise up">↑</button><button type="button" onClick={() => move(index, 1)} aria-label="Move exercise down">↓</button><button type="button" className="danger" onClick={() => setDraft((current) => ({ ...current, exercises: current.exercises.filter((_, itemIndex) => itemIndex !== index) }))} aria-label="Remove exercise"><X size={15} /></button></div>
        </div>;
      })}
      <button className="secondary-button full" type="button" onClick={() => { const selected = availableExercises[0] ?? exercises[0]; setDraft((current) => ({ ...current, exercises: [...current.exercises, { exerciseId: selected.id, ...selected.defaultPrescription }] })); }}><Plus size={17} /> Add exercise</button>
      {analyzedProgram.warnings.length ? <div className="program-warnings"><header><AlertTriangle size={17} /><strong>Program checks</strong><span>Non-blocking</span></header>{analyzedProgram.warnings.map((warning) => <p key={warning}>{warning}</p>)}</div> : <div className="program-clear"><CheckCircle2 size={17} /> No coverage, equipment, or balance warnings detected.</div>}
      <button className="primary-button full" type="submit"><Save size={18} /> Save program</button>
    </form>
  </Modal>;
}

interface RestTimerProps { initialSeconds: number; onClose: () => void; }
function RestTimer({ initialSeconds, onClose }: RestTimerProps) {
  const [preset, setPreset] = useState(initialSeconds);
  const [remaining, setRemaining] = useState(initialSeconds);
  const [running, setRunning] = useState(true);
  useEffect(() => { if (!running || remaining <= 0) return; const timer = window.setInterval(() => setRemaining((value) => Math.max(0, value - 1)), 1000); return () => window.clearInterval(timer); }, [running, remaining]);
  useEffect(() => { if (remaining !== 0 || !('vibrate' in navigator)) return; navigator.vibrate([150, 80, 150]); }, [remaining]);
  const choose = (seconds: number) => { setPreset(seconds); setRemaining(seconds); setRunning(true); };
  const percent = Math.max(0, Math.min(100, remaining / Math.max(1, preset) * 100));
  return <div className={`rest-timer ${remaining === 0 ? 'complete' : ''} ${remaining <= 10 ? 'nearly-ready' : ''}`}>
    <div className="rest-timer__top"><p className="eyebrow">Rest timer</p><button className="icon-button" type="button" onClick={onClose} aria-label="Close rest timer"><X size={18} /></button></div>
    <div className="timer-dial" style={{ '--timer-progress': `${percent * 3.6}deg` } as CSSProperties}><div><Clock3 size={18} /><h2>{remaining === 0 ? 'Ready' : formatDuration(remaining)}</h2><span>{remaining === 0 ? 'Next set' : 'Recover'}</span></div></div>
    <div className="timer-presets">{[60, 90, 120, 180].map((seconds) => <button type="button" className={preset === seconds ? 'active' : ''} key={seconds} onClick={() => choose(seconds)}>{seconds}s</button>)}</div>
    <div className="timer-controls"><button type="button" onClick={() => setRunning((value) => !value)}>{running ? <Pause size={17} /> : <Play size={17} />}{running ? 'Pause' : 'Resume'}</button><button type="button" onClick={() => { setRemaining((value) => value + 30); setPreset((value) => value + 30); setRunning(true); }}><Plus size={17} /> 30 sec</button><button type="button" onClick={onClose}><SkipForward size={17} /> Skip</button></div>
  </div>;
}

function ActiveWorkout({ controller, session, onBack, onFinished }: { controller: AppController; session: WorkoutSession; onBack: () => void; onFinished: () => void }) {
  const day = controller.data.program.find((item) => item.workoutId === session.workoutId) ?? controller.data.program.find((item) => item.id === session.dayId) ?? controller.data.program.find((item) => !item.isRestDay) ?? controller.data.program[0];
  const sessionExerciseIds = [...new Set(session.sets.map((set) => set.exerciseId))].filter((id) => exerciseMap.has(id));
  const exerciseOrder = sessionExerciseIds.length ? sessionExerciseIds : day.exercises.map((item) => item.exerciseId).filter((id) => exerciseMap.has(id));
  const initialExerciseId = session.sets.find((set) => !set.completed && exerciseMap.has(set.exerciseId))?.exerciseId ?? exerciseOrder[0];
  const [exerciseId, setExerciseId] = useState(initialExerciseId);
  const [elapsed, setElapsed] = useState(() => Math.floor((Date.now() - new Date(session.startedAt).getTime()) / 1000));
  const [restSeconds, setRestSeconds] = useState<number | null>(null);
  const [details, setDetails] = useState<Exercise | null>(null);
  const [playingExerciseId, setPlayingExerciseId] = useState<string | null>(null);
  const [confirmedExerciseId, setConfirmedExerciseId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ tone: 'standard' | 'improved' | 'record'; text: string } | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  useEffect(() => { const timer = window.setInterval(() => setElapsed((value) => value + 1), 1000); return () => window.clearInterval(timer); }, []);
  useEffect(() => { if (!feedback) return; const timer = window.setTimeout(() => setFeedback(null), 2400); return () => window.clearTimeout(timer); }, [feedback]);
  const currentExercise = exerciseMap.get(exerciseId) ?? exerciseMap.get(day.exercises[0]?.exerciseId);
  if (!currentExercise) return <div className="empty-state card"><Info size={30} /><h3>This saved workout cannot be resumed.</h3><p>Your completed history is still preserved. Return to the program and start a current session.</p><button type="button" className="secondary-button" onClick={onBack}>Back to program</button></div>;
  const scheduledPrescription = day.exercises.find((item) => item.exerciseId === exerciseId);
  const currentSets = session.sets.filter((set) => set.exerciseId === exerciseId);
  const prescription = scheduledPrescription ? { ...scheduledPrescription, sets: Math.max(1, currentSets.filter((set) => !set.isWarmup).length) } : { exerciseId, ...currentExercise.defaultPrescription, sets: Math.max(1, currentSets.filter((set) => !set.isWarmup).length) };
  const previous = previousSets(controller.data.sessions, exerciseId, session.id);
  const progress = progressionRecommendation(controller.data.sessions, exerciseId, prescription, session.id);
  const workingCompleted = session.sets.filter((set) => set.completed && !set.isWarmup).length;
  const totalWorking = session.sets.filter((set) => !set.isWarmup).length;
  const currentWorkingSets = currentSets.filter((set) => !set.isWarmup);
  const currentWorkingCompleted = currentWorkingSets.filter((set) => set.completed).length;
  const nextExerciseId = exerciseOrder[exerciseOrder.indexOf(exerciseId) + 1];
  const nextExercise = nextExerciseId ? exerciseMap.get(nextExerciseId) : undefined;
  const previousSession = [...controller.data.sessions].reverse().find((item) => item.id !== session.id && item.completedAt && item.workoutId === session.workoutId);
  const previousVolume = previousSession ? workoutVolume(previousSession) : 0;
  const currentVolume = workoutVolume(session);
  const exerciseCompletedCount = exerciseOrder.filter((id) => { const sets = session.sets.filter((set) => set.exerciseId === id && !set.isWarmup); return sets.length > 0 && sets.every((set) => set.completed); }).length;
  const recordCount = exerciseOrder.filter((id) => {
    const currentBest = Math.max(0, ...session.sets.filter((set) => set.exerciseId === id && set.completed && !set.isWarmup).map((set) => set.weightKg * (1 + set.reps / 30)));
    const priorBest = Math.max(0, ...controller.data.sessions.filter((item) => item.id !== session.id && item.completedAt).flatMap((item) => item.sets).filter((set) => set.exerciseId === id && set.completed && !set.isWarmup).map((set) => set.weightKg * (1 + set.reps / 30)));
    return currentBest > priorBest && currentBest > 0;
  }).length;
  const selectExercise = (id: string) => { setExerciseId(id); setPlayingExerciseId(null); };
  const completeSet = (set: LoggedSet) => {
    controller.updateWorkoutSet(session.id, set.id, { completed: !set.completed });
    if (set.completed) return;
    if (!set.isWarmup) {
      const comparable = previous.find((item) => item.setNumber === set.setNumber) ?? previous[set.setNumber - 1];
      const priorMax = Math.max(0, ...previous.map((item) => item.weightKg * (1 + item.reps / 30)));
      const currentEstimate = set.weightKg * (1 + set.reps / 30);
      if (currentEstimate > priorMax && priorMax > 0) setFeedback({ tone: 'record', text: 'New personal best' });
      else if (comparable && set.weightKg === comparable.weightKg && set.reps > comparable.reps) setFeedback({ tone: 'improved', text: 'Rep improvement' });
      else if (comparable && set.weightKg === comparable.weightKg && set.reps === comparable.reps) setFeedback({ tone: 'standard', text: 'Matched last session' });
      else setFeedback({ tone: 'standard', text: 'Set complete' });
    } else setFeedback({ tone: 'standard', text: 'Warm-up complete' });
    setRestSeconds(set.isWarmup ? 60 : prescription.restSeconds);
  };

  return <div className="active-workout page workout-page">
    <header className="active-workout__header"><div><button type="button" className="back-button" onClick={onBack}><ArrowLeft size={18} /> Back to program</button><p className="eyebrow">Live session · {day.label}</p><h1>{day.isRestDay ? session.title : displayWorkoutTitle(day)}</h1><p className="active-focus">{day.isRestDay ? 'Saved session from your previous schedule' : day.focus}</p></div><div className="session-clock"><Clock3 size={18} /><strong>{formatDuration(elapsed)}</strong><span>{workingCompleted} / {totalWorking} working sets</span></div></header>
    <div className="session-safety"><ShieldCheck size={17} /> Stop for sharp pain, dizziness, or instability. Regress the movement and seek professional assessment when appropriate.</div>
    <div className="session-progress"><span style={{ width: `${totalWorking ? workingCompleted / totalWorking * 100 : 0}%` }} /></div>
    <div className="active-layout">
      <aside className="session-exercises"><p className="eyebrow">Exercise order</p>{exerciseOrder.map((itemExerciseId, index) => { const sets = session.sets.filter((set) => set.exerciseId === itemExerciseId && !set.isWarmup); const done = sets.filter((set) => set.completed).length; return <button type="button" key={itemExerciseId} onClick={() => selectExercise(itemExerciseId)} className={exerciseId === itemExerciseId ? 'active' : done === sets.length && sets.length > 0 ? 'done' : ''}><span>{done === sets.length && sets.length > 0 ? <Check size={16} /> : index + 1}</span><p>{exerciseMap.get(itemExerciseId)?.name}<small>{done} / {sets.length} working sets</small></p><ChevronRight size={17} /></button>; })}<button type="button" className="finish-session" onClick={() => setSummaryOpen(true)} disabled={workingCompleted === 0}><Trophy size={18} /> Review workout</button></aside>
      <section className="set-logger">
        <div className={`active-exercise-hero ${playingExerciseId === currentExercise.id ? 'video-playing' : ''}`}>
          {currentExercise.videoId && playingExerciseId === currentExercise.id ? <div className="inline-video-player"><iframe src={`https://www.youtube-nocookie.com/embed/${currentExercise.videoId}?autoplay=1&rel=0&modestbranding=1`} title={`${currentExercise.name} technique video`} referrerPolicy="strict-origin-when-cross-origin" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen /><button type="button" onClick={() => setPlayingExerciseId(null)} aria-label="Close inline video"><X size={16} /></button></div> : <button type="button" className="exercise-visual-button" onClick={() => currentExercise.videoId ? setPlayingExerciseId(currentExercise.id) : setDetails(currentExercise)} aria-label={currentExercise.videoId ? `Play ${currentExercise.name} technique video inline` : `Open ${currentExercise.name} technique guide`}>{currentExercise.videoId ? <img src={`https://i.ytimg.com/vi/${currentExercise.videoId}/hqdefault.jpg`} alt={`${currentExercise.name} video thumbnail`} loading="lazy" /> : <BodyFocus muscles={currentExercise.primaryMuscles} />}<span><Play size={18} /> {currentExercise.videoId ? 'Watch video' : 'Technique guide'}</span></button>}
          <div><p className="eyebrow">Current exercise · Set {Math.min(currentWorkingCompleted + 1, currentWorkingSets.length)} of {currentWorkingSets.length}</p><h2>{currentExercise.name}</h2><div className="active-muscles">{currentExercise.primaryMuscles.map((muscle) => <span key={muscle}>{muscle}</span>)}</div><p>Target <strong>{prescription.sets} × {prescription.repMin}–{prescription.repMax}</strong> · {prescription.rir} RIR · {formatDuration(prescription.restSeconds)} rest</p>{prescription.notes ? <small className="exercise-note">{prescription.notes}</small> : null}<button type="button" className="inline-technique-guide" onClick={() => setDetails(currentExercise)}><ListChecks size={15} /> Technique & safety guide</button></div>
        </div>
        <div className="previous-performance"><span>Previous working sets</span>{previous.length ? previous.map((set) => <strong key={set.id}>{set.weightKg} kg × {set.reps}</strong>) : <em>No previous performance—start conservatively.</em>}</div>
        {feedback ? <div className={`set-feedback ${feedback.tone}`}><CheckCircle2 size={18} /><strong>{feedback.text}</strong>{feedback.tone === 'record' ? <Sparkles size={16} /> : null}</div> : null}
        {currentSets.some((set) => set.isWarmup) ? <div className="warmup-explainer"><Info size={16} /><p><strong>Warm-up sets are separate.</strong> They prepare the movement and do not count toward working-set volume or progression.</p></div> : null}
        <div className="set-timeline" aria-label="Current exercise set progress">{currentSets.map((set) => <span className={`${set.completed ? 'complete' : ''} ${set.isWarmup ? 'warmup' : ''}`} key={set.id}>{set.isWarmup ? `W${set.setNumber}` : set.setNumber}</span>)}</div>
        <div className="set-table"><div className="set-table__head"><span>Set</span><span>Weight</span><span>Reps</span><span>RIR</span><span>Done</span></div>{currentSets.map((set) => <div className={`set-row ${set.completed ? 'complete' : ''} ${set.isWarmup ? 'warmup' : ''}`} key={set.id}>
          <strong>{set.isWarmup ? `W${set.setNumber}` : set.setNumber}</strong>
          <label><span className="sr-only">{set.isWarmup ? 'Warm-up' : 'Working'} set {set.setNumber} weight</span><input inputMode="decimal" min="0" step="0.5" type="number" value={set.weightKg || ''} onChange={(event) => controller.updateWorkoutSet(session.id, set.id, { weightKg: Math.max(0, Number(event.target.value)) })} /></label>
          <label><span className="sr-only">Set {set.setNumber} reps</span><input inputMode="numeric" min="0" max="100" type="number" value={set.reps || ''} onChange={(event) => controller.updateWorkoutSet(session.id, set.id, { reps: Math.max(0, Number(event.target.value)) })} /></label>
          {set.isWarmup ? <span className="warmup-rir">—</span> : <label><span className="sr-only">Set {set.setNumber} reps in reserve</span><input aria-label={`Set ${set.setNumber} reps in reserve`} inputMode="numeric" min="0" max="5" type="number" value={set.rir ?? ''} onChange={(event) => controller.updateWorkoutSet(session.id, set.id, { rir: event.target.value === '' ? undefined : Math.max(0, Math.min(5, Number(event.target.value))) })} /></label>}
          <button type="button" onClick={() => completeSet(set)} disabled={!set.completed && set.reps <= 0} aria-label={`${set.completed ? 'Unmark' : 'Complete'} ${set.isWarmup ? 'warm-up' : 'working'} set ${set.setNumber}`}>{set.completed ? <Check size={19} /> : <span />}</button>
        </div>)}</div>
        <p className="rir-explainer"><Info size={15} /><span><strong>RIR means reps in reserve.</strong> Enter how many clean repetitions you realistically had left after each working set.</span></p>
        {progress ? <div className={`progression-callout ${progress.type === 'increase' ? 'earned' : progress.type}`}><Sparkles size={20} /><p><strong>{progress.title}</strong>{progress.text}</p>{progress.targetWeightKg ? <button type="button" disabled={confirmedExerciseId === exerciseId} onClick={() => { controller.confirmProgression(exerciseId, progress.targetWeightKg!, progress.type as 'increase' | 'decrease'); setConfirmedExerciseId(exerciseId); }}>{confirmedExerciseId === exerciseId ? <><Check size={15} /> Confirmed</> : `Use ${progress.targetWeightKg} kg next time`}</button> : null}</div> : null}
        {nextExercise ? <button type="button" className="next-exercise-preview" onClick={() => selectExercise(nextExercise.id)}><span>Next exercise</span><BodyFocus muscles={nextExercise.primaryMuscles} compact /><p><strong>{nextExercise.name}</strong><small>{nextExercise.primaryMuscles.join(' · ')}</small></p><ChevronRight size={18} /></button> : <div className="next-exercise-preview final"><Trophy size={20} /><p><strong>Final exercise</strong><small>Review the workout when your working sets are complete.</small></p></div>}
      </section>
    </div>
    {restSeconds !== null ? <RestTimer initialSeconds={restSeconds} onClose={() => setRestSeconds(null)} /> : null}
    {details ? <ExerciseDetail exercise={details} onClose={() => setDetails(null)} /> : null}
    <Modal open={summaryOpen} onClose={() => setSummaryOpen(false)} title="Workout summary" subtitle="Review the session before saving it to your history." wide>
      <div className="workout-completion-summary"><div className="completion-hero"><span><Trophy size={28} /></span><div><p className="eyebrow">Session ready to save</p><h2>{day.isRestDay ? session.title : displayWorkoutTitle(day)}</h2><p>{recordCount > 0 ? `${recordCount} genuine personal ${recordCount === 1 ? 'record' : 'records'} detected.` : 'A completed session is the win; records are optional.'}</p></div></div><div className="completion-metrics"><div><strong>{formatDuration(elapsed)}</strong><span>duration</span></div><div><strong>{workingCompleted}</strong><span>working sets</span></div><div><strong>{Math.round(currentVolume).toLocaleString()}</strong><span>kg volume</span></div><div><strong>{exerciseCompletedCount}/{exerciseOrder.length}</strong><span>exercises complete</span></div></div><div className="completion-comparison"><BarChart3 size={20} /><p><strong>{previousVolume ? currentVolume > previousVolume ? 'Volume increased' : currentVolume === previousVolume ? 'Matched previous volume' : 'Lower volume than the previous session' : 'First comparable session'}</strong>{previousVolume ? `${Math.abs(Math.round(currentVolume - previousVolume)).toLocaleString()} kg ${currentVolume >= previousVolume ? 'above' : 'below'} the last ${day.label} session.` : 'Complete another session of this type to unlock a direct comparison.'}</p></div><div className="completion-recovery"><HeartPulse size={20} /><p><strong>Recovery next</strong>Log the session, hydrate normally, eat your planned protein, and let the next programmed day guide the next hard effort.</p></div><button type="button" className="primary-button full" onClick={() => { controller.finishWorkout(session.id, elapsed); setSummaryOpen(false); onFinished(); }}><Check size={18} /> Finish and save workout</button><button type="button" className="text-button centered" onClick={() => setSummaryOpen(false)}>Return to workout</button></div>
    </Modal>
  </div>;
}

function TrainingCalendar({ sessions, onOpen }: { sessions: WorkoutSession[]; onOpen: (session: WorkoutSession) => void }) {
  const today = toDateKey();
  const [monthKey, setMonthKey] = useState(() => today.slice(0, 7));
  const calendarDates = useMemo(() => datesInCalendarMonth(monthKey), [monthKey]);
  const completedSessions = useMemo(() => sessions.filter((session) => session.completedAt && session.sets.some((set) => set.completed && !set.isWarmup)), [sessions]);
  const sessionsByDate = useMemo(() => {
    const grouped = new Map<string, WorkoutSession[]>();
    for (const session of completedSessions) grouped.set(session.date, [...(grouped.get(session.date) ?? []), session]);
    return grouped;
  }, [completedSessions]);
  const monthSessions = useMemo(() => completedSessions.filter((session) => session.date.startsWith(monthKey)), [completedSessions, monthKey]);
  const trainedDays = new Set(monthSessions.map((session) => session.date)).size;
  const workingSets = monthSessions.reduce((sum, session) => sum + session.sets.filter((set) => set.completed && !set.isWarmup).length, 0);
  const monthLabel = calendarMonthFormatter.format(new Date(`${monthKey}-01T12:00:00`));
  const shiftMonth = (amount: number) => {
    const date = new Date(`${monthKey}-01T12:00:00`);
    date.setMonth(date.getMonth() + amount);
    setMonthKey(toDateKey(date).slice(0, 7));
  };

  return <section className="training-calendar card">
    <header><div><p className="eyebrow">Actual training history</p><h2>{monthLabel}</h2><p>Every marker is a workout you actually completed—not a recommendation or missed plan.</p></div><div className="calendar-month-controls"><button type="button" className="icon-button" onClick={() => shiftMonth(-1)} aria-label="Previous month"><ChevronLeft size={18}/></button><button type="button" className="calendar-today-button" onClick={() => setMonthKey(today.slice(0, 7))}>Today</button><button type="button" className="icon-button" onClick={() => shiftMonth(1)} aria-label="Next month"><ChevronRight size={18}/></button></div></header>
    <div className="calendar-month-summary"><span><strong>{trainedDays}</strong><small>days trained</small></span><span><strong>{monthSessions.length}</strong><small>workouts</small></span><span><strong>{workingSets}</strong><small>working sets</small></span></div>
    <div className="training-calendar-scroll"><div className="training-calendar-grid" role="grid" aria-label={`${monthLabel} training calendar`}>
      {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => <span className="calendar-weekday" role="columnheader" key={day}>{day}</span>)}
      {calendarDates.map((date) => {
        const daySessions = sessionsByDate.get(date) ?? [];
        const inMonth = date.startsWith(monthKey);
        const label = calendarDayFormatter.format(new Date(`${date}T12:00:00`));
        const sessionLabels = daySessions.map((session) => ({ id: session.id, name: displayWorkoutTitle({ id: session.dayId, workoutId: session.workoutId, title: session.title }) }));
        return <button type="button" role="gridcell" key={date} disabled={!daySessions.length} className={`${inMonth ? '' : 'outside-month'} ${date === today ? 'today' : ''} ${daySessions.length ? 'trained' : ''}`} aria-label={`${label}${sessionLabels.length ? `: ${sessionLabels.map((item) => item.name).join(', ')}` : ': no completed workout'}`} onClick={() => daySessions.length && onOpen(daySessions.at(-1)!)}><span>{Number(date.slice(-2))}</span><div>{sessionLabels.slice(0, 2).map((item) => <strong key={item.id}>{item.name}</strong>)}{sessionLabels.length > 2 ? <small>+{sessionLabels.length - 2} more</small> : null}</div></button>;
      })}
    </div></div>
    <footer><span><i/> Completed strength session</span><small>Select a trained day to open its full workout log.</small></footer>
  </section>;
}

function WorkoutHistory({ sessions, onOpen }: { sessions: WorkoutSession[]; onOpen: (session: WorkoutSession) => void }) {
  const completed = [...sessions].filter((session) => session.completedAt).sort((a, b) => b.date.localeCompare(a.date));
  return <section className="history-log"><div className="section-title"><div><p className="eyebrow">Workout details</p><h2>Completed session log</h2></div><span>{completed.length} saved</span></div><div className="history-list">{completed.length ? completed.map((session) => <button type="button" className="history-card card" key={session.id} onClick={() => onOpen(session)}><div className="history-date"><span>{new Date(`${session.date}T12:00:00`).getDate()}</span><small>{new Intl.DateTimeFormat('en', { month: 'short' }).format(new Date(`${session.date}T12:00:00`))}</small></div><div><p className="eyebrow">{prettyDate(session.date)}</p><h3>{displayWorkoutTitle({ id: session.dayId, workoutId: session.workoutId, title: session.title })}</h3><span>{formatDuration(session.durationSeconds)} · {session.sets.filter((set) => set.completed && !set.isWarmup).length} working sets</span></div><div className="volume-stat"><strong>{Math.round(workoutVolume(session)).toLocaleString()}</strong><span>kg volume</span></div><ChevronRight size={19} /></button>) : <div className="empty-state card"><History size={30} /><h3>No workouts yet</h3><p>Finish your first session and the full log will appear here.</p></div>}</div></section>;
}

const templateOptions: Array<{ id: TrainingTemplate; label: string; detail: string }> = [
  { id: 'two-day-full-body', label: '2 days', detail: 'Two full-body sessions' },
  { id: 'three-day-full-body', label: '3 days', detail: 'Three full-body sessions' },
  { id: 'four-day-upper-lower', label: '4 days', detail: 'Chest, back, shoulders & legs' },
];

function WeeklyOverview({ controller }: { controller: AppController }) {
  const [templateToApply, setTemplateToApply] = useState<TrainingTemplate | null>(null);
  const [balanceOpen, setBalanceOpen] = useState(() => typeof localStorage !== 'undefined' && localStorage.getItem('cut-forward-program-balance-open') === 'true');
  const analysis = useMemo(() => analyzeWeeklyProgram(controller.data.program, controller.data.profile), [controller.data.profile, controller.data.program]);
  const balance = weeklyBalance(controller.data);
  const cardioPercent = Math.min(100, balance.cardioMinutes / controller.data.weeklyCardioTarget * 100);

  useEffect(() => localStorage.setItem('cut-forward-program-balance-open', String(balanceOpen)), [balanceOpen]);

  return <>
    <section className="weekly-overview card">
      <header><div><p className="eyebrow">Weekly balance</p><h2>Objectives, not fixed weekdays</h2><p>Only completed work counts. Finish the weekly objectives on the days that suit you; missed sessions never become workout debt.</p></div></header>
      <div className="weekly-balance-summary"><span><strong>{balance.upper}/{balance.targets.upperSessions}</strong><small>Upper sessions</small></span><span><strong>{balance.lower}/{balance.targets.lowerSessions}</strong><small>Lower sessions</small></span><span><strong>{balance.strength}/{balance.targets.strengthSessions}</strong><small>Strength total</small></span><span><strong>{balance.cardioMinutes}/{balance.cardioTarget}</strong><small>Cardio minutes</small></span><span><strong>{balance.recoveryOpportunities}</strong><small>Recovery opportunities</small></span></div>
      <div className="cardio-progress"><div><span style={{ width: `${cardioPercent}%` }} /></div><p>{cardioPercent >= 100 ? 'Weekly cardio target complete.' : `${Math.max(0, controller.data.weeklyCardioTarget - balance.cardioMinutes)} minutes remain.`}</p>{controller.data.weeklyCardioTarget < 150 ? <button type="button" onClick={() => controller.setWeeklyCardioTarget(controller.data.weeklyCardioTarget + 15)}>Build target to {Math.min(150, controller.data.weeklyCardioTarget + 15)} min</button> : <span>150-minute target</span>}</div>
      <div className="muscle-coverage-summary"><p><strong>Trained:</strong> {balance.trainedGroups.length ? balance.trainedGroups.join(' · ') : 'No completed working sets yet'}</p><p><strong>Not yet trained:</strong> {balance.untrainedGroups.join(' · ') || 'All tracked groups have a signal'}</p></div>
      <details className="program-balance" open={balanceOpen} onToggle={(event) => setBalanceOpen(event.currentTarget.open)}>
        <summary><span><strong>Program balance</strong><small>Planned weekly movement and direct-set estimates</small></span><ChevronRight size={18} /></summary>
        <div className="program-balance__body"><p className="balance-note">These are planned sets, not work already completed. Direct-set estimates count primary muscles only; compounds can overlap muscle groups.</p><div className="analysis-grid">
          <div><h3>Movement patterns</h3><div className="coverage-grid">{analysis.movementCoverage.map((item) => <span className={item.covered ? 'covered' : 'missing'} key={item.pattern}>{item.covered ? <CheckCircle2 size={14} /> : <Circle size={14} />}<strong>{item.pattern}</strong><small>{item.sets} planned sets</small></span>)}</div></div>
          <div><h3>Planned direct sets</h3><div className="muscle-volume">{analysis.muscleSets.slice(0, 12).map((item) => <span key={item.muscle}><strong>{item.sets}</strong>{item.muscle}</span>)}</div></div>
        </div>
        {analysis.warnings.length ? <div className="overview-warnings"><AlertTriangle size={17} /><div><strong>Non-blocking program checks</strong>{analysis.warnings.map((warning) => <p key={warning}>{warning}</p>)}</div></div> : null}
        <details className="plan-settings"><summary>Change training plan</summary><div className="template-picker"><div><strong>Training frequency</strong><span>Applying a template changes the editable plan but never workout history.</span></div>{templateOptions.map((option) => <button type="button" key={option.id} className={controller.data.profile.trainingTemplate === option.id ? 'active' : ''} onClick={() => option.id !== controller.data.profile.trainingTemplate && setTemplateToApply(option.id)}><strong>{option.label}</strong><span>{option.detail}</span></button>)}</div></details></div>
      </details>
    </section>
    <Modal open={Boolean(templateToApply)} onClose={() => setTemplateToApply(null)} title="Apply a different training template?" subtitle="Food logs, weight history, completed workouts, and recent bests remain unchanged.">
      <div className="template-confirm"><p>The current editable weekly program will be replaced with the selected safe default. This never happens automatically.</p><button type="button" className="primary-button full" onClick={() => { if (templateToApply) controller.applyTrainingTemplate(templateToApply); setTemplateToApply(null); }}><Check size={17} /> Apply template</button><button type="button" className="text-button centered" onClick={() => setTemplateToApply(null)}>Keep current program</button></div>
    </Modal>
  </>;
}

function SessionChooser({ controller, date, plan, onClose, onSelected }: { controller: AppController; date: string; plan: TrainingDayPlan; onClose: () => void; onSelected: () => void }) {
  const options = availableSessionOptions(controller.data.program);
  const recommendation = sessionOption(controller.data.program, plan.recommendedSessionTemplateId);
  const balance = weeklyBalance(controller.data, date);
  const [pendingId, setPendingId] = useState<SessionTemplateId | null>(null);
  const [readiness, setReadiness] = useState<Omit<ReadinessResponse, 'recordedAt'>>({ energy: 3, muscleSoreness: 2, jointDiscomfort: 'none', availableMinutes: 60, preferredIntensity: 'normal' });
  const pendingWarnings = pendingId ? plannerWarnings(controller.data, date, pendingId, { ...readiness, recordedAt: new Date().toISOString() }) : [];
  const choose = (templateId: SessionTemplateId) => {
    const warnings = plannerWarnings(controller.data, date, templateId);
    if (warnings.some((warning) => warning.code !== 'active_workout')) setPendingId(templateId);
    else {
      controller.selectTrainingSession(date, templateId, 'user_selected', warnings.length > 0);
      onSelected();
    }
  };
  const confirm = (intensity = readiness.preferredIntensity) => {
    if (!pendingId) return;
    const response: ReadinessResponse = { ...readiness, preferredIntensity: intensity, recordedAt: new Date().toISOString() };
    controller.selectTrainingSession(date, pendingId, 'user_selected', true, response);
    onSelected();
  };
  const supportsTarget = (id: SessionTemplateId) => {
    const type = sessionType(id);
    if (type === 'upper') return balance.upper < balance.targets.upperSessions;
    if (type === 'lower') return balance.lower < balance.targets.lowerSessions;
    if (isStrengthTemplate(id)) return balance.strength < balance.targets.strengthSessions;
    if (type === 'cardio') return balance.cardioMinutes < balance.cardioTarget;
    return balance.recoveryOpportunities < balance.targets.recoveryOpportunities;
  };

  return <Modal open onClose={onClose} title="Choose this day’s session" subtitle={`${prettyDate(date, true)} · the recommendation guides you, but never locks the choice.`} wide>
    <div className="session-chooser">
      <section className="recommended-session-panel"><div><p className="eyebrow">Recommended for today</p><h2>{recommendation.name}</h2><p>{plan.recommendationReason}</p></div><dl><div><dt>Duration</dt><dd>{recommendation.duration}</dd></div><div><dt>Main muscles</dt><dd>{recommendation.muscleGroups.join(' · ') || 'Recovery-wide'}</dd></div><div><dt>Recovery</dt><dd>{recoveryForSession(controller.data, recommendation.id, date).indicator}</dd></div><div><dt>Weekly impact</dt><dd>{supportsTarget(recommendation.id) ? 'Supports a remaining objective' : 'Creates recovery space'}</dd></div></dl><button type="button" className="primary-button" onClick={() => { controller.selectTrainingSession(date, recommendation.id, 'adaptive_recommendation'); onSelected(); }}><Check size={17} /> Follow recommendation</button></section>
      <div className="chooser-heading"><div><p className="eyebrow">All session options</p><h3>Choose what fits today</h3></div><span>Every option remains available</span></div>
      <div className="session-option-grid">{options.map((option) => {
        const recovery = recoveryForSession(controller.data, option.id, date);
        const performed = controller.data.sessions.filter((session) => session.completedAt && weekDates(date).includes(session.date) && session.workoutId === option.id).length;
        const last = lastPerformed(controller.data, option.id, date);
        const selected = plan.selectedSessionTemplateId === option.id;
        return <button type="button" className={`session-option ${selected ? 'selected' : ''} recovery-${recovery.indicator.toLowerCase().replace(/\s+/g, '-')}`} key={option.id} onClick={() => choose(option.id)}><header><span>{option.name}</span>{selected ? <Check size={15} /> : null}</header><p>{option.muscleGroups.join(' · ') || (option.type === 'cardio' ? 'Cardiovascular fitness + recovery' : 'Whole-body recovery')}</p><dl><div><dt>Time</dt><dd>{option.duration}</dd></div><div><dt>Recovery</dt><dd>{recovery.indicator}</dd></div><div><dt>This week</dt><dd>{performed} completed</dd></div><div><dt>Last done</dt><dd>{last ? prettyDate(last) : 'No history'}</dd></div></dl><footer>{supportsTarget(option.id) ? <><Target size={13} /> Supports a remaining weekly target</> : <><HeartPulse size={13} /> Flexible choice</>}</footer></button>;
      })}</div>
      {pendingId ? <section className="readiness-check"><div className="readiness-heading"><div><p className="eyebrow">Optional readiness check</p><h3>How recovered do you feel?</h3></div><button type="button" className="icon-button" onClick={() => setPendingId(null)} aria-label="Close readiness check"><X size={17}/></button></div>{pendingWarnings.map((warning) => <div className={`planner-warning ${warning.tone}`} key={warning.code}><AlertTriangle size={18}/><p><strong>{warning.title}</strong>{warning.message}</p></div>)}<div className="readiness-fields"><label>Energy <strong>{readiness.energy}/5</strong><input type="range" min="1" max="5" value={readiness.energy} onChange={(event) => setReadiness((current) => ({ ...current, energy: Number(event.target.value) as ReadinessResponse['energy'] }))}/></label><label>Muscle soreness <strong>{readiness.muscleSoreness}/5</strong><input type="range" min="1" max="5" value={readiness.muscleSoreness} onChange={(event) => setReadiness((current) => ({ ...current, muscleSoreness: Number(event.target.value) as ReadinessResponse['muscleSoreness'] }))}/></label><label>Joint discomfort<select value={readiness.jointDiscomfort} onChange={(event) => setReadiness((current) => ({ ...current, jointDiscomfort: event.target.value as ReadinessResponse['jointDiscomfort'] }))}><option value="none">None</option><option value="mild">Mild</option><option value="significant">Significant</option></select></label><label>Available time<div><input type="number" min="10" max="180" value={readiness.availableMinutes} onChange={(event) => setReadiness((current) => ({ ...current, availableMinutes: Number(event.target.value) }))}/><span>min</span></div></label><label>Preferred intensity<select value={readiness.preferredIntensity} onChange={(event) => setReadiness((current) => ({ ...current, preferredIntensity: event.target.value as ReadinessResponse['preferredIntensity'] }))}><option value="light">Light</option><option value="normal">Normal</option><option value="hard">Hard</option></select></label></div>{readiness.jointDiscomfort === 'significant' ? <div className="readiness-safety"><ShieldCheck size={18}/><p><strong>Choose recovery and stop if symptoms feel sharp or unstable.</strong>Project 75 cannot diagnose an injury. Significant discomfort, sharp pain, dizziness, or instability is a reason to stop and seek appropriate professional assessment.</p></div> : null}<div className="readiness-actions"><button type="button" className="secondary-button" onClick={() => { controller.selectTrainingSession(date, 'mobility_recovery', 'user_selected', true, { ...readiness, preferredIntensity: 'light', recordedAt: new Date().toISOString() }); onSelected(); }}><HeartPulse size={17}/> Choose recovery</button>{isStrengthTemplate(pendingId) ? <button type="button" className="secondary-button" onClick={() => confirm('light')}><Dumbbell size={17}/> Choose a lighter version</button> : null}<button type="button" className="primary-button" onClick={() => confirm()}><Check size={17}/> Keep my choice</button></div></section> : null}
    </div>
  </Modal>;
}

function WeekCustomizer({ controller, referenceDate, onClose }: { controller: AppController; referenceDate: string; onClose: () => void }) {
  const dates = weekDates(referenceDate);
  const plans = dates.map((date) => controller.data.trainingPlanner.dailyPlans.find((plan) => plan.date === date)).filter((plan): plan is TrainingDayPlan => Boolean(plan));
  const movable = plans.filter((plan) => plan.status !== 'completed' && plan.date >= toDateKey());
  const [fromDate, setFromDate] = useState(movable[0]?.date ?? '');
  const [toDate, setToDate] = useState(movable[1]?.date ?? movable[0]?.date ?? '');
  const [swap, setSwap] = useState(true);
  const [preview, setPreview] = useState<{ from: string; to: string; swap: boolean } | null>(null);
  const fromPlan = plans.find((plan) => plan.date === (preview?.from ?? fromDate));
  const previewWarnings = preview && fromPlan ? plannerWarnings(controller.data, preview.to, fromPlan.selectedSessionTemplateId) : [];
  const requestMove = (from: string, to: string, shouldSwap: boolean) => { if (from && to && from !== to) setPreview({ from, to, swap: shouldSwap }); };
  return <Modal open onClose={onClose} title="Customize this week" subtitle="Move, swap, or restore sessions. Completed history is never changed." wide>
    <div className="week-customizer">
      <div className="customizer-days">{plans.map((plan) => <button type="button" draggable={plan.status !== 'completed'} key={plan.date} className={plan.status === 'completed' ? 'locked' : ''} onDragStart={(event) => event.dataTransfer.setData('text/plain', plan.date)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); requestMove(event.dataTransfer.getData('text/plain'), plan.date, true); }} onClick={() => setFromDate(plan.date)}><span><GripVertical size={15}/>{prettyDate(plan.date)}</span><strong>{sessionOption(controller.data.program, plan.selectedSessionTemplateId).name}</strong><small>{plan.status === 'completed' ? 'Completed · locked' : plan.selectionSource.startsWith('user_') ? 'Selected by you' : 'Recommendation'}</small></button>)}</div>
      <div className="tap-move-controls"><label>Move from<select value={fromDate} onChange={(event) => setFromDate(event.target.value)}>{movable.map((plan) => <option value={plan.date} key={plan.date}>{prettyDate(plan.date)} · {sessionOption(controller.data.program, plan.selectedSessionTemplateId).name}</option>)}</select></label><label>To day<select value={toDate} onChange={(event) => setToDate(event.target.value)}>{movable.map((plan) => <option value={plan.date} key={plan.date}>{prettyDate(plan.date)}</option>)}</select></label><label className="swap-choice"><input type="checkbox" checked={swap} onChange={(event) => setSwap(event.target.checked)}/><span>{swap ? 'Swap both days' : 'Move and make source a rest day'}</span></label><button type="button" className="primary-button" disabled={!fromDate || !toDate || fromDate === toDate} onClick={() => requestMove(fromDate, toDate, swap)}>{swap ? <Shuffle size={17}/> : <Move size={17}/>} Preview change</button></div>
      {preview ? <div className="week-move-preview"><p className="eyebrow">Conflict preview</p><h3>{sessionOption(controller.data.program, fromPlan!.selectedSessionTemplateId).name} → {prettyDate(preview.to)}</h3>{previewWarnings.length ? previewWarnings.map((warning) => <div className={`planner-warning ${warning.tone}`} key={warning.code}><AlertTriangle size={17}/><p><strong>{warning.title}</strong>{warning.message}</p></div>) : <p className="preview-clear"><CheckCircle2 size={17}/> No recent-training conflict detected. This is still a recommendation, not a guarantee of recovery.</p>}<div><button type="button" className="primary-button" onClick={() => { controller.moveTrainingSession(preview.from, preview.to, preview.swap); setPreview(null); }}><Check size={17}/> Apply {preview.swap ? 'swap' : 'move'}</button><button type="button" className="text-button" onClick={() => setPreview(null)}>Cancel</button></div></div> : null}
      <div className="customizer-footer"><button type="button" className="secondary-button" onClick={() => controller.recalculateTrainingPlan(referenceDate)}><RefreshCw size={17}/> Recalculate remaining week</button><button type="button" className="secondary-button" onClick={() => controller.restoreRecommendedWeek(referenceDate)}><RefreshCw size={17}/> Restore recommendations</button><button type="button" className="text-button" onClick={onClose}>Done</button></div>
    </div>
  </Modal>;
}

function CardioLogger({ controller, day, date }: { controller: AppController; day: WorkoutDay; date: string }) {
  const [minutes, setMinutes] = useState(String(day.cardioTargetMinutes ?? 30));
  const [activity, setActivity] = useState<CardioEntry['activity']>('Brisk walk');
  const today = toDateKey();
  const todayMinutes = controller.data.cardioLog.filter((entry) => entry.date === date).reduce((sum, entry) => sum + entry.minutes, 0);
  const valid = Number(minutes) >= 5 && Number(minutes) <= 180;
  return <div className="cardio-logger"><div><p className="eyebrow">Cardio + recovery</p><h3>{day.cardioSuggestion}</h3><p>Log moderate, low-impact minutes. Avoid hard intervals when lower-body fatigue is high.</p></div>{date === today ? <form onSubmit={(event) => { event.preventDefault(); if (!valid) return; controller.addCardio(date, Number(minutes), activity); setMinutes(String(day.cardioTargetMinutes ?? 30)); }}><label>Activity<select value={activity} onChange={(event) => setActivity(event.target.value as CardioEntry['activity'])}><option>Brisk walk</option><option>Relaxed walk</option><option>Cycling</option><option>Other low impact</option></select></label><label>Minutes<input type="number" min="5" max="180" value={minutes} onChange={(event) => setMinutes(event.target.value)} /></label><button type="submit" className="primary-button" disabled={!valid}><Plus size={17} /> Log cardio</button></form> : <p className="future-cardio-note">Open this day when it arrives to log actual cardio. Future plans never count as completed work.</p>}<span className="today-cardio"><Activity size={16} /> {todayMinutes} minutes logged {date === today ? 'today' : 'on this day'}</span></div>;
}

function SquatProgressionCard({ controller, onDetails }: { controller: AppController; onDetails: (exercise: Exercise) => void }) {
  const currentIndex = squatProgressionLevels.findIndex((level) => level.id === controller.data.squatProgression.currentLevel);
  const current = squatProgressionLevels[currentIndex];
  const [checked, setChecked] = useState<boolean[]>(() => squatReadinessCriteria.map(() => false));
  const ready = checked.every(Boolean);
  const previous = squatProgressionLevels[currentIndex - 1];
  const next = squatProgressionLevels[currentIndex + 1];
  return <article className="card squat-progression-card"><div className="section-title"><div><p className="eyebrow">Manual squat progression</p><h2>{current.label}</h2></div><span>Level {currentIndex + 1}/{squatProgressionLevels.length}</span></div><p>Advance only when you can honestly confirm every readiness item. Time alone never unlocks a harder exercise.</p><button type="button" className="current-variation" onClick={() => onDetails(exerciseMap.get(current.id)!)}><span><Footprints size={18} /></span><div><strong>Current programmed variation</strong><small>Open setup, technique and safety guidance</small></div><ChevronRight size={18} /></button><div className="readiness-list">{squatReadinessCriteria.map((criterion, index) => <label key={criterion}><input type="checkbox" checked={checked[index]} onChange={() => setChecked((values) => values.map((value, itemIndex) => itemIndex === index ? !value : value))} /><span>{checked[index] ? <Check size={14} /> : null}</span>{criterion}</label>)}</div><div className="progression-actions">{previous ? <button type="button" className="secondary-button" onClick={() => { controller.setSquatProgression(previous.id); setChecked(squatReadinessCriteria.map(() => false)); }}><Minus size={16} /> Regress to {previous.label}</button> : <span>Already at the most supported level.</span>}{next ? <button type="button" className="primary-button" disabled={!ready} onClick={() => { controller.setSquatProgression(next.id); setChecked(squatReadinessCriteria.map(() => false)); }}><Check size={16} /> Advance to {next.label}</button> : <span>Final progression reached.</span>}</div></article>;
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
  const [chooser, setChooser] = useState<{ date: string; previousPlans: TrainingDayPlan[] } | null>(null);
  const [replanReview, setReplanReview] = useState<{ date: string; previousPlans: TrainingDayPlan[] } | null>(null);
  const [customizerOpen, setCustomizerOpen] = useState(false);
  const [startIntent, setStartIntent] = useState<{ templateId: SessionTemplateId; date: string } | null>(null);
  const today = toDateKey();
  const week = getWeekSnapshot(controller.data, today);
  const selectedIndex = Math.max(0, controller.data.program.findIndex((item) => item.id === selectedDayId));
  const selectedSnapshot = week.days[selectedIndex] ?? week.days[0];
  const selectedPlan = selectedSnapshot.plan;
  const selectedTemplateId = selectedPlan?.selectedSessionTemplateId ?? selectedSnapshot.day?.workoutId ?? 'cardio_recovery';
  const day = selectedSnapshot.day ?? controller.data.program[selectedIndex] ?? controller.data.program[0];
  const editableTemplate = workoutTemplate(controller.data.program, selectedTemplateId);
  const nextTrainingDay = week.days.slice(selectedIndex + 1).find((item) => item.plan && isStrengthTemplate(item.plan.selectedSessionTemplateId));
  const previousCompleted = controller.data.sessions.filter((session) => session.completedAt);
  const selectedWarnings = startIntent ? plannerWarnings(controller.data, startIntent.date, startIntent.templateId, selectedPlan?.readinessResponse) : [];
  const duplicateSession = startIntent ? controller.data.sessions.find((session) => session.completedAt && session.date === startIntent.date && session.workoutId === startIntent.templateId) : undefined;
  const openChooser = (date: string) => setChooser({ date, previousPlans: structuredClone(controller.data.trainingPlanner.dailyPlans.filter((plan) => weekDates(date).includes(plan.date))) });
  const replanChanges = replanReview ? replanReview.previousPlans.flatMap((previous) => {
    if (previous.date <= replanReview.date) return [];
    const current = controller.data.trainingPlanner.dailyPlans.find((plan) => plan.date === previous.date);
    return current && current.selectedSessionTemplateId !== previous.selectedSessionTemplateId ? [{ date: current.date, before: previous.selectedSessionTemplateId, after: current.selectedSessionTemplateId }] : [];
  }) : [];
  const requestStart = (templateId: SessionTemplateId, date: string) => {
    const warnings = plannerWarnings(controller.data, date, templateId, selectedPlan?.readinessResponse);
    if (warnings.length) setStartIntent({ templateId, date });
    else onStartWorkout(templateId, date);
  };
  const continueStart = () => {
    if (!startIntent) return;
    controller.selectTrainingSession(startIntent.date, startIntent.templateId, selectedPlan?.selectionSource ?? 'user_selected', selectedWarnings.length > 0, selectedPlan?.readinessResponse);
    onStartWorkout(startIntent.templateId, startIntent.date);
    setStartIntent(null);
  };

  if (activeSession && !activeSession.completedAt && !hideActiveSession) return <ActiveWorkout controller={controller} session={activeSession} onBack={() => setHideActiveSession(true)} onFinished={() => { setActiveSessionId(null); setHideActiveSession(true); setView('history'); }} />;

  return <div className="page workout-page">
    <header className="page-header workout-header"><div><p className="eyebrow">Adaptive strength + recovery planner</p><h1>Your week. Your choice.</h1><p>See the coach’s recommendation, choose what fits today, and keep weekly balance without tying workouts permanently to weekdays.</p></div><div className="workout-header-actions"><button type="button" className="secondary-button" onClick={() => setCustomizerOpen(true)}><CalendarDays size={17}/> Customize week</button><div className="view-toggle"><button type="button" className={view === 'program' ? 'active' : ''} onClick={() => setView('program')}><Dumbbell size={17} /> Planner</button><button type="button" className={view === 'history' ? 'active' : ''} onClick={() => setView('history')}><CalendarDays size={17} /> Calendar</button></div></div></header>
    <div className="workout-safety"><ShieldCheck size={18} /><p><strong>Safety first.</strong> Stop for sharp pain, dizziness, or instability. Regress the movement and seek professional assessment when appropriate.</p></div>
    {view === 'program' ? <>
      {activeSession && !activeSession.completedAt ? <button type="button" className="resume-banner" onClick={() => setHideActiveSession(false)}><Play size={18} /><span><strong>{displayWorkoutTitle({ id: activeSession.dayId, workoutId: activeSession.workoutId, title: activeSession.title })} is in progress</strong><small>{activeSession.sets.filter((set) => set.completed && !set.isWarmup).length} working sets complete</small></span><ChevronRight size={18} /></button> : null}
      <section className="day-tabs premium-day-tabs adaptive-day-tabs" aria-label="Adaptive weekly training planner">{week.days.map((planDay, index) => {
        const item = planDay.day ?? controller.data.program[index];
        const plan = planDay.plan;
        if (!item || !plan) return null;
        const completed = planDay.status === 'completed';
        const isSelected = selectedDayId === item.id;
        const isToday = planDay.date === today;
        const changed = plan.selectionSource.startsWith('user_') && plan.selectedSessionTemplateId !== plan.recommendedSessionTemplateId;
        const stateLabel = completed ? 'Completed' : plan.status === 'skipped' ? 'Skipped' : planDay.status === 'missed' ? 'Missed' : changed ? 'Changed from recommendation' : plan.selectionSource.startsWith('user_') ? 'Selected by you' : isToday ? 'Recommended today' : plan.selectedSessionTemplateId === 'full_rest' ? 'Rest day' : 'Upcoming';
        const DayIcon = item.isRestDay ? isToday ? HeartPulse : BedDouble : Dumbbell;
        return <button type="button" key={planDay.date} aria-current={isSelected ? 'date' : undefined} aria-label={`${item.label}, ${displayWorkoutTitle(item)}, ${stateLabel}`} className={`${isSelected ? 'active' : ''} ${item.isRestDay ? 'rest-day' : 'training-day'} ${completed ? 'completed' : ''} ${isToday ? 'current-day' : ''} ${planDay.status === 'missed' ? 'past-day' : ''} ${changed ? 'user-changed' : ''}`} onClick={() => setSelectedDayId(item.id)}><div className="day-tab-top"><span>{item.label}</span><i><DayIcon size={16} /></i></div><strong>{displayWorkoutTitle(item)}</strong><small>{completed ? <BadgeCheck size={14} /> : changed ? <Pencil size={12}/> : isToday ? <Circle size={13} /> : null}{stateLabel}</small></button>;
      })}</section>
      {selectedPlan ? <section className="daily-recommendation card"><div><p className="eyebrow">{selectedPlan.selectionSource.startsWith('user_') ? 'Your selected session' : 'Recommended for this day'}</p><h2>{sessionOption(controller.data.program, selectedTemplateId).name}</h2><p>{selectedPlan.recommendationReason}</p>{selectedPlan.selectedSessionTemplateId !== selectedPlan.recommendedSessionTemplateId ? <span><Pencil size={14}/> Selected by you · Original recommendation: {sessionOption(controller.data.program, selectedPlan.recommendedSessionTemplateId).name}</span> : <span><Sparkles size={14}/> Adaptive recommendation · recalculates from completed work</span>}</div><div><span className={`recovery-pill ${recoveryForSession(controller.data, selectedTemplateId, selectedSnapshot.date).indicator.toLowerCase().replace(/\s+/g, '-')}`}>{recoveryForSession(controller.data, selectedTemplateId, selectedSnapshot.date).indicator}</span>{selectedSnapshot.date >= today && selectedPlan.status !== 'completed' ? <button type="button" className="secondary-button" onClick={() => openChooser(selectedSnapshot.date)}><Shuffle size={17}/> Change this day’s session</button> : null}{selectedSnapshot.date >= today && selectedPlan.status !== 'completed' && selectedPlan.status !== 'skipped' ? <button type="button" className="text-button" onClick={() => controller.skipTrainingDay(selectedSnapshot.date)}>Mark as skipped</button> : null}</div></section> : null}
      <section className={`program-layout ${day.isRestDay ? 'rest-layout' : ''}`}>
        {day.isRestDay ? <article className="program-main recovery-main card"><header><div><p className="eyebrow">{day.label} recovery choice</p><h2>{displayWorkoutTitle(day)}</h2><span><HeartPulse size={16} /> {day.duration}</span></div><span className="recovery-badge">Recovery-focused</span></header>{selectedTemplateId === 'cardio_recovery' ? <CardioLogger controller={controller} day={day} date={selectedSnapshot.date} /> : null}<div className="recovery-plan"><span className="recovery-orb"><HeartPulse size={26} /></span><div><p className="eyebrow">Recovery guidance</p><h3>{selectedTemplateId === 'full_rest' ? 'No workout is required.' : 'Keep the day deliberately easy.'}</h3><p>Recovery plans are opportunities, not obligations. Planned rest never counts as physical work or fatigue.</p></div><ul>{day.recovery?.map((item) => <li key={item}><Check size={16} />{item}</li>)}</ul></div>{nextTrainingDay?.day ? <button type="button" className="secondary-button next-session" onClick={() => setSelectedDayId(nextTrainingDay.day!.id)}><CalendarDays size={18} /> Next strength option: {nextTrainingDay.day.label} · {displayWorkoutTitle(nextTrainingDay.day)}<ChevronRight size={17} /></button> : null}</article> : <article className="program-main premium-program-main card"><header><div><p className="eyebrow">{day.label} selected session</p><h2>{displayWorkoutTitle(day)}</h2><span><Clock3 size={16} /> {day.focus} · {day.duration}</span></div>{editableTemplate ? <button type="button" className="secondary-button" onClick={() => setEditingDay(editableTemplate)}><Pencil size={16} /> Edit reusable workout</button> : null}</header><div className="session-summary"><div><ToneIcon Icon={Dumbbell} tone="coral" /><span><strong>{day.exercises.length}</strong> exercises</span></div><div><ToneIcon Icon={ListChecks} tone="amber" /><span><strong>{day.exercises.reduce((sum, item) => sum + item.sets, 0)}</strong> working sets</span></div><div><ToneIcon Icon={Clock3} tone="cyan" /><span><strong>{day.duration}</strong> estimated</span></div><div className="session-muscles"><span>Main focus</span><strong>{[...new Set(day.exercises.flatMap((item) => exerciseMap.get(item.exerciseId)?.primaryMuscles ?? []))].slice(0, 4).join(' · ')}</strong></div></div><div className="program-list premium-program-list">{day.exercises.map((item, index) => { const exercise = exerciseMap.get(item.exerciseId)!; const previous = previousSets(previousCompleted, item.exerciseId); const best = previous.reduce((max, set) => Math.max(max, set.weightKg), 0); const recommendation = controller.data.progressionPlans.find((plan) => plan.exerciseId === item.exerciseId); const compound = exercise.movementPatterns.some((pattern) => ['Horizontal push', 'Horizontal pull', 'Vertical push', 'Squat', 'Hip hinge', 'Single-leg'].includes(pattern)); return <div className={`program-exercise ${compound ? 'compound' : 'accessory'}`} key={`${item.exerciseId}-${index}`}><span className="exercise-index">{String(index + 1).padStart(2, '0')}</span><button type="button" className="program-exercise__main" onClick={() => setDetails(exercise)}><BodyFocus muscles={exercise.primaryMuscles} compact /><div><h3>{exercise.name}{recommendation ? <em>Progression ready</em> : null}</h3><p>{exercise.primaryMuscles.join(' · ')}{item.notes ? ` · ${item.notes}` : ''}</p></div><div className="prescription"><strong>{item.sets} × {item.repMin}–{item.repMax}</strong><span>{item.warmupSets ? `${item.warmupSets} warm-up · ` : ''}{formatDuration(item.restSeconds)} rest · {item.rir} RIR</span></div>{best ? <div className="last-load"><strong>{best} kg</strong><span>previous best</span></div> : <div className="last-load"><strong>—</strong><span>no history</span></div>}<ChevronRight size={19} /></button></div>; })}</div>{selectedSnapshot.date === today ? <button type="button" className="primary-button start-workout" onClick={() => requestStart(selectedTemplateId, selectedSnapshot.date)}><Flame size={19} /> Start {displayWorkoutTitle(day)}</button> : <div className="future-session-note"><CalendarDays size={17}/><p><strong>{selectedSnapshot.date > today ? 'Saved for this day' : 'Past planned session'}</strong>{selectedSnapshot.date > today ? 'Open it on the day to start. You can still change it any time.' : 'Past plans do not create fatigue and are not carried forward as debt.'}</p></div>}</article>}
        <aside className="workout-guidance">{day.isRestDay ? <><article className="card overload-card"><span className="metric-icon blue"><Activity size={19} /></span><p className="eyebrow">Weekly cardio</p><h3>Build toward 150.</h3><p>Begin with the current manageable target, add minutes gradually, and use brisk walking, cycling, or another low-impact option.</p><div><Sparkles size={16} /> Small bouts still count</div></article><article className="card squat-card"><span className="metric-icon lime"><BedDouble size={19} /></span><p className="eyebrow">Fatigue check</p><h3>Easy means recoverable.</h3><p>Skip hard intervals when your legs are carrying fatigue from strength training.</p></article></> : <><article className="card overload-card"><span className="metric-icon lime"><BarChart3 size={19} /></span><p className="eyebrow">Double progression</p><h3>Reps, then load.</h3><p>Reach the top of the range at the planned RIR for two sessions. Confirm any load change before the app uses it next time.</p><div><Sparkles size={16} /> No failure required</div></article><article className="card warmup-card"><span className="metric-icon orange"><ListChecks size={19} /></span><p className="eyebrow">Warm-up sets</p><h3>Prepare, don’t pre-fatigue.</h3><p>Progressive warm-ups are logged separately and excluded from working-set volume.</p></article></>}</aside>
      </section>
      <WeeklyOverview controller={controller} />
      <SquatProgressionCard controller={controller} onDetails={setDetails} />
    </> : <div className="calendar-history-view"><TrainingCalendar sessions={controller.data.sessions} onOpen={setHistorySession} /><WorkoutHistory sessions={controller.data.sessions} onOpen={setHistorySession} /></div>}
    {details ? <ExerciseDetail exercise={details} onClose={() => setDetails(null)} /> : null}
    {editingDay ? <ProgramEditor day={editingDay} program={controller.data.program} profile={controller.data.profile} onSave={controller.updateProgramDay} onClose={() => setEditingDay(null)} /> : null}
    {chooser && selectedPlan ? <SessionChooser controller={controller} date={chooser.date} plan={controller.data.trainingPlanner.dailyPlans.find((plan) => plan.date === chooser.date) ?? selectedPlan} onClose={() => setChooser(null)} onSelected={() => { setReplanReview(chooser); setChooser(null); }} /> : null}
    {customizerOpen ? <WeekCustomizer controller={controller} referenceDate={today} onClose={() => setCustomizerOpen(false)} /> : null}
    <Modal open={Boolean(replanReview)} onClose={() => setReplanReview(null)} title="Your remaining week has been adjusted" subtitle="Only recommendation-based days were recalculated. Explicit future choices remain unchanged.">{replanReview ? <div className="replan-review"><p>{replanChanges.length ? 'These future recommendations changed to protect recovery and weekly balance:' : 'The remaining recommendations were checked; no future day needed to change.'}</p>{replanChanges.length ? <div>{replanChanges.map((change) => <span key={change.date}><strong>{prettyDate(change.date)}</strong><small>{sessionOption(controller.data.program, change.before).name}</small><ChevronRight size={15}/><b>{sessionOption(controller.data.program, change.after).name}</b></span>)}</div> : null}<p className="replan-note">This is still a recommendation, not a command. Keeping the previous layout marks those future sessions as your explicit selections.</p><footer><button type="button" className="primary-button" onClick={() => setReplanReview(null)}><Check size={17}/> Apply suggested changes</button><button type="button" className="secondary-button" onClick={() => { controller.keepCurrentTrainingWeek(replanReview.previousPlans, replanReview.date); setReplanReview(null); }}><CalendarDays size={17}/> Keep my current week</button><button type="button" className="text-button" onClick={() => { setReplanReview(null); setCustomizerOpen(true); }}>Review each day</button></footer></div> : null}</Modal>
    <Modal open={Boolean(startIntent)} onClose={() => setStartIntent(null)} title="Check before starting" subtitle="Recovery advice informs the choice; it does not block you.">{startIntent ? <div className="start-warning-dialog">{selectedWarnings.map((warning) => <div className={`planner-warning ${warning.tone}`} key={warning.code}><AlertTriangle size={18}/><p><strong>{warning.title}</strong>{warning.message}</p></div>)}<div className="start-warning-actions">{activeSession ? <button type="button" className="secondary-button" onClick={() => { setStartIntent(null); setHideActiveSession(false); }}><Play size={17}/> Resume unfinished workout</button> : null}{activeSession ? <button type="button" className="secondary-button" onClick={() => { const intent = startIntent; controller.discardWorkout(activeSession.id); setStartIntent(null); onStartWorkout(intent.templateId, intent.date); }}><X size={17}/> Discard unfinished & start</button> : null}{duplicateSession ? <button type="button" className="secondary-button" onClick={() => { setHistorySession(duplicateSession); setStartIntent(null); setView('history'); }}><History size={17}/> View today’s completed workout</button> : null}{selectedPlan && startIntent.templateId !== selectedPlan.recommendedSessionTemplateId ? <button type="button" className="secondary-button" onClick={() => { controller.selectTrainingSession(startIntent.date, selectedPlan.recommendedSessionTemplateId, 'adaptive_recommendation'); setStartIntent(null); }}><Sparkles size={17}/> Follow recommendation</button> : null}<button type="button" className="primary-button" onClick={continueStart}><Check size={17}/> Continue anyway</button><button type="button" className="text-button" onClick={() => { setStartIntent(null); openChooser(selectedSnapshot.date); }}>Choose another session</button></div></div> : null}</Modal>
    <Modal open={Boolean(historySession)} onClose={() => setHistorySession(null)} title={historySession ? displayWorkoutTitle({ id: historySession.dayId, workoutId: historySession.workoutId, title: historySession.title }) : 'Workout'} subtitle={historySession ? `${prettyDate(historySession.date, true)} · ${formatDuration(historySession.durationSeconds)}` : undefined} wide>{historySession ? <div className="workout-log-detail"><div className="history-totals"><div><strong>{historySession.sets.filter((set) => set.completed && !set.isWarmup).length}</strong><span>working sets</span></div><div><strong>{Math.round(workoutVolume(historySession)).toLocaleString()}</strong><span>kg volume</span></div><div><strong>{new Set(historySession.sets.filter((set) => set.completed && !set.isWarmup).map((set) => set.exerciseId)).size}</strong><span>exercises</span></div></div>{[...new Set(historySession.sets.map((set) => set.exerciseId))].map((exerciseId) => <section key={exerciseId}><h3>{exerciseMap.get(exerciseId)?.name}</h3>{historySession.sets.filter((set) => set.exerciseId === exerciseId).map((set) => <p key={set.id}><span>{set.isWarmup ? `Warm-up ${set.setNumber}` : `Set ${set.setNumber}`}</span><strong>{set.weightKg} kg × {set.reps}{set.rir !== undefined ? ` · ${set.rir} RIR` : ''}</strong>{set.completed ? <Check size={16} /> : null}</p>)}</section>)}</div> : null}</Modal>
  </div>;
}
