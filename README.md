# Project 73

**AI-voedingscoach en automatische Picnic-boodschappen.** Vertel de app je doel; hij rekent je dagdoelen uit, maakt een praktisch maaltijdplan, zoekt de producten bij Picnic en zet je mandje klaar. Jij controleert en keurt goed.

Project 73 is the upgrade of the existing *Project 75* app in this repository. The goal moved from 75 kg to 73 kg (75 kg is kept as a milestone), the interface is Dutch, and meal planning, grocery optimisation and a Picnic integration were added. All existing data and features (workout logger, adaptive training planner, FitDays import, progress photos, backups) are preserved.

## What it does

| Page | Purpose |
| --- | --- |
| **Dashboard** | Current (trend) weight, kg lost, remaining, progress %, expected goal date, today's meals with one-tap **Gegeten**, planned vs eaten intake, grocery status, training of the day. Buttons **Plan mijn maaltijden** and **Bereid boodschappen voor**. |
| **Mijn voedingsplan** | 3- or 7-day plans: breakfast, lunch, dinner and 0–2 snacks per day around the calorie and protein target. Replace, lock, regenerate a day, adjust portions, favourites, reuse earlier meals, leftovers, ingredients in grams, simple steps, availability per ingredient. The existing food log is under *Logboek*. |
| **Boodschappen** | Consolidated list (pantry subtracted) → real product search → package-aware choice (450 g need → one 500 g pack) → alternatives and swap suggestions that use up surplus or save money → cart diff preview → idempotent cart sync → delivery slot → order approval or official Picnic handoff. |
| **Mijn voortgang** | Weigh-ins, smoothed trend, planned trajectory, weekly averages, calendar, adherence, Dutch coaching that only proposes calorie changes with enough reliable data. Existing body composition, training and weekly check-in screens are tabs. |
| **Instellingen** | Profile and targets (Mifflin-St Jeor, overrides, plain-Dutch explanation), food preferences, allergens, dislikes, budget, pantry, Picnic connection with SMS 2FA, AI status, training & backups, delete all data. |
| **Assistent** | Type or speak (Dutch) requests such as “Vervang zalm door kip” or “Ik heb nog rijst en eieren thuis”. Every change is shown as a proposal first; the assistant can never order or pay. |

## Architecture

- **Client:** React 19 + TypeScript + Vite, Recharts, lucide-react, existing CSS design system extended with `src/project73.css` (light/dark/system theme).
- **Server:** one Cloudflare Worker (`worker/`) on OpenAI Sites. Picnic, shopping plans, cart operations, checkout and the assistant run here only.
- **Storage:** Cloudflare D1. Account data stays in the existing `project75_user_data` payload (now schema v13 with meal plans, pantry, targets, preferences). Server-authoritative Picnic data lives in new tables (`drizzle/0002_project73_shopping.sql`): integrations (encrypted auth key), shopping plans, cart sync operations (idempotency keys), order attempts, product cache. R2 stores progress photos.
- **Validation:** Zod on every new endpoint and for AI output.
- **Deterministic engines** (`src/lib/project73/`): metabolism, weight trend, progress coach, recipe maths, meal planner, units/package parser, grocery matching, optimizer, cart diff. AI never produces numbers.

The original brief suggested Next.js, Prisma, PostgreSQL, Tailwind and shadcn/ui. Because a deployed React/Vite/Worker/D1 app with real user data already existed, the stack was kept and extended instead of migrated; see [`docs/project-73-architecture.md`](docs/project-73-architecture.md).

## Run locally

```bash
pnpm install
pnpm dev            # http://127.0.0.1:5173
```

`pnpm dev` adds local, file-backed D1 and R2 bindings (only in dev) and identifies you as `local-development`. Without `PICNIC_TOKEN_ENCRYPTION_KEY` the Worker runs in **demo mode**: a clearly labelled demo catalogue with demo prices, a demo cart and demo delivery slots. Demo data is always marked **DEMO** and demo mode can never place an order.

To use your real Picnic account locally, copy `.env.example` to `.dev.vars`, set `PICNIC_MODE=live` and a `PICNIC_TOKEN_ENCRYPTION_KEY` (`openssl rand -base64 32`), restart `pnpm dev`, and connect in *Instellingen → Picnic*.

## Quality checks

```bash
pnpm build          # type-checks client, Worker and shared code, then builds
pnpm lint
pnpm test           # Vitest: 31 files, unit + Worker integration tests (mocked Picnic, SQLite-backed D1)
pnpm test:e2e       # Playwright primary journey on desktop + iPhone (demo adapter); see below
```

Unit tests cover metabolic and macro calculations, portion scaling, unit conversion, package parsing and rounding, consolidation, pantry, product matching, cart idempotency and diffing, weight-trend smoothing and rate, the progress coach, the meal planner and the Project 75 → 73 data migration. Worker integration tests run the real routes and SQL against Node's SQLite with a scripted Picnic double: encrypted login + 2FA, matching with allergen checks, idempotent sync that never removes unrelated items, flag-gated checkout with price re-check and single confirmation, expired-key handling and disconnect.

