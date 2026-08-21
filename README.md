# Cut Forward

A polished personal food and strength coaching app built around one outcome: lose body fat while preserving or building muscle.

## What works

- Fast food search across 50+ realistically seeded foods
- Serving-aware food logging, date navigation, and instant calorie/macro updates
- Edit, duplicate, delete, favorite, recent-food, repeat-meal, and saved-meal flows
- Editable three-day home strength program with squat regressions
- Persisted active workouts, set logging, rest timers, progressive-overload guidance, and history
- Exercise technique, breathing, safety, alternatives, and demonstration links
- Body-weight entries, seven-day averages, charts, weekly reviews, coaching, and habits
- Editable profile, nutrition targets, training days, equipment, and target recommendations
- Versioned browser-local persistence so refreshes do not reset the app

## Run locally

```bash
pnpm install
pnpm dev
```

Open `http://127.0.0.1:5173`.

## Quality checks

```bash
pnpm build
pnpm lint
pnpm test
```

The live app was also tested in-browser at desktop width and at 375 px, 390 px, and 430 px mobile widths. The required banana quantity/edit/delete flow, dated food history, Monday/Wednesday workout switching, bench-press set logging, rest timer, workout persistence, exercise details, and weight persistence were verified end to end.

## Persistence

The prototype uses versioned `localStorage` under `cut-forward-data-v1`. The data model is split into profile, food log, saved meals, weight entries, workout program, workout sessions, sets, and habits so it can be migrated to a backend later without rewriting the UI workflows.

## Visual asset

The hero photograph in `public/assets/fuel-hero.png` was generated specifically for this project and contains no third-party branding or text.
