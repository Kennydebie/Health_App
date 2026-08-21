import { useState, type ReactNode } from 'react';
import { MUSCLE_LABELS } from '../lib/muscles';
import type { ExerciseMuscleMap, MuscleId } from '../types/models';

interface Props {
  map: ExerciseMuscleMap;
  view?: 'front' | 'back' | 'both';
  size?: 'preview' | 'detail' | 'session';
  interactive?: boolean;
  details?: Partial<Record<MuscleId, string>>;
  className?: string;
}

type MuscleRole = 'primary' | 'secondary' | 'stabilizer' | 'inactive';
const ROLE_LABELS = {
  'exercise-role': { primary: 'primary', secondary: 'secondary', stabilizer: 'stabilizer' },
  'session-exposure': { primary: 'high exposure', secondary: 'moderate exposure', stabilizer: 'stability work' },
} as const;
const PAIRED_MUSCLES = new Set<MuscleId>(['upper_chest', 'mid_chest', 'lower_chest', 'front_deltoid', 'side_deltoid', 'rear_deltoid', 'biceps', 'triceps', 'forearms', 'rhomboids', 'latissimus_dorsi', 'spinal_erectors', 'obliques', 'quadriceps', 'hamstrings', 'gluteus_maximus', 'gluteus_medius', 'adductors', 'hip_flexors', 'calves', 'tibialis_anterior']);

function roleFor(map: ExerciseMuscleMap, muscle: MuscleId): MuscleRole {
  if (map.primary.includes(muscle)) return 'primary';
  if (map.secondary.includes(muscle)) return 'secondary';
  if (map.stabilizers?.includes(muscle)) return 'stabilizer';
  return 'inactive';
}

function Region({ muscle, map, interactive, onActive, children }: { muscle: MuscleId; map: ExerciseMuscleMap; interactive: boolean; onActive: (muscle: MuscleId | null) => void; children: ReactNode }) {
  const role = roleFor(map, muscle);
  const roleLabel = role === 'inactive' ? role : ROLE_LABELS[map.presentation ?? 'exercise-role'][role];
  return <g className={`anatomy-region ${role} ${PAIRED_MUSCLES.has(muscle) ? 'paired' : ''}`} data-muscle={muscle} tabIndex={interactive && role !== 'inactive' ? 0 : undefined} role={interactive && role !== 'inactive' ? 'button' : undefined} aria-label={interactive && role !== 'inactive' ? `${MUSCLE_LABELS[muscle]}, ${roleLabel}` : undefined} onMouseEnter={() => role !== 'inactive' && onActive(muscle)} onMouseLeave={() => onActive(null)} onFocus={() => role !== 'inactive' && onActive(muscle)} onBlur={() => onActive(null)} onClick={() => role !== 'inactive' && onActive(muscle)}><title>{MUSCLE_LABELS[muscle]} · {roleLabel}</title>{children}</g>;
}

