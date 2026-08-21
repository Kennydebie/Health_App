import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Activity, AlertTriangle, ArrowLeft, BadgeCheck, BarChart3, BedDouble, CalendarDays, Check, CheckCircle2, ChevronRight, Circle, Clock3, Dumbbell, ExternalLink, Flame, Footprints, GripVertical, HeartPulse, History, Info, ListChecks, Minus, Pause, Pencil, Play, Plus, Save, ShieldCheck, SkipForward, Sparkles, Trophy, X } from 'lucide-react';
import { Modal } from '../components/Modal';
import { BodyFocus, ToneIcon } from '../components/Visuals';
import { exerciseMap, exercises } from '../data/exercises';
import { prettyDate, toDateKey } from '../lib/date';
import { datesInWeek, displayWorkoutTitle } from '../lib/engagement';
import { formatDuration, workoutVolume } from '../lib/progress';
import { adherenceSuggestion, analyzeWeeklyProgram, exceedsBalanceLevel, isEquipmentCompatible, progressionRecommendation, squatProgressionLevels, squatReadinessCriteria, weeklyCardioMinutes, weeklyStrengthCompleted } from '../lib/workout';
import type { AppController } from '../state/useAppData';
import type { CardioEntry, Exercise, LoggedSet, ProgramExercise, TrainingTemplate, UserProfile, WorkoutDay, WorkoutSession } from '../types/models';

