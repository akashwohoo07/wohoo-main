# Wohoo – Agent Guide

## What this project is
Collaborative travel planning platform. Users create trips, build itineraries, invite collaborators (owner/editor/viewer roles) by email OR username, follow each other, and explore places via Google Places. Transport lookups (flights, Indian trains, PNR) are proxied server-side.

Collaboration modules (added 2026-09-02, all membership-gated + tested): **expenses/splits**
(Splitwise-style, integer paise), **in-app notifications** (bell), **communities + group chat**
(public/private, reactions, @mentions, trip-share, search, admin delete), **per-trip chat**
(place-share from Explore, replies, reactions), and **trip notes feed + checklists**. See
`docs/CODEBASE.md` → "Collaboration modules" and `docs/FEATURES.md`.

Tech: React + Vite (web), Express 5 + MongoDB + JWT (backend). React Native mobile app planned next.

## Before any change
```
cd backend && npm test          # must be green
cd client && npm test           # must be green
```
Make the change, run tests again. If adding or changing a feature, update `docs/FEATURES.md`.

## Repository layout
```
/
├── backend/
│   ├── src/
│   │   ├── app.js              ← Express app (no DB connect, no listen)
│   │   ├── server.js           ← Entry point: connects DB then starts server
│   │   ├── controllers/        ← Business logic
│   │   ├── routes/             ← Route definitions
│   │   ├── models/             ← Mongoose schemas
│   │   ├── middleware/         ← auth.js, rateLimiter.js, errorHandler.js
│   │   ├── config/             ← db.js, passport.js
│   │   ├── utils/              ← email.js
│   │   └── __tests__/         ← Vitest test suites
│   └── vitest.config.js
├── client/
│   ├── src/
│   │   ├── pages/
│   │   ├── components/
│   │   ├── context/            ← AuthContext.jsx
│   │   ├── api/                ← axios.js instance
│   │   └── __tests__/         ← Vitest + RTL tests
│   └── vite.config.js          ← also contains vitest test config
├── docs/
│   ├── CODEBASE.md             ← technical reference
│   └── FEATURES.md             ← feature changelog (update on every change)
└── .github/workflows/ci.yml    ← GitHub Actions CI
```

## Engineering standards (apply to EVERY change, no exceptions)

These are binding. When you implement any future request, follow all of them and
call out in your summary how each relevant one was satisfied.

### HLD (high-level design) — before writing code
1. **Stay a modular monolith.** Do not add a new service/process unless a specific,
   measured bottleneck justifies it. New capabilities become a *module* (controller +
   route + model + tests), not a microservice.
2. **Stateless app tier.** Never store per-user state in process memory (no in-memory
   caches, sessions, or counters that must survive across requests). Shared state goes
   to MongoDB or Redis so the app can scale horizontally.
3. **Async for anything slow or external.** Email, push, third-party calls that aren't
   on the critical read path belong in a job queue (BullMQ, planned), never awaited in
   the request handler.
4. **Cache reads that are expensive or billed.** Any external paid API (Google Places,
   AviationStack, RapidAPI) must be cacheable behind Redis with a TTL.

### LLD (low-level design) — how each module is built
1. **Layering:** `routes → middleware (auth, validation) → controller → model`.
   Controllers hold business logic; routes only wire. No DB queries in routes.
2. **Every controller is `async (req, res, next)` and wraps work in try/catch → `next(err)`.**
   The central `errorHandler` is the only place that formats error responses.
3. **Response shape is consistent:** `{ success: boolean, ...data }` or
   `{ success: false, message }`. Never return raw errors or Mongoose docs with secrets.
4. **Authorization is explicit and checked in the controller**, not assumed from the route.
   Re-verify membership/role/ownership on every mutating trip operation.
5. **New Mongoose models use the `mongoose.models.X || mongoose.model(...)` guard** (test-safe).
6. **Every new endpoint ships with tests in the same PR** (see Testing standards).

### Table / schema design
1. **Index every field you filter, sort, or join on.** Add the index in the schema
   alongside the field. Compound indexes must match the query's field order.
