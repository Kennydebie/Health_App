# Project 75

Personal food, fitness, and progress coaching built around one clear outcome: reaching 75 kg while preserving strength and building sustainable habits.

## Production architecture

- React + TypeScript client, Cloudflare Worker API, and OpenAI Sites hosting.
- Account-owned D1 persistence behind `GET /api/data` and revision-checked `PUT /api/data`.
- ChatGPT identity is taken from the trusted Sites authentication header; the client never chooses a user ID.
- One repository module owns browser and server persistence. The legacy `cut-forward-data-v1` key remains as an offline device copy so existing data survives upgrades.
- First-run migration previews profile and record counts, removes known demonstration records, merges stable IDs, keeps a recoverable browser copy, and only marks migration complete after the server confirms it.
- Versioned full-account JSON export/import with validation, duplicate preview, conflict reporting, and merge-only confirmation.
- Central selectors provide nutrition totals, current/starting weight, weekly training, transparent daily goals, consistency, streaks, and personal records.
- FitDays screenshot analysis is authenticated and rate-limited. Images are sent directly for analysis with API storage disabled and are not written to D1.

The public shell remains browseable without an account. Anonymous edits stay on that device; the UI clearly asks the user to sign in before synchronization or FitDays analysis.

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

Tests cover data migration, account repository behavior, idempotent conflict-safe merges, backup validation, body-measurement propagation, central selectors, nutrition, workouts, and FitDays sanitation.

## Deployment and configuration

The Sites project ID and D1 binding are declared in `.openai/hosting.json`; the D1 migration lives in `.openai/drizzle/`. No client-side environment variable is required for persistence.

Server secrets:

- `OPENAI_API_KEY` — required for FitDays screenshot analysis.
- `FITDAYS_SESSION_SECRET` — required for short-lived, account-bound analysis sessions.
- `OPENAI_VISION_MODEL` — optional model override.

Build with `pnpm build`, then publish the generated Sites project through Codex/Sites. D1 schema creation is idempotent, so a new deployment can initialize the table safely.

## Visual asset

The hero photograph in `public/assets/fuel-hero.png` was generated specifically for this project and contains no third-party branding or text.