interface WorkoutPageProps {
  controller: AppController;
  activeSessionId: string | null;
  setActiveSessionId: (id: string | null) => void;
  onStartWorkout: (dayId: WorkoutDay['id']) => void;
}

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
  const day = controller.data.program.find((item) => item.id === session.dayId) ?? controller.data.program.find((item) => !item.isRestDay) ?? controller.data.program[0];
  const sessionExerciseIds = [...new Set(session.sets.map((set) => set.exerciseId))].filter((id) => exerciseMap.has(id));
  const exerciseOrder = sessionExerciseIds.length ? sessionExerciseIds : day.exercises.map((item) => item.exerciseId).filter((id) => exerciseMap.has(id));
  const initialExerciseId = session.sets.find((set) => !set.completed && exerciseMap.has(set.exerciseId))?.exerciseId ?? exerciseOrder[0];
  const [exerciseId, setExerciseId] = useState(initialExerciseId);
  const [elapsed, setElapsed] = useState(() => Math.floor((Date.now() - new Date(session.startedAt).getTime()) / 1000));
  const [restSeconds, setRestSeconds] = useState<number | null>(null);
  const [details, setDetails] = useState<Exercise | null>(null);
  const [confirmedExerciseId, setConfirmedExerciseId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ tone: 'standard' | 'improved' | 'record'; text: string } | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  useEffect(() => { const timer = window.setInterval(() => setElapsed((value) => value + 1), 1000); return () => window.clearInterval(timer); }, []);
  useEffect(() => { if (!feedback) return; const timer = window.setTimeout(() => setFeedback(null), 2400); return () => window.clearTimeout(timer); }, [feedback]);
  const currentExercise = exerciseMap.get(exerciseId) ?? exerciseMap.get(day.exercises[0]?.exerciseId);
  if (!currentExercise) return <div className="empty-state card"><Info size={30} /><h3>This saved workout cannot be resumed.</h3><p>Your completed history is still preserved. Return to the program and start a current session.</p><button type="button" className="secondary-button" onClick={onBack}>Back to program</button></div>;
  const scheduledPrescription = day.exercises.find((item) => item.exerciseId === exerciseId);
  const currentSets = session.sets.filter((set) => set.exerciseId === exerciseId);
  const prescription = scheduledPrescription ?? { exerciseId, ...currentExercise.defaultPrescription, sets: Math.max(1, currentSets.filter((set) => !set.isWarmup).length) };
  const previous = previousSets(controller.data.sessions, exerciseId, session.id);
  const progress = progressionRecommendation(controller.data.sessions, exerciseId, prescription, session.id);
  const workingCompleted = session.sets.filter((set) => set.completed && !set.isWarmup).length;
  const totalWorking = session.sets.filter((set) => !set.isWarmup).length;
  const currentWorkingSets = currentSets.filter((set) => !set.isWarmup);
  const currentWorkingCompleted = currentWorkingSets.filter((set) => set.completed).length;
  const nextExerciseId = exerciseOrder[exerciseOrder.indexOf(exerciseId) + 1];
  const nextExercise = nextExerciseId ? exerciseMap.get(nextExerciseId) : undefined;
  const previousSession = [...controller.data.sessions].reverse().find((item) => item.id !== session.id && item.completedAt && item.dayId === session.dayId);
  const previousVolume = previousSession ? workoutVolume(previousSession) : 0;
  const currentVolume = workoutVolume(session);
  const exerciseCompletedCount = exerciseOrder.filter((id) => { const sets = session.sets.filter((set) => set.exerciseId === id && !set.isWarmup); return sets.length > 0 && sets.every((set) => set.completed); }).length;
  const recordCount = exerciseOrder.filter((id) => {
    const currentBest = Math.max(0, ...session.sets.filter((set) => set.exerciseId === id && set.completed && !set.isWarmup).map((set) => set.weightKg * (1 + set.reps / 30)));
    const priorBest = Math.max(0, ...controller.data.sessions.filter((item) => item.id !== session.id && item.completedAt).flatMap((item) => item.sets).filter((set) => set.exerciseId === id && set.completed && !set.isWarmup).map((set) => set.weightKg * (1 + set.reps / 30)));
    return currentBest > priorBest && currentBest > 0;
  }).length;
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
      <aside className="session-exercises"><p className="eyebrow">Exercise order</p>{exerciseOrder.map((itemExerciseId, index) => { const sets = session.sets.filter((set) => set.exerciseId === itemExerciseId && !set.isWarmup); const done = sets.filter((set) => set.completed).length; return <button type="button" key={itemExerciseId} onClick={() => setExerciseId(itemExerciseId)} className={exerciseId === itemExerciseId ? 'active' : done === sets.length && sets.length > 0 ? 'done' : ''}><span>{done === sets.length && sets.length > 0 ? <Check size={16} /> : index + 1}</span><p>{exerciseMap.get(itemExerciseId)?.name}<small>{done} / {sets.length} working sets</small></p><ChevronRight size={17} /></button>; })}<button type="button" className="finish-session" onClick={() => setSummaryOpen(true)} disabled={workingCompleted === 0}><Trophy size={18} /> Review workout</button></aside>
      <section className="set-logger">
        <div className="active-exercise-hero"><button type="button" className="exercise-visual-button" onClick={() => setDetails(currentExercise)} aria-label={`Open ${currentExercise.name} technique`}>{currentExercise.videoId ? <img src={`https://i.ytimg.com/vi/${currentExercise.videoId}/hqdefault.jpg`} alt={`${currentExercise.name} video thumbnail`} loading="lazy" /> : <BodyFocus muscles={currentExercise.primaryMuscles} />}<span><Play size={18} /> Technique</span></button><div><p className="eyebrow">Current exercise · Set {Math.min(currentWorkingCompleted + 1, currentWorkingSets.length)} of {currentWorkingSets.length}</p><h2>{currentExercise.name}</h2><div className="active-muscles">{currentExercise.primaryMuscles.map((muscle) => <span key={muscle}>{muscle}</span>)}</div><p>Target <strong>{prescription.sets} × {prescription.repMin}–{prescription.repMax}</strong> · {prescription.rir} RIR · {formatDuration(prescription.restSeconds)} rest</p>{prescription.notes ? <small className="exercise-note">{prescription.notes}</small> : null}</div></div>
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
        {nextExercise ? <button type="button" className="next-exercise-preview" onClick={() => setExerciseId(nextExercise.id)}><span>Next exercise</span><BodyFocus muscles={nextExercise.primaryMuscles} compact /><p><strong>{nextExercise.name}</strong><small>{nextExercise.primaryMuscles.join(' · ')}</small></p><ChevronRight size={18} /></button> : <div className="next-exercise-preview final"><Trophy size={20} /><p><strong>Final exercise</strong><small>Review the workout when your working sets are complete.</small></p></div>}
      </section>
    </div>
    {restSeconds !== null ? <RestTimer initialSeconds={restSeconds} onClose={() => setRestSeconds(null)} /> : null}
    {details ? <ExerciseDetail exercise={details} onClose={() => setDetails(null)} /> : null}
    <Modal open={summaryOpen} onClose={() => setSummaryOpen(false)} title="Workout summary" subtitle="Review the session before saving it to your history." wide>
      <div className="workout-completion-summary"><div className="completion-hero"><span><Trophy size={28} /></span><div><p className="eyebrow">Session ready to save</p><h2>{day.isRestDay ? session.title : displayWorkoutTitle(day)}</h2><p>{recordCount > 0 ? `${recordCount} genuine personal ${recordCount === 1 ? 'record' : 'records'} detected.` : 'A completed session is the win; records are optional.'}</p></div></div><div className="completion-metrics"><div><strong>{formatDuration(elapsed)}</strong><span>duration</span></div><div><strong>{workingCompleted}</strong><span>working sets</span></div><div><strong>{Math.round(currentVolume).toLocaleString()}</strong><span>kg volume</span></div><div><strong>{exerciseCompletedCount}/{exerciseOrder.length}</strong><span>exercises complete</span></div></div><div className="completion-comparison"><BarChart3 size={20} /><p><strong>{previousVolume ? currentVolume > previousVolume ? 'Volume increased' : currentVolume === previousVolume ? 'Matched previous volume' : 'Lower volume than the previous session' : 'First comparable session'}</strong>{previousVolume ? `${Math.abs(Math.round(currentVolume - previousVolume)).toLocaleString()} kg ${currentVolume >= previousVolume ? 'above' : 'below'} the last ${day.label} session.` : 'Complete another session of this type to unlock a direct comparison.'}</p></div><div className="completion-recovery"><HeartPulse size={20} /><p><strong>Recovery next</strong>Log the session, hydrate normally, eat your planned protein, and let the next programmed day guide the next hard effort.</p></div><button type="button" className="primary-button full" onClick={() => { controller.finishWorkout(session.id, elapsed); setSummaryOpen(false); onFinished(); }}><Check size={18} /> Finish and save workout</button><button type="button" className="text-button centered" onClick={() => setSummaryOpen(false)}>Return to workout</button></div>
    </Modal>
  </div>;
}

