# Features & Changelog

Update this file whenever a feature is added, changed, or removed. Keep entries newest-first.

---

## Current feature set (v0.1 — initial build)

### Authentication
- Google OAuth 2.0 login and signup (separate flows, mode tracked via session)
- JWT auth via httpOnly cookies (accessToken 15m + refreshToken 7d rotation)
- Logout clears both cookies and nulls refreshToken in DB
- Token refresh transparent to the user (axios interceptor)

### User profiles
- Username: alphanumeric, 12–30 chars, case-insensitive, unique
- 30-day cooldown on username changes
- Public profile page (`/u/:username`) with public trips and follower stats
- User search by username prefix (`/search`)

### Trips
- Create trip: name + destination (Google Places autocomplete), optional dates and cover photo
- Trip status auto-computed: `upcoming` / `ongoing` / `past` based on dates
- Itinerary builder: drag-and-drop items (destination, heading, activity types)
- Trip notes (rich text field)
- Privacy toggle: public trips visible to anyone by URL

### Collaboration
- Invite members by email (editor or viewer role)
- Invitation email sent with 7-day expiry
- Accept / decline invite via token link (`/invite/:token`)
- Viewer role: read only; Editor role: can edit itinerary and trip metadata; Owner: full control

### Social
- Follow / unfollow users
- Follower / following counts (denormalized, atomically updated)
- Cursor-paginated followers and following lists

### Explore
- Nearby place search: stays, activities, eats, sights
- Powered by Google Places API (New) — proxied server-side
- Place detail sheet: photos, hours, rating, reviews, amenities, distance

### Transport
- Flight lookup by IATA code + date (AviationStack)
- Indian train lookup by number or name (RapidAPI → erail.in fallback)
- PNR status (RapidAPI)
- Airport / station geocoding proxy (Nominatim, no CORS issues)

---

## Changelog

### 2026-08-29 — 🚀 Went live (first production deploy)
- **Frontend** deployed to **Cloudflare Workers** (static assets) → https://wohoo-main.akash-bansal-48b.workers.dev
  (via `client/wrangler.jsonc`, SPA handling; removed `_redirects` which conflicts with Workers assets).
- **Backend** deployed to **Fly.io** (`sin` region): prod `wohoo-api` (API + worker), beta `wohoo-api-beta` (API only).
- Data: MongoDB Atlas (prod `wohoo-prod`, beta `cluster0`) + Upstash Redis (prod).
- Fixed real deploy-only bugs: Fly region `bom`→`sin`, `connect-redis` default import, `MONGO_URL`/`MONGODB_URI`
  mismatch, alphanumeric Mongo password, Cloudflare `_redirects` conflict.
- Full runbook (redeploy/env commands, gotchas, TODO) in `docs/DEPLOYMENT.md`.

### 2026-08-29 — CI/CD pipeline + deployment config
- **Monorepo, beta→prod flow**: CI (`ci.yml`) runs on `beta` + `main`; `deploy-backend.yml`
  re-tests then `flyctl deploy`s to the branch's Fly app (staging `wohoo-api-beta` / prod `wohoo-api`),
  gated by GitHub Environments (prod requires approval).
- **Backend on Fly.io**: `Dockerfile` + `.dockerignore` + `fly.toml` with two process groups
  (`app` = API, `worker` = BullMQ); web scales to zero (pay-as-you-go), health check on `/health`.
- **Frontend on Cloudflare Pages**: `client/public/_redirects` for SPA routing; Git-integration builds.
- **Docs**: `README.md`, `docs/DEPLOYMENT.md` (full pipeline + account setup + env-var placement),
  `backend/.env.example`, `client/.env.example`.

### 2026-08-29 — Explore graceful degradation (Google Places 403)
- Explore search/details now return **HTTP 200 with `{ success:false, message }`** on upstream
  Google failures instead of 502 — the SPA renders a clean, actionable message and the browser
  console no longer fills with red 5xx errors.
- Added `upstreamMessage()` that detects **403 (key lacks permission)** and **429 (rate limit)**
  and returns specific guidance. Real Google error is still logged server-side.
- Root cause of the reported errors was a Google Cloud key config issue (Places API New / billing /
  key restrictions), not app code — documented the fix in the console-error resolution.

### 2026-08-29 — Profile / follow / search scalability
- **Search**: `searchUsers` now uses an anchored lowercase non-`i` prefix regex → served by the
  username **index range scan** instead of a collection scan (the case-insensitive `i` flag was
  forcing a full scan). `.lean()`, capped results.
- **Follower/following pagination**: switched to **`_id`-based cursor** (unique + monotonic) to
  eliminate the duplicate/skip risk of a `createdAt` cursor; page size capped at 50; `.lean()`.
  Added compound indexes `{following, _id}` and `{follower, _id}`.
- **Profile caching**: `getUserProfile` caches the viewer-independent profile+trips in Redis (30s);
  `isFollowing` computed fresh per viewer. All reads `.lean()` + read replica.
