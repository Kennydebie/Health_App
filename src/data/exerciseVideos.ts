import type { ExerciseVideo } from '../types/models';

const reviewed = '2026-08-22';
const youtube = (sourceId: string, title: string, sourceName: string, sourceChannelUrl: string): ExerciseVideo => ({
  status: 'verified',
  provider: 'youtube',
  sourceId,
  sourceUrl: `https://www.youtube.com/watch?v=${sourceId}`,
  embedUrl: `https://www.youtube-nocookie.com/embed/${sourceId}?rel=0`,
  title,
  sourceName,
  sourceChannelUrl,
  lastReviewed: reviewed,
  exactMatch: true,
});

export const EXERCISE_VIDEOS: Record<string, ExerciseVideo> = {
  'bench-press': youtube('lWFknlOTbyM', 'How to do the BARBELL BENCH PRESS! | 2 Minute Tutorial', 'Max Euceda', 'https://www.youtube.com/@MaxEuceda7'),
  'one-arm-row': youtube('r4-3p0KgEA8', 'Quick How To: Dumbbell Single Arm Row', 'MuscleWiki', 'https://www.youtube.com/@musclewiki'),
  'incline-db-press': youtube('hChjZQhX1Ls', 'How To: Dumbbell Incline Press | 3 GOLDEN RULES (MADE BETTER!)', 'ScottHermanFitness', 'https://www.youtube.com/@ScottHermanFitness'),
  'barbell-row': youtube('kBWAon7ItDw', 'How To PROPERLY Barbell Row For A Bigger Back (Stop Making These Mistakes!)', 'Jeremy Ethier', 'https://www.youtube.com/@JeremyEthier'),
  'db-curl': youtube('e_XV8NV7xm0', 'The Dumbbell Curl: Gym Shorts (How To)', 'Barbell Logic', 'https://www.youtube.com/@BarbellLogic'),
  'triceps-extension': youtube('T1EO7u2n7WU', 'Dumbbell Overhead Triceps Extension ( Seated ) | How To | Proper Form & Technique', 'FITTR', 'https://www.youtube.com/@FITTRwithSquats'),
  'romanian-deadlift': youtube('_oyxCn2iSjU', 'HOW TO DO ROMANIAN DEADLIFTS (RDLs): Build Beefy Hamstrings With Perfect Technique', 'Jeff Nippard', 'https://www.youtube.com/@JeffNippard'),
  'hip-thrust': youtube('LM8XHLYJoYs', 'Proper Hip Thrust Form', 'Bret Contreras Glute Guy', 'https://www.youtube.com/@bretcontreras1'),
  'overhead-press': youtube('vlFGTI5JzjI', 'How To PROPERLY Dumbbell Shoulder Press (LEARN FAST)', 'Colossus Fitness', 'https://www.youtube.com/@ColossusFitness'),
  'lateral-raise': youtube('TM6se0vr1VA', 'Dumbbell Lateral Raise: Gym Shorts (How To)', 'Barbell Logic', 'https://www.youtube.com/@BarbellLogic'),
  'calf-raise': youtube('K_jsGgztcGU', 'Standing Calf Raise - The Proper Lift - BPI Sports', 'BPI Sports', 'https://www.youtube.com/@BPISportsChannel'),
  'db-bench-press': youtube('pKZMNVbfUzQ', 'Dumbbell Bench Press (proper form and variations)', 'Zack Henderson', 'https://www.youtube.com/@ZackHenderson'),
  dips: youtube('fwfZchB1mvA', 'Dips Proper Form (Chest vs. Triceps)', 'Dave Rienzi', 'https://www.youtube.com/@DaveRienzi'),
  'db-pullover': youtube('moKuOuFNBDM', 'Dumbbell Pullover Guide | How To, Muscles Worked, Mistakes', 'BarBend', 'https://www.youtube.com/@Barbend'),
  'rear-delt-fly': youtube('nlkF7_2O_Lw', 'How To Do A Rear Delt Fly', 'PureGym', 'https://www.youtube.com/@PureGymVideo'),
  'hammer-curl': youtube('TwD-YGVP4Bk', 'How to Do a Hammer Curl | Arm Workout', 'Howcast', 'https://www.youtube.com/@howcast'),
  'assisted-squat': youtube('R4q_G-qb6jM', 'Assisted Squat Demonstration', 'User-selected YouTube demonstration', 'https://www.youtube.com'),
  'box-squat': youtube('5Qb9ZnsnQ2s', 'Goblet Box Squat', 'Jason Brown', 'https://www.youtube.com/@jasonbrowntraining'),
  'supported-goblet-squat': youtube('6mf0oa2GGUc', 'Goblet Squat Demonstration', 'User-selected YouTube demonstration', 'https://www.youtube.com'),
  'goblet-squat': youtube('nfX7IFK9UNI', 'How to do a Goblet Squat | Proper Form & Technique | NASM', 'National Academy of Sports Medicine (NASM)', 'https://www.youtube.com/@NasmOrgPersonalTrainer'),
  'supported-reverse-lunge': youtube('7r4VC2pBc7I', 'Reverse Lunge Demonstration', 'User-selected YouTube demonstration', 'https://www.youtube.com'),
  'supported-split-squat': youtube('vUikQQsXCbg', 'Split Squat Demonstration', 'User-selected YouTube demonstration', 'https://www.youtube.com'),
  'split-squat': youtube('hPC8-z6QXco', 'Split Squat Exercise Variations', 'E3 Rehab', 'https://www.youtube.com/@E3Rehab'),
  'bulgarian-split-squat': youtube('2C-uNgKwPLE', 'How To: Bulgarian Split Squat', 'ScottHermanFitness', 'https://www.youtube.com/@ScottHermanFitness'),
  'sliding-hamstring-curl': youtube('UaecXxAgsKA', 'Sliding Hamstring Curl', 'Theory of Motion Exercise Library', 'https://www.youtube.com/@theorylibrary'),
  'dead-bug': youtube('8NBNM8haZx0', 'Physical Therapy - Dead Bug Exercise', 'ChoosePT', 'https://www.youtube.com/@ChoosePTvideo'),
  'side-plank': youtube('eRygfYEe1hs', 'Side Plank', 'E3 Rehab Exercise Library', 'https://www.youtube.com/@e3rehabexerciselibrary'),
};

export function exerciseVideo(exerciseId: string) {
  return EXERCISE_VIDEOS[exerciseId];
}
