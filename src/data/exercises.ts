import type { Exercise, WorkoutDay } from '../types/models';

export const exercises: Exercise[] = [
  {
    id: 'bench-press', name: 'Barbell Bench Press', primaryMuscles: ['Chest', 'Triceps'], secondaryMuscles: ['Anterior delts'],
    setup: ['Set the rack so the bar is reachable without protracting your shoulders.', 'Plant both feet firmly and pull your shoulder blades down and back.', 'Use a grip that keeps forearms close to vertical at the bottom.'],
    execution: ['Unrack over your shoulders.', 'Lower the bar under control to the lower or mid chest.', 'Press up and slightly back while keeping your upper back fixed.'],
    breathing: 'Take a deep breath and brace before lowering; exhale after passing the hardest part of the press.',
    mistakes: ['Elbows flared to 90°', 'Shoulders rolling forward', 'Bouncing the bar', 'Losing foot pressure', 'Wrists folded back'],
    safety: 'Use safeties or a spotter. Stop the set if shoulder position becomes painful or unstable.',
    alternatives: ['Dumbbell bench press', 'Floor press', 'Push-up'], videoId: 'lWFknlOTbyM',
  },
  {
    id: 'one-arm-row', name: 'One-Arm Dumbbell Row', primaryMuscles: ['Lats', 'Upper back'], secondaryMuscles: ['Biceps', 'Rear delts'],
    setup: ['Support one hand and knee on the bench.', 'Keep ribs down and spine long.', 'Let the working shoulder blade reach without twisting.'],
    execution: ['Drive the elbow toward your back pocket.', 'Pause briefly near the torso.', 'Lower under control to a full comfortable stretch.'],
    breathing: 'Exhale as you row; inhale as you lower.', mistakes: ['Rotating the torso', 'Shrugging', 'Curling the dumbbell', 'Shortening the range'],
    safety: 'Keep the torso supported and avoid jerking the load from the floor.', alternatives: ['Barbell row', 'Chest-supported dumbbell row'], videoId: 'r4-3p0KgEA8',
  },
  {
    id: 'incline-db-press', name: 'Incline Dumbbell Press', primaryMuscles: ['Upper chest'], secondaryMuscles: ['Triceps', 'Anterior delts'],
    setup: ['Set the bench to a low incline around 20–35°.', 'Plant feet and retract shoulder blades.', 'Start dumbbells just outside the upper chest.'],
    execution: ['Press up without clashing the dumbbells.', 'Keep wrists stacked above elbows.', 'Lower slowly until the upper arms are just below the torso.'],
    breathing: 'Brace before lowering and exhale through the press.', mistakes: ['Bench too steep', 'Overarching', 'Elbows excessively flared'], safety: 'Kick dumbbells into position one at a time and keep the upper back anchored.', alternatives: ['Barbell incline press', 'Flat dumbbell press'], videoId: 'hChjZQhX1Ls',
  },
  {
    id: 'barbell-row', name: 'Barbell Row', primaryMuscles: ['Upper back', 'Lats'], secondaryMuscles: ['Biceps', 'Spinal erectors'],
    setup: ['Hinge until the torso is stable and brace hard.', 'Grip just outside the legs.', 'Keep the bar close to the body.'], execution: ['Pull toward the lower ribs.', 'Pause without extending the spine.', 'Lower until the arms are long.'], breathing: 'Hold a firm brace through the rep; reset breath at the bottom.', mistakes: ['Torso heaving', 'Bar drifting away', 'Shrugging'], safety: 'Reduce load if the lower back cannot hold a stable position.', alternatives: ['One-arm dumbbell row', 'Chest-supported row'], videoId: 'kBWAon7ItDw',
  },
  {
    id: 'db-curl', name: 'Dumbbell Curl', primaryMuscles: ['Biceps'], secondaryMuscles: ['Forearms'], setup: ['Stand tall with arms by your sides.', 'Keep upper arms quiet.'], execution: ['Curl without swinging.', 'Squeeze briefly.', 'Lower fully under control.'], breathing: 'Exhale while curling, inhale while lowering.', mistakes: ['Hip drive', 'Elbows drifting forward', 'Rushing the negative'], safety: 'Use a neutral wrist; reduce load if elbow or wrist discomfort appears.', alternatives: ['Hammer curl', 'Barbell curl'], videoId: 'e_XV8NV7xm0',
  },
  {
    id: 'triceps-extension', name: 'Dumbbell Triceps Extension', primaryMuscles: ['Triceps'], secondaryMuscles: [], setup: ['Brace the torso and point elbows forward.', 'Hold one dumbbell securely overhead.'], execution: ['Bend only at the elbows.', 'Lower to a comfortable stretch.', 'Extend without flaring excessively.'], breathing: 'Inhale down; exhale as the elbows extend.', mistakes: ['Rib flare', 'Elbows spreading', 'Moving too fast'], safety: 'Keep the range pain-free and the dumbbell controlled overhead.', alternatives: ['Dips', 'Close-grip push-up'], videoId: 'T1EO7u2n7WU',
  },
  {
    id: 'goblet-squat', name: 'Goblet Squat', primaryMuscles: ['Quads', 'Glutes'], secondaryMuscles: ['Adductors', 'Core'],
    setup: ['Hold one dumbbell close to the chest.', 'Use a stance that lets knees track over toes.', 'Keep the whole foot rooted: heel, big toe and little toe.'],
    execution: ['Brace, then sit down between the hips.', 'Let the knees travel naturally while staying balanced.', 'Descend only as far as control allows, then drive the floor away.'],
    breathing: 'Breathe into the abdomen and brace before each rep; exhale near the top.',
    mistakes: ['Rocking onto toes', 'Knees collapsing inward', 'Losing the brace', 'Forcing depth'],
    safety: 'Use a stable support with the free hand while learning. Progress from assisted squat to box squat, then unsupported goblet squat.',
    alternatives: ['Supported squat', 'Box squat', 'Bulgarian split squat'], videoId: 'nfX7IFK9UNI',
  },
  {
    id: 'romanian-deadlift', name: 'Romanian Deadlift', primaryMuscles: ['Hamstrings', 'Glutes'], secondaryMuscles: ['Spinal erectors', 'Grip'], setup: ['Stand with the load close to the thighs.', 'Soften the knees and brace.', 'Pull shoulders gently down.'], execution: ['Push hips backward.', 'Keep the load close and spine long.', 'Stop when hamstrings limit further hip travel, then stand tall.'], breathing: 'Brace before hinging; exhale after the hardest point.', mistakes: ['Turning it into a squat', 'Rounding to chase depth', 'Bar drifting forward'], safety: 'Depth is determined by hamstring mobility, not the floor.', alternatives: ['Dumbbell RDL', 'Hip thrust'], videoId: '_oyxCn2iSjU',
  },
  {
    id: 'bulgarian-split-squat', name: 'Bulgarian Split Squat', primaryMuscles: ['Quads', 'Glutes'], secondaryMuscles: ['Adductors', 'Core'], setup: ['Place the rear foot lightly on the bench.', 'Set the front foot far enough forward to keep it planted.', 'Hold support with one hand if balance is limiting.'], execution: ['Lower the rear knee toward the floor.', 'Keep pressure through the front mid-foot.', 'Drive up without pushing from the rear leg.'], breathing: 'Inhale and brace down; exhale on the ascent.', mistakes: ['Rear leg doing the work', 'Front heel lifting', 'Losing balance to chase load'], safety: 'Use support freely—leg stimulus matters more than a balance challenge.', alternatives: ['Supported split squat', 'Box squat'], videoId: '2C-uNgKwPLE',
  },
  {
    id: 'hip-thrust', name: 'Hip Thrust', primaryMuscles: ['Glutes'], secondaryMuscles: ['Hamstrings'], setup: ['Place the upper back on the bench edge.', 'Set feet so shins are near vertical at the top.', 'Keep the bar or dumbbell padded.'], execution: ['Tuck the pelvis slightly.', 'Drive hips up until the torso is level.', 'Pause, then lower under control.'], breathing: 'Exhale as you reach full hip extension.', mistakes: ['Overextending the lower back', 'Feet too far away', 'Bouncing'], safety: 'Keep the bench stable against a wall if needed.', alternatives: ['Glute bridge', 'Romanian deadlift'], videoId: 'LM8XHLYJoYs',
  },
  {
    id: 'overhead-press', name: 'Dumbbell Overhead Press', primaryMuscles: ['Shoulders'], secondaryMuscles: ['Triceps', 'Upper chest'], setup: ['Brace glutes and abdomen.', 'Start dumbbells around shoulder height.', 'Keep forearms vertical.'], execution: ['Press overhead while keeping ribs down.', 'Finish with arms aligned over the torso.', 'Lower slowly.'], breathing: 'Brace before pressing; exhale near lockout.', mistakes: ['Leaning back', 'Rib flare', 'Partial range'], safety: 'Use a seated variation if torso control is limiting.', alternatives: ['Seated dumbbell press', 'Landmine press'], videoId: 'vlFGTI5JzjI',
  },
  {
    id: 'lateral-raise', name: 'Dumbbell Lateral Raise', primaryMuscles: ['Side delts'], secondaryMuscles: ['Upper traps'], setup: ['Stand tall with light dumbbells.', 'Keep elbows softly bent.'], execution: ['Raise arms out and slightly forward.', 'Stop near shoulder height.', 'Lower slowly.'], breathing: 'Exhale up; inhale down.', mistakes: ['Heaving', 'Shrugging', 'Going too heavy'], safety: 'Use a pain-free arm path and lighter load than presses.', alternatives: ['Leaning lateral raise'], videoId: 'TM6se0vr1VA',
  },
  {
    id: 'calf-raise', name: 'Standing Calf Raise', primaryMuscles: ['Calves'], secondaryMuscles: [], setup: ['Use stable support.', 'Stand with the forefoot secure.'], execution: ['Lower the heel under control.', 'Rise as high as possible.', 'Pause at the top.'], breathing: 'Breathe normally while maintaining tension.', mistakes: ['Bouncing', 'Rolling ankles outward', 'Short range'], safety: 'Keep support nearby; do not turn balance into the limiting factor.', alternatives: ['Single-leg calf raise'], videoId: 'K_jsGgztcGU',
  },
  {
    id: 'db-bench-press', name: 'Dumbbell Bench Press', primaryMuscles: ['Chest'], secondaryMuscles: ['Triceps', 'Anterior delts'], setup: ['Plant feet and anchor the upper back.', 'Start dumbbells above the chest.'], execution: ['Lower with wrists over elbows.', 'Press while maintaining shoulder position.', 'Stop short of clashing dumbbells.'], breathing: 'Brace down; exhale through the press.', mistakes: ['Shoulders rolling forward', 'Elbows too wide', 'Uneven lockout'], safety: 'Use a controlled dumbbell kick-up and safe exit to the thighs.', alternatives: ['Barbell bench press', 'Floor press'], videoId: 'pKZMNVbfUzQ',
  },
  {
    id: 'dips', name: 'Dips', primaryMuscles: ['Chest', 'Triceps'], secondaryMuscles: ['Anterior delts'], setup: ['Grip stable bars and depress the shoulders.', 'Start with a controlled support hold.'], execution: ['Lower only as far as shoulders remain comfortable.', 'Keep forearms close to vertical.', 'Press back to support.'], breathing: 'Inhale down; exhale while pressing.', mistakes: ['Dropping too deep', 'Shoulders shrugging', 'Flaring elbows'], safety: 'Use feet-assisted dips or replace them if the front of the shoulder hurts.', alternatives: ['Close-grip push-up', 'Incline dumbbell press'], videoId: 'fwfZchB1mvA',
  },
  {
    id: 'db-pullover', name: 'Dumbbell Pullover', primaryMuscles: ['Lats', 'Chest'], secondaryMuscles: ['Triceps'], setup: ['Lie lengthwise on the bench with ribs down.', 'Hold one dumbbell securely over the chest.'], execution: ['Lower in an arc until a comfortable stretch.', 'Keep elbows softly bent.', 'Pull the dumbbell back over the chest.'], breathing: 'Inhale into the stretch; exhale returning.', mistakes: ['Excessive rib flare', 'Forcing shoulder range', 'Bending elbows deeply'], safety: 'Limit range if shoulders feel pinched.', alternatives: ['One-arm row', 'Straight-arm pulldown'], videoId: 'moKuOuFNBDM',
  },
  {
    id: 'rear-delt-fly', name: 'Rear Delt Fly', primaryMuscles: ['Rear delts'], secondaryMuscles: ['Upper back'], setup: ['Hinge or lie chest-supported.', 'Use light dumbbells and long arms.'], execution: ['Sweep arms out wide.', 'Pause without shrugging.', 'Return slowly.'], breathing: 'Exhale out; inhale back.', mistakes: ['Rowing instead of flying', 'Shrugging', 'Swinging'], safety: 'Keep the load light and range smooth.', alternatives: ['Chest-supported rear delt row'], videoId: 'nlkF7_2O_Lw',
  },
  {
    id: 'hammer-curl', name: 'Hammer Curl', primaryMuscles: ['Biceps', 'Brachialis'], secondaryMuscles: ['Forearms'], setup: ['Stand with palms facing inward.', 'Keep elbows by the ribs.'], execution: ['Curl without rotating the wrists.', 'Pause briefly.', 'Lower fully.'], breathing: 'Exhale up; inhale down.', mistakes: ['Swinging', 'Elbows drifting', 'Cutting depth'], safety: 'Keep wrists neutral.', alternatives: ['Dumbbell curl'], videoId: 'TwD-YGVP4Bk',
  },
];