- **Self-healing counters**: `services/followCounts.js` reconciles denormalized follow counts from
  the Follow collection; scheduled weekly BullMQ job (`JOB_SYNC_FOLLOW_COUNTS`).
- **DB decision documented**: stay on MongoDB; augment with Atlas Search for fuzzy search when
  needed; shard when a replica set saturates. See `docs/CODEBASE.md`.
- **Tests**: `profileScale.test.js` (9) — case-insensitive prefix search, anchored matching,
  self-exclusion, `_id` cursor paging, page-size cap, counter reconciliation (drift + zeroing),
  profile response. Backend now **88 tests**, all green.

### 2026-08-29 — Full mobile responsiveness
Every page reworked for mobile with purpose-built vertical layouts (not just shrunk desktop),
preserving all features across all viewport widths:
- **Dashboard**: nav condenses on mobile (decorative center tabs + profile name/handle hidden,
  avatar/search/logout kept), responsive padding, "Create a trip" → "Create" on small screens.
- **TripDetail**: desktop split (420px panel + map) becomes a single column on mobile with a
  floating **List/Map toggle** on the Plan tab; Notes/Files show full-width; map overlay panels
  clamped to viewport width; filter pills wrap; uses `100dvh` for mobile browser chrome.
- **ExploreTab**: 3-column (category rail + list + map) → mobile stacks with a horizontally
  scrollable category bar on top, full-width results, and a **List/Map toggle**.
- **CreateTrip**: responsive padding + heading sizes; Wohoo.in wordmark logo; preview hidden on mobile.
- **UserProfile**: header stacks (avatar/name over actions) on mobile; responsive padding; wordmark logo.
- **SearchUsers**: responsive nav padding; wordmark logo.
- **PlanTab** modals were already mobile bottom-sheets (`items-end`, `rounded-t-3xl`) — verified.
- Logos across nav bars unified to the Wohoo.in wordmark.
- Note: `pages/trip/{ItemModal,PlaceSearchDrawer,TransportSearch,FormFields,ItemCard}.jsx`,
  `constants.js`, `hooks.js` are unused legacy files (real implementations live inline in PlanTab).
- Frontend tests (16) + production build verified green.

### 2026-08-29 — Auth pages redesigned to match homepage hero
- **`components/AuthHero.jsx`** — new shared auth screen mirroring the `/` hero: split beach
  image + cream layout, Cormorant/Jost type, pink-gradient accents, Wohoo.in logo.
- In place of the hero headline, a **Log In / Sign Up tab** toggles the Google OAuth mode
  (`mode=login|signup`); headline/subtitle/CTA copy switch per tab.
- `Login.jsx` and `Signup.jsx` now both render `AuthHero` (initialTab `login` / `signup`),
  keeping the two routes but sharing one consistent UI. Replaced the old dark violet card design.
- Responsive: image right-half on desktop (fades into cream), full-bleed darkened on mobile.
- **Tests**: `AuthHero.test.jsx` (5) — both tabs, default tab per route, tab switching updates
  the Google mode, signup helper note, brand logo. Frontend now **15 tests**, all green.

### 2026-08-29 — Branding: site-wide fonts + dashboard logo
- **Fonts everywhere**: adopted the homepage type system across the whole app — **Jost** for
  body/UI (Tailwind `font-sans`, default) and **Cormorant Garamond** for headings/logo
  (`font-serif`). Loaded via `index.html` (preconnect + Google Fonts) and wired into Tailwind's
  `@theme` in `index.css`. Page title set to "Wohoo.in".
- **Dashboard navbar logo**: replaced the rose square icon with the "Wohoo.in" wordmark matching
  the homepage (pink-gradient "Wohoo" + dark ".in", serif), linking to the dashboard.
- **Tests**: `Dashboard.test.jsx` (3) — logo text, accessible home button, serif font. Frontend
  now **10 tests**, all green. Production build verified.

### 2026-08-29 — Step 5: MongoDB read-replica routing
- **`config/readPreference.js`** — `analyticsReadPreference()` returns `secondaryPreferred` when
  `USE_READ_REPLICA=true`, else `primary`. Opt-in, safe by default.
- **Routed to secondary** (when enabled): dashboard (`getMyTrips`), user search, public profiles
  and their public trips, follower/following lists — all tolerate slight replication lag.
- **Kept on primary**: `getTrip`, auth, follow-status, invitations, all writes — read-after-write safe.
- **Tests**: `readPreference.test.js` (5) — helper behavior + reads still succeed with the flag on
  (secondaryPreferred falls back to primary on the single-node test replica set). Backend now **79 tests**.

### 2026-08-29 — Step 4: Trip status sync as a scheduled job
- **Removed write-on-read**: `getMyTrips` and public profile no longer persist status on every
  read. They now use `Trip.applyComputedStatus()` — corrects status in memory for display, zero writes.
- **Scheduled job**: `Trip.syncAllStatuses()` (three bulk `updateMany` queries) runs as a BullMQ
  repeatable job every 15 min via `queues/maintenanceQueue.js`.