function FrontFigure({ map, interactive, onActive }: { map: ExerciseMuscleMap; interactive: boolean; onActive: (muscle: MuscleId | null) => void }) {
  return <svg viewBox="0 0 120 280" aria-hidden={interactive ? undefined : true} aria-label={interactive ? 'Front anatomical muscle map' : undefined} focusable={interactive ? undefined : 'false'}>
    <circle className="anatomy-base" cx="60" cy="22" r="16"/><path className="anatomy-base" d="M51 40c-8 3-17 10-22 19l-12 52c-2 9 3 13 8 12l10-41 4 62-8 99c-1 10 7 13 13 6l12-78h8l12 78c6 7 14 4 13-6l-8-99 4-62 10 41c5 1 10-3 8-12L91 59c-5-9-14-16-22-19l-9 6z"/>
    <path className="anatomy-structure" d="M60 45v103M42 65l18 9 18-9M43 111h34M48 151l12 17 12-17M40 181l15 8M80 181l-15 8M37 221l15 5M83 221l-15 5"/>
    <Region muscle="front_deltoid" map={map} interactive={interactive} onActive={onActive}><ellipse cx="39" cy="67" rx="9" ry="12"/><ellipse cx="81" cy="67" rx="9" ry="12"/></Region>
    <Region muscle="side_deltoid" map={map} interactive={interactive} onActive={onActive}><path d="M31 63c-4 5-5 13-2 19l7-4 2-18z"/><path d="M89 63c4 5 5 13 2 19l-7-4-2-18z"/></Region>
    <Region muscle="upper_chest" map={map} interactive={interactive} onActive={onActive}><path d="M43 67c4-5 10-7 17-6v15c-7 0-12-2-17-5z"/><path d="M77 67c-4-5-10-7-17-6v15c7 0 12-2 17-5z"/></Region>
    <Region muscle="mid_chest" map={map} interactive={interactive} onActive={onActive}><path d="M41 74c6 2 12 4 19 4v18c-8 1-15-2-19-7z"/><path d="M79 74c-6 2-12 4-19 4v18c8 1 15-2 19-7z"/></Region>
    <Region muscle="lower_chest" map={map} interactive={interactive} onActive={onActive}><path d="M41 91c5 5 12 8 19 7v10c-9 0-15-3-18-8z"/><path d="M79 91c-5 5-12 8-19 7v10c9 0 15-3 18-8z"/></Region>
    <Region muscle="biceps" map={map} interactive={interactive} onActive={onActive}><ellipse cx="30" cy="103" rx="6" ry="15"/><ellipse cx="90" cy="103" rx="6" ry="15"/></Region>
    <Region muscle="forearms" map={map} interactive={interactive} onActive={onActive}><path d="M22 119l8-2 1 27-7 2z"/><path d="M98 119l-8-2-1 27 7 2z"/></Region>
    <Region muscle="rectus_abdominis" map={map} interactive={interactive} onActive={onActive}><path d="M51 108h8v12h-9zM61 108h8l1 12h-9zM50 122h9v12h-10zM61 122h9l1 12H61zM49 136h10v13H48zM61 136h10l1 13H61z"/></Region>
    <Region muscle="obliques" map={map} interactive={interactive} onActive={onActive}><path d="M42 107l8 2-3 39-8-8z"/><path d="M78 107l-8 2 3 39 8-8z"/></Region>
    <Region muscle="hip_flexors" map={map} interactive={interactive} onActive={onActive}><path d="M46 150l12 2-4 17-10-7z"/><path d="M74 150l-12 2 4 17 10-7z"/></Region>
    <Region muscle="adductors" map={map} interactive={interactive} onActive={onActive}><path d="M55 169h5l-3 49-8-39z"/><path d="M65 169h-5l3 49 8-39z"/></Region>
    <Region muscle="quadriceps" map={map} interactive={interactive} onActive={onActive}><path d="M43 166l12 4-1 52-15-2z"/><path d="M77 166l-12 4 1 52 15-2z"/></Region>
    <Region muscle="tibialis_anterior" map={map} interactive={interactive} onActive={onActive}><path d="M40 224l12 1-4 43-10-2z"/><path d="M80 224l-12 1 4 43 10-2z"/></Region>
  </svg>;
}