export const exerciseMap = new Map(exercises.map((exercise) => [exercise.id, exercise]));

export const defaultProgram: WorkoutDay[] = [
  { id: 'monday', label: 'Mon', title: 'Chest + Back + Arms', duration: '50–65 min', isRestDay: false, exercises: [
    { exerciseId: 'bench-press', sets: 3, repMin: 6, repMax: 10, restSeconds: 180, rir: '1–2' },
    { exerciseId: 'one-arm-row', sets: 3, repMin: 8, repMax: 12, restSeconds: 120, rir: '1–2' },
    { exerciseId: 'incline-db-press', sets: 3, repMin: 8, repMax: 12, restSeconds: 120, rir: '1–2' },
    { exerciseId: 'barbell-row', sets: 3, repMin: 8, repMax: 12, restSeconds: 120, rir: '1–2' },
    { exerciseId: 'db-curl', sets: 2, repMin: 10, repMax: 15, restSeconds: 75, rir: '1–2' },
    { exerciseId: 'triceps-extension', sets: 2, repMin: 10, repMax: 15, restSeconds: 75, rir: '1–2' },
  ] },
  { id: 'tuesday', label: 'Tue', title: 'Legs + Glutes', duration: '50–65 min', isRestDay: false, exercises: [
    { exerciseId: 'goblet-squat', sets: 3, repMin: 8, repMax: 12, restSeconds: 150, rir: '2' },
    { exerciseId: 'romanian-deadlift', sets: 3, repMin: 6, repMax: 10, restSeconds: 180, rir: '1–2' },
    { exerciseId: 'bulgarian-split-squat', sets: 3, repMin: 8, repMax: 12, restSeconds: 120, rir: '2' },
    { exerciseId: 'hip-thrust', sets: 3, repMin: 8, repMax: 12, restSeconds: 120, rir: '1–2' },
    { exerciseId: 'calf-raise', sets: 3, repMin: 10, repMax: 15, restSeconds: 60, rir: '1–2' },
  ] },
  { id: 'wednesday', label: 'Wed', title: 'Recovery', duration: 'No lifting', isRestDay: true, recovery: [
    'Take a relaxed 20–40 minute walk if it helps you recover.',
    'Use 5–10 minutes of easy mobility only where you feel stiff.',
    'Keep calories and protein on plan—recovery days still count.',
    'Aim for a consistent bedtime and at least 7 hours of sleep.',
  ], exercises: [] },
  { id: 'thursday', label: 'Thu', title: 'Chest + Back + Shoulders', duration: '50–65 min', isRestDay: false, exercises: [
    { exerciseId: 'db-bench-press', sets: 3, repMin: 8, repMax: 12, restSeconds: 150, rir: '1–2' },
    { exerciseId: 'one-arm-row', sets: 3, repMin: 8, repMax: 12, restSeconds: 120, rir: '1–2' },
    { exerciseId: 'overhead-press', sets: 3, repMin: 6, repMax: 10, restSeconds: 150, rir: '1–2' },
    { exerciseId: 'barbell-row', sets: 3, repMin: 8, repMax: 12, restSeconds: 120, rir: '1–2' },
    { exerciseId: 'rear-delt-fly', sets: 3, repMin: 12, repMax: 20, restSeconds: 60, rir: '1–2' },
    { exerciseId: 'hammer-curl', sets: 2, repMin: 10, repMax: 15, restSeconds: 75, rir: '1–2' },
    { exerciseId: 'triceps-extension', sets: 2, repMin: 10, repMax: 15, restSeconds: 75, rir: '1–2' },
  ] },
  { id: 'friday', label: 'Fri', title: 'Recovery', duration: 'No lifting', isRestDay: true, recovery: [
    'Keep movement easy: a normal walk is enough.',
    'Skip hard conditioning if your legs still feel heavy from Tuesday.',
    'Hydrate, hit protein, and prepare tomorrow’s equipment.',
    'Prioritize sleep before the final lifting day of the week.',
  ], exercises: [] },
  { id: 'saturday', label: 'Sat', title: 'Legs + Glutes', duration: '50–65 min', isRestDay: false, exercises: [
    { exerciseId: 'goblet-squat', sets: 3, repMin: 8, repMax: 12, restSeconds: 150, rir: '2' },
    { exerciseId: 'romanian-deadlift', sets: 3, repMin: 8, repMax: 12, restSeconds: 180, rir: '1–2' },
    { exerciseId: 'bulgarian-split-squat', sets: 3, repMin: 10, repMax: 15, restSeconds: 120, rir: '2' },
    { exerciseId: 'hip-thrust', sets: 3, repMin: 10, repMax: 15, restSeconds: 120, rir: '1–2' },
    { exerciseId: 'calf-raise', sets: 3, repMin: 12, repMax: 20, restSeconds: 60, rir: '1–2' },
  ] },
  { id: 'sunday', label: 'Sun', title: 'Recovery', duration: 'No lifting', isRestDay: true, recovery: [
    'Take a relaxed walk or enjoy a completely quiet day.',
    'Review last week’s loads and note any technique issues.',
    'Plan meals and training times for the coming week.',
    'Get to bed on time so Monday starts fresh.',
  ], exercises: [] },
];
