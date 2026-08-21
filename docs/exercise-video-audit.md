# Project 75 exercise video audit

Reviewed: 2026-08-21

Scope: every canonical exercise reachable from the exercise library, workout templates, squat progressions, alternatives, saved/legacy workout IDs, seed data, and adaptive recommendations. The canonical library contains 27 exercises. All stored YouTube videos were opened through YouTube oEmbed to verify title/channel metadata and through `youtube-nocookie.com/embed/{id}` to confirm an HTTP 200 embed document. Player behavior is also covered by app tests and browser checks.

Status definitions:

- `verified`: exact movement match, public metadata resolved, privacy-enhanced embed endpoint available.
- `missing`: no sufficiently exact, reputable embed was found; Project 75 intentionally shows no player.
- `rejected`: candidate was reviewed but would teach materially different equipment or mechanics.

| Canonical exercise | Discovery source | Exact-match query / candidate | Source and title | Status | Decision |
|---|---|---|---|---|---|
| Barbell Bench Press | Existing library + direct verification | `lWFknlOTbyM` | Max Euceda — How to do the BARBELL BENCH PRESS! | verified | Kept; exact barbell bench press tutorial. |
| One-Arm Dumbbell Row | Existing library + direct verification | `r4-3p0KgEA8` | MuscleWiki — Quick How To: Dumbbell Single Arm Row | verified | Kept; exact supported one-arm row. |
| Incline Dumbbell Press | Existing library + direct verification | `hChjZQhX1Ls` | ScottHermanFitness — How To: Dumbbell Incline Press | verified | Kept; exact incline dumbbell press. |
| Barbell Row | Existing library + direct verification | `kBWAon7ItDw` | Jeremy Ethier — How To PROPERLY Barbell Row | verified | Kept; exact barbell-row technique. |
| Dumbbell Curl | Existing library + direct verification | `e_XV8NV7xm0` | Barbell Logic — The Dumbbell Curl: Gym Shorts | verified | Kept; exact dumbbell curl. |
| Dumbbell Triceps Extension | Existing library + direct verification | `T1EO7u2n7WU` | FITTR — Dumbbell Overhead Triceps Extension (Seated) | verified | Kept; matches the overhead dumbbell variation. |
| Romanian Deadlift | Existing library + direct verification | `_oyxCn2iSjU` | Jeff Nippard — How To Do Romanian Deadlifts | verified | Kept; exact RDL tutorial. |
| Hip Thrust | Existing library + direct verification | `LM8XHLYJoYs` | Bret Contreras Glute Guy — Proper Hip Thrust Form | verified | Kept; exact barbell hip thrust. |
| Dumbbell Overhead Press | Existing library + direct verification | `vlFGTI5JzjI` | Colossus Fitness — How To PROPERLY Dumbbell Shoulder Press | verified | Kept; exact dumbbell overhead press. |
| Dumbbell Lateral Raise | Existing library + direct verification | `TM6se0vr1VA` | Barbell Logic — Dumbbell Lateral Raise: Gym Shorts | verified | Kept; exact lateral raise. |
| Standing Calf Raise | Existing library + direct verification | `K_jsGgztcGU` | BPI Sports — Standing Calf Raise | verified | Kept; exact standing calf raise. |
| Dumbbell Bench Press | Existing library + direct verification | `pKZMNVbfUzQ` | Zack Henderson — Dumbbell Bench Press | verified | Kept; exact flat dumbbell bench press. |
| Dips | Existing library + direct verification | `fwfZchB1mvA` | Dave Rienzi — Dips Proper Form | verified | Kept; discusses both chest and triceps positioning. |
| Dumbbell Pullover | Existing library + direct verification | `moKuOuFNBDM` | BarBend — Dumbbell Pullover Guide | verified | Kept; exact dumbbell pullover. |
| Rear Delt Fly | Existing library + direct verification | `nlkF7_2O_Lw` | PureGym — How To Do A Rear Delt Fly | verified | Kept; exact rear-delt fly. |
| Hammer Curl | Existing library + direct verification | `TwD-YGVP4Bk` | Howcast — How to Do a Hammer Curl | verified | Kept; exact neutral-grip curl. |
| Assisted Squat | Web research + direct candidate verification | fixed-support assisted squat; `_XKpkDpdq-8`; `Pegw_SbLYVc` | Freedom PT yoga-band squat; Dr. Carl Baird TRX squat | missing | Both candidates embed, but were rejected because band/TRX assistance differs from Project 75’s fixed two-hand support. |
| Box Squat | Existing library + direct verification | `5Qb9ZnsnQ2s` | Jason Brown — Goblet Box Squat | verified | Kept; box target and controlled contact match; video adds a goblet load that can be omitted. |
| Supported Goblet Squat | Web research | one-hand-supported dumbbell goblet squat | — | missing | No sufficiently exact reputable embed found; unsupported goblet videos were rejected as incomplete matches. |
| Unsupported Goblet Squat | Existing library + direct verification | `nfX7IFK9UNI` | NASM — How to do a Goblet Squat | verified | Kept; exact unsupported goblet squat. |
| Supported Reverse Lunge | Web research | stable hand support reverse lunge | — | missing | No exact result found; ordinary reverse-lunge videos omit the programmed balance support. |
| Supported Split Squat | Web research | rear-foot-down split squat with stable hand support | — | missing | No exact result found; unsupported and Bulgarian variations were rejected. |
| Unsupported Split Squat | Web research + direct verification | `hPC8-z6QXco` | E3 Rehab — Split Squat Exercise Variations | verified | Added; demonstrates and explains the exact rear-foot-down split squat family. |
| Bulgarian Split Squat | Existing library + direct verification | `2C-uNgKwPLE` | ScottHermanFitness — How To: Bulgarian Split Squat | verified | Kept; exact rear-foot-elevated variation. |
| Sliding Hamstring Curl | Existing library + direct verification | `UaecXxAgsKA` | Theory of Motion Exercise Library — Sliding Hamstring Curl | verified | Kept; exact sliding curl. |
| Dead Bug | Web research + direct verification | `8NBNM8haZx0` | ChoosePT — Physical Therapy: Dead Bug Exercise | verified | Added; physical therapist demonstrates the alternating dead bug. |
| Side Plank | Existing library + direct verification | `eRygfYEe1hs` | E3 Rehab Exercise Library — Side Plank | verified | Kept; exact side plank. |

## Implementation notes

- Verified videos use structured `ExerciseVideo` metadata in `src/data/exerciseVideos.ts`; UI components do not construct URLs from unlabelled IDs.
- Embeds use `youtube-nocookie.com`, omit autoplay, load only when the relevant workout/player or exercise modal is rendered, and expose the video title and channel/source.
- Missing videos render a compact notice and the full written setup, execution, mistakes, breathing, safety, alternatives, and anatomical map. No large empty player is reserved.
- A passing endpoint check cannot guarantee that a third-party publisher will never later remove or region-block a video. `lastReviewed` is therefore stored for every entry.