function BackFigure({ map, interactive, onActive }: { map: ExerciseMuscleMap; interactive: boolean; onActive: (muscle: MuscleId | null) => void }) {
  return <svg viewBox="0 0 120 280" aria-hidden={interactive ? undefined : true} aria-label={interactive ? 'Back anatomical muscle map' : undefined} focusable={interactive ? undefined : 'false'}>
    <circle className="anatomy-base" cx="60" cy="22" r="16"/><path className="anatomy-base" d="M51 40c-9 3-18 10-23 20l-11 51c-2 9 3 13 8 12l10-41 4 64-8 97c-1 10 7 13 13 6l12-78h8l12 78c6 7 14 4 13-6l-8-97 4-64 10 41c5 1 10-3 8-12L92 60c-5-10-14-17-23-20l-9 6z"/>
    <path className="anatomy-structure" d="M60 45v108M40 68l20 8 20-8M42 111h36M46 153l14 15 14-15M40 181l15 8M80 181l-15 8M37 222l15 5M83 222l-15 5"/>
    <Region muscle="upper_trapezius" map={map} interactive={interactive} onActive={onActive}><path d="M51 43l9 4 9-4 11 21-20 10-20-10z"/></Region>
    <Region muscle="rear_deltoid" map={map} interactive={interactive} onActive={onActive}><ellipse cx="38" cy="69" rx="9" ry="12"/><ellipse cx="82" cy="69" rx="9" ry="12"/></Region>
    <Region muscle="side_deltoid" map={map} interactive={interactive} onActive={onActive}><path d="M30 65c-4 6-4 13-1 19l7-5 2-18z"/><path d="M90 65c4 6 4 13 1 19l-7-5-2-18z"/></Region>
    <Region muscle="middle_trapezius" map={map} interactive={interactive} onActive={onActive}><path d="M43 67l17 9 17-9-3 19-14 7-14-7z"/></Region>
    <Region muscle="rhomboids" map={map} interactive={interactive} onActive={onActive}><path d="M47 78l13 8v23l-14-13z"/><path d="M73 78l-13 8v23l14-13z"/></Region>
    <Region muscle="latissimus_dorsi" map={map} interactive={interactive} onActive={onActive}><path d="M39 84l19 17-5 43-15-13z"/><path d="M81 84l-19 17 5 43 15-13z"/></Region>
    <Region muscle="spinal_erectors" map={map} interactive={interactive} onActive={onActive}><path d="M54 96h5v57l-7-4z"/><path d="M66 96h-5v57l7-4z"/></Region>
    <Region muscle="triceps" map={map} interactive={interactive} onActive={onActive}><ellipse cx="30" cy="103" rx="6" ry="16"/><ellipse cx="90" cy="103" rx="6" ry="16"/></Region>
    <Region muscle="forearms" map={map} interactive={interactive} onActive={onActive}><path d="M22 119l8-2 1 27-7 2z"/><path d="M98 119l-8-2-1 27 7 2z"/></Region>
    <Region muscle="gluteus_medius" map={map} interactive={interactive} onActive={onActive}><path d="M43 150l16 3-4 13-14-2z"/><path d="M77 150l-16 3 4 13 14-2z"/></Region>
    <Region muscle="gluteus_maximus" map={map} interactive={interactive} onActive={onActive}><path d="M42 164c5-3 11-2 18 2v20c-8 3-15 0-19-6z"/><path d="M78 164c-5-3-11-2-18 2v20c8 3 15 0 19-6z"/></Region>
    <Region muscle="hamstrings" map={map} interactive={interactive} onActive={onActive}><path d="M41 185l16 2-4 43-15-3z"/><path d="M79 185l-16 2 4 43 15-3z"/></Region>
    <Region muscle="calves" map={map} interactive={interactive} onActive={onActive}><path d="M39 229c7-2 12 1 14 8l-5 31-11-2z"/><path d="M81 229c-7-2-12 1-14 8l5 31 11-2z"/></Region>
  </svg>;
}

export function AnatomicalMuscleMap({ map, view = map.preferredView, size = 'preview', interactive = false, details, className = '' }: Props) {
  const [active, setActive] = useState<MuscleId | null>(null);
  const views = view === 'both' ? ['front', 'back'] as const : [view] as const;
  const primary = map.primary.map((id) => MUSCLE_LABELS[id]);
  const secondary = map.secondary.map((id) => MUSCLE_LABELS[id]);
  const stabilizers = (map.stabilizers ?? []).map((id) => MUSCLE_LABELS[id]);
  const labels = ROLE_LABELS[map.presentation ?? 'exercise-role'];
  const label = `${views.join(' and ')} anatomical view. ${labels.primary}: ${primary.join(', ') || 'none'}. ${labels.secondary}: ${secondary.join(', ') || 'none'}.${stabilizers.length ? ` ${labels.stabilizer}: ${stabilizers.join(', ')}.` : ''}`;
  return <div className={`anatomical-map size-${size} view-${view} laterality-${map.laterality ?? 'bilateral'} ${interactive ? 'interactive' : ''} ${className}`} role={interactive ? 'group' : 'img'} aria-label={label}>
    <div className="anatomical-map__figures">{views.map((item) => <figure key={item}>{item === 'front' ? <FrontFigure map={map} interactive={interactive} onActive={setActive}/> : <BackFigure map={map} interactive={interactive} onActive={setActive}/>}<figcaption>{item === 'front' ? 'Front' : 'Back'}</figcaption></figure>)}</div>
    {interactive && active ? <div className="anatomy-tooltip" role="status"><strong>{MUSCLE_LABELS[active]}</strong><span>{ROLE_LABELS[map.presentation ?? 'exercise-role'][roleFor(map, active) as Exclude<MuscleRole, 'inactive'>]}</span>{details?.[active] ? <small>{details[active]}</small> : null}</div> : null}
  </div>;
}

export function MuscleMapLegend({ presentation = 'exercise-role' }: { presentation?: NonNullable<ExerciseMuscleMap['presentation']> }) {
  const labels = ROLE_LABELS[presentation];
  return <div className="muscle-map-legend" aria-label="Muscle highlight legend"><span><i className="primary"/>{labels.primary}</span><span><i className="secondary"/>{labels.secondary}</span><span><i className="stabilizer"/>{labels.stabilizer}</span></div>;
}