- **Worker runner** (`workers/index.js`): single process hosting both email + maintenance workers;
  connects DB, schedules repeatable jobs, graceful shutdown. `npm run worker` now points here.
  Refactored `emailWorker.js` to `startEmailWorker()`; added `maintenanceWorker.js` and
  shared `queues/connection.js`.
- **Index added**: `{ status, startDate, endDate }` to support the sync queries.
- **Tests**: added `tripStatus.test.js` (5) — bulk correction, no-date safety, read-path computes
  without writing, job routing. Backend now **74 tests**, all green.

### 2026-08-29 — Step 3: BullMQ async email
- **Email queue** (`queues/emailQueue.js`) — producer + `dispatchEmail()`; jobs `JOB_INVITE`
  and `JOB_USERNAME`. Uses ioredis (BullMQ requirement).
- **Worker** (`workers/emailWorker.js`) — standalone process (`npm run worker`) that sends
  emails off the request path, with 3 retries + exponential backoff, concurrency 5, graceful shutdown.
- **Controllers** (`inviteMember`, `setUsername`) now enqueue instead of awaiting the send —
  invite responses no longer block on the email provider.
- **Fallback**: no `REDIS_URL` → sends inline (feature still works for dev/single-instance).
- **Deps**: `bullmq`, `ioredis`; `.npmrc` with `legacy-peer-deps=true` for BullMQ's optional redis peer.
- **Tests**: added `emailQueue.test.js` (5). Backend now **69 tests**, all green. Existing
  invite tests still pass via the inline fallback.

### 2026-08-29 — Step 2: Redis (sessions + Google Places caching)
- **Redis client** (`config/redis.js`) — shared client from `REDIS_URL`, connected at startup.
- **Cache abstraction** (`utils/cache.js`) — `cacheGet/Set/Del`; Redis when available, else an
  in-process Map with TTL. Callers are backend-agnostic.
- **Sessions** now use a Redis store (`connect-redis`) when available, else `MemoryStore`.
- **Google Places caching**: `/explore/search` (1h) and `/explore/details` (6h) cached —
  big cut in latency and billed API calls. Cached responses flagged `cached: true`.
- **Graceful degradation**: no `REDIS_URL` → in-memory fallbacks, app still runs (single instance).
  `REDIS_URL` is required in production (multi-instance) for shared cache/sessions.
- **Startup** (`server.js`) now connects Redis → DB → listen, with fail-fast on error.
- **Tests**: added `cache.test.js` (4) and `explore.test.js` (5, incl. cache hit/miss behavior).
  Backend now **64 tests**, all green.

### 2026-08-29 — Login bug fix (legacy account validation)
- **Fixed**: Google login (`googleCallback`) failed with a `ValidationError` for accounts
  whose username predates the current 12-char rule. Root cause: `user.save()` re-validates
  the entire document, so an unrelated write (storing the refresh token) rejected the old
  username. Switched `googleCallback`, `refreshAccessToken`, and `passport.js` googleId-linking
  to atomic `findByIdAndUpdate` (single-field writes, no full-document re-validation).
- **Test**: added regression test — a legacy sub-12-char username can still refresh (55 tests total).

### 2026-08-29 — Security hardening
- **helmet** applied globally (security headers)
- **Rate limiting** wired up: `globalLimiter` on all `/api`, `authLimiter` on `/api/auth`
- **NoSQL injection protection**: `sanitizeRequest` middleware strips `$`/`.` keys from all input
- **Regex injection fix**: `searchUsers` now escapes user input via `escapeRegex()`
- **Refresh tokens hashed** (SHA-256) before DB storage — no more plaintext tokens
- **Cookies**: `secure` now driven by prod env; session cookie `httpOnly` + `sameSite: lax`
- **Fail-fast env validation** at startup (`config/env.js`) — missing/weak secrets crash prod boot
- **`trust proxy`** set so secure cookies + rate-limit IPs work behind Nginx
- **Tests**: added `security.test.js` (10 cases) — backend now 54 tests, all green
- **Standards**: added binding HLD/LLD/schema/data-flow/security/testing standards to `CLAUDE.md`
- **Docs fix**: corrected user profile route to `GET /profile/:username`

### 2026-08-29 — Infrastructure & Testing foundation
- **Architecture**: Separated `app.js` (Express config) from `server.js` (DB connect + HTTP listen) to make the app testable without a real DB
- **Fix**: CORS `origin` now reads from `CLIENT_URL` env var (was hardcoded to `localhost:5173`)
- **Fix**: Vite proxy corrected from port 5000 → 8000
- **Testing**: Added Vitest + Supertest test suite for backend (auth, trips, follow, models)
- **Testing**: Added Vitest + React Testing Library test suite for frontend components
- **CI/CD**: GitHub Actions workflow added — runs backend tests, frontend lint + tests + build on every push/PR
- **Docs**: Added `CLAUDE.md`, `docs/CODEBASE.md`, `docs/FEATURES.md`