`pnpm test:e2e` starts `pnpm dev` if it is not already running. In environments where Playwright browsers live elsewhere, set `PLAYWRIGHT_BROWSERS_PATH`. Automated tests never contact Picnic and never place orders.

## Configuration

All secrets are server-side (`.env.example` lists them). Nothing secret is ever sent to the browser.

### Picnic

| Variable | Meaning |
| --- | --- |
| `PICNIC_MODE` | `mock` (demo catalogue) or `live`. Defaults to `live` when an encryption key is set, otherwise `mock`. |
| `PICNIC_TOKEN_ENCRYPTION_KEY` | 32-byte base64 key; encrypts each user's Picnic auth key with AES-GCM, bound to the user id. |
| `PICNIC_COUNTRY_CODE` | `NL` (default), `DE` or `FR`. |
| `PICNIC_CHECKOUT_ENABLED` | `false` by default. When `true`, users can enable direct ordering in settings. |

How the connection works: the user enters their Picnic e-mail and password once; the Worker calls `auth.login` (picnic-api 5.3.0), handles SMS 2FA (`generate2FACode` / `verify2FACode`), stores **only** the encrypted auth key and a per-user device id, and discards the password. Disconnecting calls `auth.logout` and deletes the key. Expired keys are detected (HTTP 401/403) and the user is asked to log in again.

Checkout follows picnic-web's flow: `startCheckout({ mts })` → `initiatePayment(orderId, returnUrl)` → bank page → `getCheckoutStatus` polled until `FINISHED` → `confirmOrder`. The app re-reads the cart and stops when Picnic's total differs from the total the user approved, allows one active attempt per user, stores an idempotency key per attempt and confirms exactly once. Success is only shown after Picnic confirms the order. Without direct checkout the app offers a clearly labelled handoff: the cart is ready in Picnic, and the user completes the order in the Picnic app.

### AI assistant

Optional. `AI_PROVIDER=openai` (default, uses `OPENAI_API_KEY`) or `anthropic` (uses `ANTHROPIC_API_KEY`); `AI_MODEL` overrides the model. The model only maps a request to one of nine validated intents plus a short Dutch reply (strict JSON schema / forced tool call, validated with Zod). Invalid or missing output falls back to deterministic Dutch rules, which also run when no key is configured. The assistant cannot place orders or pay, and its proposals are only applied after the user taps them.

## Deployment (OpenAI Sites / Cloudflare)

1. `pnpm build` — produces `dist/` including `dist/.openai/hosting.json` and the D1 migrations in `dist/.openai/drizzle/` (0000–0002).
2. Set the Worker secrets: `PICNIC_TOKEN_ENCRYPTION_KEY`, optionally `OPENAI_API_KEY`/`ANTHROPIC_API_KEY`, `FITDAYS_SESSION_SECRET`, `USDA_API_KEY`; variables `PICNIC_MODE=live`, `PICNIC_CHECKOUT_ENABLED=false`.
3. Publish through Codex/Sites as before. All schema statements are `CREATE … IF NOT EXISTS`, and the Worker also ensures them at runtime, so a new deployment initialises safely.
4. Existing accounts are upgraded on first load (v12 → v13): goal 75 → 73 kg, age 29 → 30, untouched default targets recalculated, edited targets kept as overrides with a suggestion card. No history is changed.

## Features that need real credentials or manual verification

These cannot be verified by automated tests (which use the demo adapter and a scripted Picnic double):

- Picnic login, SMS 2FA and key renewal against the real Picnic service.
- Real product search results, prices, package texts, nutrition labels and allergen data. Matching rules (`src/data/project73/ingredients.ts`) may need tuning when Picnic's assortment changes.
- Real cart add/remove and verification, delivery slots and slot selection.
- **Direct checkout and payment**: implemented against picnic-api's documented methods and picnic-web's flow, but never executed in automated tests. Test manually with a small order before enabling `PICNIC_CHECKOUT_ENABLED`.
- The AI provider integration with a real API key.
- Speech input (browser support varies; Safari on iOS uses `webkitSpeechRecognition`).

Follow [`docs/manual-live-picnic-test.md`](docs/manual-live-picnic-test.md) for a step-by-step manual live test.

## Known limitations

- picnic-api is **unofficial**. Picnic can change its app at any time; the app then reports a clear error (`UnexpectedPageFormatError` and others are mapped to Dutch messages) instead of guessing.
- Nutrition values of recipes use rounded reference values (Dutch NEVO / label averages, marked "deels geschat") until a matched Picnic product supplies a complete label, which then replaces the estimate everywhere.
- The recipe library is curated (29 simple recipes, 41 ingredients). The planner is deterministic and seeded; the AI does not invent recipes.
- Some legacy screens (training, FitDays, body composition) keep their original dark styling in light mode in places.
- Search is rate-limited and cached per user for 6 hours (product labels 24 hours).

## Visual asset

The hero photograph in `public/assets/fuel-hero.png` was generated specifically for this project and contains no third-party branding or text.