function WorkoutHistory({ sessions, onOpen }: { sessions: WorkoutSession[]; onOpen: (session: WorkoutSession) => void }) {
  const completed = [...sessions].filter((session) => session.completedAt).sort((a, b) => b.date.localeCompare(a.date));
  return <section className="history-list">{completed.length ? completed.map((session) => <button type="button" className="history-card card" key={session.id} onClick={() => onOpen(session)}><div className="history-date"><span>{new Date(`${session.date}T12:00:00`).getDate()}</span><small>{new Intl.DateTimeFormat('en', { month: 'short' }).format(new Date(`${session.date}T12:00:00`))}</small></div><div><p className="eyebrow">{prettyDate(session.date)}</p><h3>{displayWorkoutTitle({ id: session.dayId, title: session.title })}</h3><span>{formatDuration(session.durationSeconds)} · {session.sets.filter((set) => set.completed && !set.isWarmup).length} working sets</span></div><div className="volume-stat"><strong>{Math.round(workoutVolume(session)).toLocaleString()}</strong><span>kg volume</span></div><ChevronRight size={19} /></button>) : <div className="empty-state card"><History size={30} /><h3>No workouts yet</h3><p>Finish your first session and the full log will appear here.</p></div>}</section>;
}

const templateOptions: Array<{ id: TrainingTemplate; label: string; detail: string }> = [
  { id: 'two-day-full-body', label: '2 days', detail: 'Two full-body sessions' },
  { id: 'three-day-full-body', label: '3 days', detail: 'Three full-body sessions' },
  { id: 'four-day-upper-lower', label: '4 days', detail: 'Chest, back, shoulders & legs' },
];