2. **Denormalize counts, not truth.** Counters (followersCount) are denormalized for O(1)
   reads and updated atomically inside a transaction with the source-of-truth write.
3. **Enforce invariants at the DB layer**, not just in code: `unique`, `required`, `enum`,
   `min`/`max`, and partial unique indexes (see Invitation's pending-invite index).
4. **All list queries are paginated** with cursor pagination: `?cursor=<iso-date>&limit=<n>`,
   fetch `limit + 1` to compute `hasMore`. Never return an unbounded array.
5. **Multi-document writes that must be consistent use a Mongoose transaction/session**
   (see followController). Tests run against a replica set so transactions are exercised.
6. **Timestamps on everything** (`{ timestamps: true }`). Store absolute dates, never
   relative. Convert relative dates to absolute before persisting.

### Data flow: upstream → downstream
```
Client → Nginx → Express middleware chain → controller → model → MongoDB
                     │                                        │
             (helmet, cors, sanitize,                   (Redis cache,
              rate-limit, auth)                          planned)
```
1. **Validate and sanitize at the edge (upstream) before data reaches business logic.**
   `sanitizeRequest` strips NoSQL operators; add per-endpoint validation for shape/type.
2. **Never trust client input downstream.** Whitelist updatable fields (see `updateTrip`'s
   `allowed` array) — never spread `req.body` into a model.
3. **Data flows one way per request.** Read replica for reads (planned), primary for writes.
   Don't write inside a read handler (the `syncStatuses`-on-read anti-pattern is being removed).
4. **External data is normalized at the boundary** (see `normalizePlace`) so downstream
   code and clients never see raw third-party shapes.

### Security (protect the user — non-negotiable)
1. **Secrets:** never hardcode; validated at startup by `config/env.js` (fail-fast in prod).
   Secrets ≥ 32 chars. Never log or return them.
2. **Security headers via `helmet()`** — already global. Don't remove.
3. **Rate limiting:** `globalLimiter` on all `/api`, stricter `authLimiter` on `/api/auth`.
   Add tighter limits to any new sensitive/expensive endpoint.
4. **NoSQL injection:** `sanitizeRequest` is global. Any dynamic regex from user input MUST
   be run through `escapeRegex()` (see `searchUsers`).
5. **Tokens:** access token 15m, refresh 7d, both httpOnly cookies. Refresh tokens are
   stored **hashed** (`utils/tokens.js`) — never plaintext. Rotate refresh on every use.
6. **Cookies:** `httpOnly`, `sameSite: lax`, `secure` in production (driven by `config.isProd`).
7. **AuthZ over AuthN:** authenticated ≠ authorized. Check the specific permission every time.
8. **Least data exposure:** `.select("-refreshToken")` / explicit field lists on user reads.
   Never send password hashes, tokens, or internal flags to the client.
9. **Fail closed:** on any auth/validation uncertainty, deny (401/403), don't allow.

### Key invariants (quick reference)
- Emails are async — never await email in a request handler; wrap in try/catch.
- All list endpoints support cursor pagination.
- External API calls have timeouts (`AbortSignal.timeout`) and graceful fallbacks.
- Viewer role cannot mutate — check `member.role !== "viewer"` before trip writes.
- Tests must pass before merging. CI is enforced on PRs. Never skip.

## Auth flow
1. Google OAuth → sets httpOnly cookies (accessToken 15m, refreshToken 7d)
2. All protected routes read `accessToken` cookie OR `Authorization: Bearer` header
3. `/api/auth/refresh` rotates both tokens
4. `protect` middleware attaches `req.user` (User document, no refreshToken field)

## Running locally
```bash
# backend API
cd backend && npm run dev       # port 8000

# email worker (only needed if REDIS_URL is set; otherwise emails send inline)
cd backend && npm run worker:dev

# frontend
cd client && npm run dev        # port 5173
```

## Testing
```bash
# backend (Vitest + Supertest + mongodb-memory-server replica set)
cd backend && npm test
cd backend && npm run test:coverage

# frontend (Vitest + React Testing Library + jsdom)
cd client && npm test
cd client && npm run test:coverage
```

### Testing standards
1. **Every new endpoint/feature ships with tests in the same change.** No exceptions.
2. **Cover the matrix:** happy path, validation failure (400), auth failure (401),
   authorization failure (403), not-found (404), and conflict (409) where applicable.
3. **Backend tests hit the real Express app** via Supertest against an in-memory Mongo
   replica set — they exercise middleware, auth, and transactions, not mocks of them.
   Only mock true externals (email, third-party HTTP).
4. **Security behavior is tested** (see `security.test.js`): sanitization, regex escaping,
   headers, token hashing. Add cases here when you touch auth or input handling.
5. **DB is wiped between tests** (`afterEach` in `setup.js`) — tests must be independent
   and order-agnostic. Never rely on data from another test.
6. **Frontend:** test behavior a user observes (rendered text, interactions, API calls),
   not implementation details. Mock the axios instance, not fetch internals.

## Environment variables (backend)
```
PORT=8000
MONGODB_URI=<mongo atlas uri>
REDIS_URL=<redis connection url — optional in dev, REQUIRED in prod/multi-instance>
USE_READ_REPLICA=<"true" to route browse/display reads to a secondary; default primary>
JWT_SECRET=<32+ char secret>
JWT_REFRESH_SECRET=<32+ char secret>
SESSION_SECRET=<random string>
GOOGLE_CLIENT_ID=<from google console>
GOOGLE_CLIENT_SECRET=<from google console>
CLIENT_URL=http://localhost:5173
GOOGLE_PLACES_KEY=<google places api key>
AVIATIONSTACK_KEY=<aviationstack key>
RAPIDAPI_KEY=<rapidapi key>
EMAIL_HOST=smtp.resend.com
EMAIL_PORT=465
EMAIL_SECURE=true
EMAIL_USER=resend
EMAIL_PASS=<resend api key>
APP_NAME=Wohoo
FROM_EMAIL=noreply@yourdomain.com
```

## Scalability roadmap (in order)
1. ~~**Redis sessions + caching**~~ ✅ DONE (2026-08-29) — `config/redis.js` + `utils/cache.js`;
   session store + Google Places caching. Graceful in-memory fallback when `REDIS_URL` unset.
2. ~~**BullMQ async email**~~ ✅ DONE (2026-08-29) — `queues/emailQueue.js` producer +
   `workers/`. Enqueues when `REDIS_URL` set, else sends inline. Run the worker with `npm run worker`.
3. ~~**Trip status sync as cron**~~ ✅ DONE (2026-08-29) — removed write-on-read; `Trip.syncAllStatuses()`
   runs as a BullMQ repeatable job (every 15m) via `queues/maintenanceQueue.js`. Reads compute
   status in memory with `Trip.applyComputedStatus()` (no writes).
4. ~~**Read replica**~~ ✅ DONE (2026-08-29) — `config/readPreference.js`; browse/display reads
   (dashboard, search, profiles, follower lists) use `secondaryPreferred` when `USE_READ_REPLICA=true`.
   Opt-in, defaults to primary; read-after-write-sensitive reads stay on primary.
5. **FCM push notifications** — for mobile app (next)
6. **Horizontal scaling** — PM2 cluster or Docker + Nginx

### Data-flow rule for read routing
When adding a read query, decide its consistency need: if it's a browse/display read that
tolerates seconds of staleness, add `.read(analyticsReadPreference())`. If it may be read
immediately after a write (a just-created resource, auth, anything in a write flow), leave it
on the primary (the default).

> Redis: the cache/session layer uses **node-redis** (`config/redis.js`); BullMQ uses its own
> **ioredis** connection (`queues/emailQueue.js`). This is intentional — BullMQ requires ioredis.
> `REDIS_URL` is a hard production requirement from step 2 on. Backend `.npmrc` sets
> `legacy-peer-deps=true` to resolve BullMQ's benign optional redis>=5 peer.

See `docs/CODEBASE.md` for full architecture details.