function WeeklyOverview({ controller }: { controller: AppController }) {
  const [templateToApply, setTemplateToApply] = useState<TrainingTemplate | null>(null);
  const analysis = useMemo(() => analyzeWeeklyProgram(controller.data.program, controller.data.profile), [controller.data.profile, controller.data.program]);
  const cardioMinutes = weeklyCardioMinutes(controller.data.cardioLog);
  const strengthCompleted = weeklyStrengthCompleted(controller.data.sessions);
  const plannedStrength = controller.data.program.filter((day) => !day.isRestDay).length;
  const adherence = adherenceSuggestion(controller.data.program, controller.data.sessions);
  const cardioPercent = Math.min(100, cardioMinutes / controller.data.weeklyCardioTarget * 100);

  return <>
    <section className="weekly-overview card">
      <header><div><p className="eyebrow">Weekly analysis</p><h2>Coverage and consistency</h2><p>Direct-set estimates count primary muscles only; compound exercises overlap muscle groups.</p></div><div className="weekly-score"><span><Dumbbell size={17} /><strong>{strengthCompleted}/{plannedStrength}</strong> strength</span><span><Activity size={17} /><strong>{cardioMinutes}/{controller.data.weeklyCardioTarget}</strong> cardio min</span></div></header>
      <div className="cardio-progress"><div><span style={{ width: `${cardioPercent}%` }} /></div><p>{cardioPercent >= 100 ? 'Weekly cardio target complete.' : `${controller.data.weeklyCardioTarget - cardioMinutes} minutes remain.`}</p>{controller.data.weeklyCardioTarget < 150 ? <button type="button" onClick={() => controller.setWeeklyCardioTarget(controller.data.weeklyCardioTarget + 15)}>Build target to {Math.min(150, controller.data.weeklyCardioTarget + 15)} min</button> : <span>150-minute target</span>}</div>
      <div className="analysis-grid">
        <div><h3>Movement patterns</h3><div className="coverage-grid">{analysis.movementCoverage.map((item) => <span className={item.covered ? 'covered' : 'missing'} key={item.pattern}>{item.covered ? <CheckCircle2 size={14} /> : <Circle size={14} />}<strong>{item.pattern}</strong><small>{item.sets} sets</small></span>)}</div></div>
        <div><h3>Estimated direct sets</h3><div className="muscle-volume">{analysis.muscleSets.slice(0, 12).map((item) => <span key={item.muscle}><strong>{item.sets}</strong>{item.muscle}</span>)}</div></div>
      </div>
      {analysis.warnings.length ? <div className="overview-warnings"><AlertTriangle size={17} /><div><strong>Non-blocking program checks</strong>{analysis.warnings.map((warning) => <p key={warning}>{warning}</p>)}</div></div> : null}
      {adherence ? <div className="adaptability-note"><Info size={17} /><p>{adherence} Nothing changes unless you choose a different template.</p></div> : null}
      <div className="template-picker"><div><strong>Training template</strong><span>Choose a manageable schedule; applying one replaces the current program, not history.</span></div>{templateOptions.map((option) => <button type="button" key={option.id} className={controller.data.profile.trainingTemplate === option.id ? 'active' : ''} onClick={() => option.id !== controller.data.profile.trainingTemplate && setTemplateToApply(option.id)}><strong>{option.label}</strong><span>{option.detail}</span></button>)}</div>
    </section>
    <Modal open={Boolean(templateToApply)} onClose={() => setTemplateToApply(null)} title="Apply a different training template?" subtitle="Food logs, weight history, completed workouts, and recent bests remain unchanged.">
      <div className="template-confirm"><p>The current editable weekly program will be replaced with the selected safe default. This never happens automatically.</p><button type="button" className="primary-button full" onClick={() => { if (templateToApply) controller.applyTrainingTemplate(templateToApply); setTemplateToApply(null); }}><Check size={17} /> Apply template</button><button type="button" className="text-button centered" onClick={() => setTemplateToApply(null)}>Keep current program</button></div>
    </Modal>
  </>;
}

function CardioLogger({ controller, day }: { controller: AppController; day: WorkoutDay }) {
  const [minutes, setMinutes] = useState(String(day.cardioTargetMinutes ?? 30));
  const [activity, setActivity] = useState<CardioEntry['activity']>('Brisk walk');
  const today = toDateKey();
  const todayMinutes = controller.data.cardioLog.filter((entry) => entry.date === today).reduce((sum, entry) => sum + entry.minutes, 0);
  const valid = Number(minutes) >= 5 && Number(minutes) <= 180;
  return <div className="cardio-logger"><div><p className="eyebrow">Cardio is programmed</p><h3>{day.cardioSuggestion}</h3><p>Log moderate, low-impact minutes. Avoid hard intervals when lower-body fatigue is high.</p></div><form onSubmit={(event) => { event.preventDefault(); if (!valid) return; controller.addCardio(today, Number(minutes), activity); setMinutes(String(day.cardioTargetMinutes ?? 30)); }}><label>Activity<select value={activity} onChange={(event) => setActivity(event.target.value as CardioEntry['activity'])}><option>Brisk walk</option><option>Relaxed walk</option><option>Cycling</option><option>Other low impact</option></select></label><label>Minutes<input type="number" min="5" max="180" value={minutes} onChange={(event) => setMinutes(event.target.value)} /></label><button type="submit" className="primary-button" disabled={!valid}><Plus size={17} /> Log cardio</button></form><span className="today-cardio"><Activity size={16} /> {todayMinutes} minutes logged today</span></div>;
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
  const day = controller.data.program.find((item) => item.id === selectedDayId) ?? controller.data.program[0];
  const selectedIndex = controller.data.program.findIndex((item) => item.id === day.id);
  const nextTrainingDay = [...controller.data.program.slice(selectedIndex + 1), ...controller.data.program.slice(0, selectedIndex + 1)].find((item) => !item.isRestDay);
  const today = toDateKey();
  const currentWeekDates = datesInWeek(today);
  const previousCompleted = controller.data.sessions.filter((session) => session.completedAt);

  if (activeSession && !activeSession.completedAt && !hideActiveSession) return <ActiveWorkout controller={controller} session={activeSession} onBack={() => setHideActiveSession(true)} onFinished={() => { setActiveSessionId(null); setHideActiveSession(true); setView('history'); }} />;

  return <div className="page workout-page">
    <header className="page-header workout-header"><div><p className="eyebrow">Adaptive strength + cardio plan</p><h1>Train with control.</h1><p>Four lifting days by default, programmed cardio, balance-first squat progressions, and clear double progression.</p></div><div className="view-toggle"><button type="button" className={view === 'program' ? 'active' : ''} onClick={() => setView('program')}><Dumbbell size={17} /> Program</button><button type="button" className={view === 'history' ? 'active' : ''} onClick={() => setView('history')}><History size={17} /> History</button></div></header>
    <div className="workout-safety"><ShieldCheck size={18} /><p><strong>Safety first.</strong> Stop for sharp pain, dizziness, or instability. Regress the movement and seek professional assessment when appropriate.</p></div>
    {view === 'program' ? <>
      {activeSession && !activeSession.completedAt ? <button type="button" className="resume-banner" onClick={() => setHideActiveSession(false)}><Play size={18} /><span><strong>{displayWorkoutTitle({ id: activeSession.dayId, title: activeSession.title })} is in progress</strong><small>{activeSession.sets.filter((set) => set.completed && !set.isWarmup).length} working sets complete</small></span><ChevronRight size={18} /></button> : null}
      <section className="day-tabs premium-day-tabs" aria-label="Weekly workout schedule">{controller.data.program.map((item, index) => { const date = currentWeekDates[index]; const completed = !item.isRestDay && controller.data.sessions.some((session) => session.dayId === item.id && session.completedAt && session.date === date); const cardioDone = item.isRestDay && controller.data.cardioLog.some((entry) => entry.date === date); const isSelected = day.id === item.id; const isToday = date === today; const isPast = date < today; const status = completed ? 'Completed' : cardioDone ? 'Cardio logged' : isToday ? 'Today' : isPast && !item.isRestDay ? 'Not completed' : item.isRestDay ? 'Recovery' : 'Upcoming'; const DayIcon = item.isRestDay ? isToday ? HeartPulse : BedDouble : Dumbbell; return <button type="button" key={item.id} aria-current={isSelected ? 'date' : undefined} className={`${isSelected ? 'active' : ''} ${item.isRestDay ? 'rest-day' : 'training-day'} ${completed || cardioDone ? 'completed' : ''} ${isToday ? 'current-day' : ''} ${isPast && !completed ? 'past-day' : ''}`} onClick={() => setSelectedDayId(item.id)}><div className="day-tab-top"><span>{item.label}</span><i><DayIcon size={16} /></i></div><strong>{displayWorkoutTitle(item)}</strong><p>{item.focus}</p><div className="day-tab-meta"><span><Clock3 size={12} /> {item.duration.replace(' cardio', '')}</span><span>{item.isRestDay ? 'Recovery' : `${item.exercises.length} exercises`}</span></div><small>{completed || cardioDone ? <BadgeCheck size={14} /> : isToday ? <Circle size={13} /> : null}{status}</small></button>; })}</section>
      <WeeklyOverview controller={controller} />
      <section className={`program-layout ${day.isRestDay ? 'rest-layout' : ''}`}>
        {day.isRestDay ? <article className="program-main recovery-main card"><header><div><p className="eyebrow">{day.label} conditioning</p><h2>{displayWorkoutTitle(day)}</h2><span><HeartPulse size={16} /> {day.duration}</span></div><span className="recovery-badge">Non-lifting day</span></header><CardioLogger controller={controller} day={day} /><div className="recovery-plan"><span className="recovery-orb"><HeartPulse size={26} /></span><div><p className="eyebrow">Recovery guidance</p><h3>Build fitness without stealing from strength.</h3><p>Moderate cardio supports the plan. Keep the dose manageable and let lower-body recovery guide the pace.</p></div><ul>{day.recovery?.map((item) => <li key={item}><Check size={16} />{item}</li>)}</ul></div>{nextTrainingDay ? <button type="button" className="secondary-button next-session" onClick={() => setSelectedDayId(nextTrainingDay.id)}><CalendarDays size={18} /> Next: {nextTrainingDay.label} · {displayWorkoutTitle(nextTrainingDay)}<ChevronRight size={17} /></button> : null}</article> : <article className="program-main premium-program-main card"><header><div><p className="eyebrow">{day.label} session</p><h2>{displayWorkoutTitle(day)}</h2><span><Clock3 size={16} /> {day.focus} · {day.duration}</span></div><button type="button" className="secondary-button" onClick={() => setEditingDay(day)}><Pencil size={16} /> Edit program</button></header><div className="session-summary"><div><ToneIcon Icon={Dumbbell} tone="coral" /><span><strong>{day.exercises.length}</strong> exercises</span></div><div><ToneIcon Icon={ListChecks} tone="amber" /><span><strong>{day.exercises.reduce((sum, item) => sum + item.sets, 0)}</strong> working sets</span></div><div><ToneIcon Icon={Clock3} tone="cyan" /><span><strong>{day.duration}</strong> estimated</span></div><div className="session-muscles"><span>Main focus</span><strong>{[...new Set(day.exercises.flatMap((item) => exerciseMap.get(item.exerciseId)?.primaryMuscles ?? []))].slice(0, 4).join(' · ')}</strong></div></div><div className="program-list premium-program-list">{day.exercises.map((item, index) => { const exercise = exerciseMap.get(item.exerciseId)!; const previous = previousSets(previousCompleted, item.exerciseId); const best = previous.reduce((max, set) => Math.max(max, set.weightKg), 0); const recommendation = controller.data.progressionPlans.find((plan) => plan.exerciseId === item.exerciseId); const compound = exercise.movementPatterns.some((pattern) => ['Horizontal push', 'Horizontal pull', 'Vertical push', 'Squat', 'Hip hinge', 'Single-leg'].includes(pattern)); return <div className={`program-exercise ${compound ? 'compound' : 'accessory'}`} key={`${item.exerciseId}-${index}`}><span className="exercise-index">{String(index + 1).padStart(2, '0')}</span><button type="button" className="program-exercise__main" onClick={() => setDetails(exercise)}><BodyFocus muscles={exercise.primaryMuscles} compact /><div><h3>{exercise.name}{recommendation ? <em>Progression ready</em> : null}</h3><p>{exercise.primaryMuscles.join(' · ')}{item.notes ? ` · ${item.notes}` : ''}</p></div><div className="prescription"><strong>{item.sets} × {item.repMin}–{item.repMax}</strong><span>{item.warmupSets ? `${item.warmupSets} warm-up · ` : ''}{formatDuration(item.restSeconds)} rest · {item.rir} RIR</span></div>{best ? <div className="last-load"><strong>{best} kg</strong><span>previous best</span></div> : <div className="last-load"><strong>—</strong><span>no history</span></div>}<ChevronRight size={19} /></button></div>; })}</div><button type="button" className="primary-button start-workout" onClick={() => activeSession && !activeSession.completedAt ? setHideActiveSession(false) : onStartWorkout(day.id)}><Flame size={19} /> {activeSession && !activeSession.completedAt ? 'Resume active workout' : `Start ${displayWorkoutTitle(day)}`}</button></article>}
        <aside className="workout-guidance">{day.isRestDay ? <><article className="card overload-card"><span className="metric-icon blue"><Activity size={19} /></span><p className="eyebrow">Weekly cardio</p><h3>Build toward 150.</h3><p>Begin with the current manageable target, add minutes gradually, and use brisk walking, cycling, or another low-impact option.</p><div><Sparkles size={16} /> Small bouts still count</div></article><article className="card squat-card"><span className="metric-icon lime"><BedDouble size={19} /></span><p className="eyebrow">Fatigue check</p><h3>Easy means recoverable.</h3><p>Skip hard intervals when your legs are carrying fatigue from strength training.</p></article></> : <><article className="card overload-card"><span className="metric-icon lime"><BarChart3 size={19} /></span><p className="eyebrow">Double progression</p><h3>Reps, then load.</h3><p>Reach the top of the range at the planned RIR for two sessions. Confirm any load change before the app uses it next time.</p><div><Sparkles size={16} /> No failure required</div></article><article className="card warmup-card"><span className="metric-icon orange"><ListChecks size={19} /></span><p className="eyebrow">Warm-up sets</p><h3>Prepare, don’t pre-fatigue.</h3><p>Progressive warm-ups are logged separately and excluded from working-set volume.</p></article></>}</aside>
      </section>
      <SquatProgressionCard controller={controller} onDetails={setDetails} />
    </> : <WorkoutHistory sessions={controller.data.sessions} onOpen={setHistorySession} />}
    {details ? <ExerciseDetail exercise={details} onClose={() => setDetails(null)} /> : null}
    {editingDay ? <ProgramEditor day={editingDay} program={controller.data.program} profile={controller.data.profile} onSave={controller.updateProgramDay} onClose={() => setEditingDay(null)} /> : null}
    <Modal open={Boolean(historySession)} onClose={() => setHistorySession(null)} title={historySession ? displayWorkoutTitle({ id: historySession.dayId, title: historySession.title }) : 'Workout'} subtitle={historySession ? `${prettyDate(historySession.date, true)} · ${formatDuration(historySession.durationSeconds)}` : undefined} wide>{historySession ? <div className="workout-log-detail"><div className="history-totals"><div><strong>{historySession.sets.filter((set) => set.completed && !set.isWarmup).length}</strong><span>working sets</span></div><div><strong>{Math.round(workoutVolume(historySession)).toLocaleString()}</strong><span>kg volume</span></div><div><strong>{new Set(historySession.sets.filter((set) => set.completed && !set.isWarmup).map((set) => set.exerciseId)).size}</strong><span>exercises</span></div></div>{[...new Set(historySession.sets.map((set) => set.exerciseId))].map((exerciseId) => <section key={exerciseId}><h3>{exerciseMap.get(exerciseId)?.name}</h3>{historySession.sets.filter((set) => set.exerciseId === exerciseId).map((set) => <p key={set.id}><span>{set.isWarmup ? `Warm-up ${set.setNumber}` : `Set ${set.setNumber}`}</span><strong>{set.weightKg} kg × {set.reps}{set.rir !== undefined ? ` · ${set.rir} RIR` : ''}</strong>{set.completed ? <Check size={16} /> : null}</p>)}</section>)}</div> : null}</Modal>
  </div>;
}
