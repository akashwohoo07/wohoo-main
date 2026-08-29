# Codebase Reference

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 19 + Vite + TailwindCSS v4 |
| State | TanStack Query v5 + React Context |
| Backend | Node.js + Express 5 |
| Database | MongoDB (Mongoose 9) |
| Auth | JWT (httpOnly cookies) + Google OAuth (Passport.js) |
| Email | Nodemailer / Resend |
| Maps / Places | Google Places API (New) |
| Transport | AviationStack (flights), RapidAPI / erail.in (trains) |
| Testing | Vitest + Supertest (backend), Vitest + RTL (frontend) |
| CI | GitHub Actions |

---

## Backend Architecture

### Entry points
- `src/server.js` — production entry: connects MongoDB, starts HTTP listener
- `src/app.js` — Express app factory: sets up all middleware and routes, exports `app`. **Does not connect DB or start server** — this makes it importable by tests.

### Request lifecycle
```
Client → Nginx (prod) → Express
  → cors → session → morgan → cookieParser → json parser
  → route match
  → protect middleware (JWT verification, attaches req.user)
  → controller
  → errorHandler
```

### Middleware
| File | Purpose |
|---|---|
| `middleware/auth.js` | `protect` — reads JWT from cookie or Bearer header, attaches req.user. `optionalAuth` — same but never blocks. |
| `middleware/rateLimiter.js` | `authLimiter` (10 req/15m in prod). `globalLimiter` (100 req/min in prod). |
| `middleware/sanitize.js` | `sanitizeRequest` — strips NoSQL operators from input. `escapeRegex` — safe regex from user input. |
| `middleware/errorHandler.js` | Catches uncaught controller errors, returns standardized JSON. |

### Caching & Redis
| File | Purpose |
|---|---|
| `config/redis.js` | Creates the shared node-redis client from `REDIS_URL` (cache + sessions). `connectRedis()` at startup. `null` when `REDIS_URL` unset. |
| `utils/cache.js` | Backend-agnostic `cacheGet/cacheSet/cacheDel`. Uses Redis when connected, else an in-process Map with TTL (single-instance only). |

### Background jobs (BullMQ)
| File | Purpose |
|---|---|
| `queues/connection.js` | Shared factory for BullMQ **ioredis** connections. |
| `queues/emailQueue.js` | Email **producer** + `dispatchEmail(jobName, payload)`. Enqueues when `REDIS_URL` set, else sends inline via `runEmailJob`. |
| `queues/maintenanceQueue.js` | Maintenance **producer** + `scheduleMaintenanceJobs()` (repeatable) + `runMaintenanceJob()`. |
| `workers/emailWorker.js` | `startEmailWorker()` — email processor (3 retries, exp backoff, concurrency 5). |
| `workers/maintenanceWorker.js` | `startMaintenanceWorker()` — runs trip status sync, etc. |
| `workers/index.js` | **Worker runner** (`npm run worker`) — connects DB, starts all workers, schedules repeatable jobs, graceful shutdown. |

**Scheduled jobs:**
- `sync-trip-status` (every 15 min) → `Trip.syncAllStatuses()` bulk-corrects stored trip
  statuses with three `updateMany` queries. Replaces the old write-on-read pattern.
- Read path uses `Trip.applyComputedStatus()` — corrects status **in memory** for display, no DB write.

- **Producer/consumer split**: API enqueues, the separate worker process sends — so a slow or
  failing email provider never blocks or fails an HTTP response.
- **Job types**: `JOB_INVITE` (trip invites), `JOB_USERNAME` (username confirmation).
- **Fallback**: without `REDIS_URL`, `dispatchEmail` sends inline (still works, but on the
  request path). Set `REDIS_URL` + run the worker in production.
- **Two Redis connections by design**: node-redis (cache/sessions) + ioredis (BullMQ). BullMQ
  requires ioredis. Backend `.npmrc` has `legacy-peer-deps=true` for BullMQ's optional redis peer.

### Read-replica routing
| File | Purpose |
|---|---|
| `config/readPreference.js` | `analyticsReadPreference()` → `secondaryPreferred` when `USE_READ_REPLICA=true`, else `primary`. |

- Applied via `.read(analyticsReadPreference())` on browse/display reads: `getMyTrips`,
  `searchUsers`, `getUserProfile` (+ its public trips), `getFollowers`, `getFollowing`.
- **Kept on primary** (read-after-write / correctness sensitive): `getTrip`, auth (`protect`),
  `getFollowStatus`, invitations, and all reads inside mutations/transactions.
- Opt-in and safe by default: unset → primary; `secondaryPreferred` falls back to primary when
  no secondary exists (dev/CI/tests), so nothing breaks on single-node setups.

- **Sessions**: stored in Redis via `connect-redis` when available, else `MemoryStore`.
- **Google Places caching**: `/explore/search` (1h TTL) and `/explore/details` (6h TTL) are
  cached by `utils/cache.js`. Cached responses include `cached: true`. Search keys round
  coordinates to 3 decimals so nearby requests share an entry.
- **Fallback**: without `REDIS_URL` the app runs fully on in-memory equivalents — correct for
  a single instance, but **`REDIS_URL` is required in production** (multi-instance) so cache
  and sessions are shared.

### Data models

#### User
```
name, email (unique+indexed), username (unique sparse, 12-30 chars, alphanumeric)
googleId (unique sparse), avatar, isVerified
refreshToken (select:false)
followersCount, followingCount  ← denormalized, updated atomically
```

#### Trip
```
name, coverPhoto, destination { name, fullLabel, placeId, coordinates, city, state, country }
startDate, endDate, notes
itinerary [{ clientId, type, title, date, endDate, isSubDest, placeId, lat, lng, region, order }]
owner → User
members [{ user → User, role: owner|editor|viewer, joinedAt }]
status: upcoming|ongoing|past  ← computed on save, synced by cron (planned)
isPublic
```
Indexes: `members.user`, `owner+status`, `isPublic+owner`

#### Follow
```
follower → User, following → User
```
Unique compound index `(follower, following)`. Indexes for fast follower/following lookups.

#### Invitation
```
trip → Trip, invitedBy → User, invitedEmail, invitedUser → User
role: editor|viewer, status: pending|accepted|declined|expired
token (unique), expiresAt
```
Partial unique index on `(trip, invitedEmail, status)` where status=pending — prevents duplicate pending invites.

---

## API Endpoints

### Auth  `POST /api/auth/*`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/google?mode=login\|signup` | — | Initiates Google OAuth |
| GET | `/google/callback` | — | Google OAuth callback, sets cookies |
| POST | `/refresh` | cookie | Rotates access + refresh tokens |
| POST | `/logout` | — | Clears cookies, nulls refreshToken in DB |
| GET | `/me` | JWT | Returns current user |

### Trips  `/api/trips/*`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | JWT | Get my trips (upcoming + past) |
| POST | `/` | JWT | Create trip |
| GET | `/invitations` | JWT | My pending invitations |
| GET | `/invitations/:token` | JWT | Lookup invite by token |
| POST | `/invitations/:token/respond` | JWT | Accept or decline invite |
| GET | `/:id` | JWT | Get trip (member or public) |
| PUT | `/:id` | JWT | Update trip metadata (owner/editor) |
| PUT | `/:id/itinerary` | JWT | Replace full itinerary (owner/editor) |
| PATCH | `/:id/privacy` | JWT | Toggle isPublic (owner only) |
| POST | `/:id/invite` | JWT | Send email invite (owner/editor) |

### Users  `/api/users/*`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/profile/:username` | optional JWT | Public profile + public trips + follow status |
| POST | `/username` | JWT | Set/update username (30-day cooldown) |
| GET | `/username/check/:username` | JWT | Check availability |
| GET | `/search?q=` | JWT | Search users by username prefix (regex-escaped) |

### Follow  `/api/follow/*`
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/:userId/follow` | JWT | Follow user (atomic tx) |
| DELETE | `/:userId/follow` | JWT | Unfollow user (atomic tx) |
| GET | `/:userId/followers` | JWT | Paginated followers (cursor) |
| GET | `/:userId/following` | JWT | Paginated following (cursor) |
| GET | `/:userId/follow-status` | JWT | Check if you follow this user |

### Explore  `/api/explore/*`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/search?ll=&kind=&radius=&query=` | JWT | Nearby places via Google Places |
| GET | `/details/:placeId?refLat=&refLng=` | JWT | Place details |

### Transport  `/api/transport/*`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/flight?flightNum=&date=` | JWT | Flight info via AviationStack |
| GET | `/train?query=&searchType=` | JWT | Train lookup (RapidAPI → erail fallback) |
| GET | `/pnr?pnr=` | JWT | PNR status via RapidAPI |
| GET | `/geocode?q=&type=airport\|station` | JWT | Nominatim geocoding proxy |

---

## Frontend Architecture

### Pages
| Route | Component | Notes |
|---|---|---|
| `/` | `HomePage` | Landing |
| `/login` | `Login` | Google OAuth trigger |
| `/signup` | `Signup` | Google OAuth trigger |
| `/set-username` | `SetUsername` | Post-auth username setup |
| `/dashboard` | `Dashboard` | My trips (protected) |
| `/trips/:id` | `TripDetail` | Trip view/edit with tabs |
| `/trips/new` | `CreateTrip` | Trip creation form |
| `/invite/:token` | `InviteAccept` | Accept invite |
| `/u/:username` | `UserProfile` | Public profile |
| `/search` | `SearchUsers` | User search |

### Trip tabs (`pages/trip/`)
- **PlanTab** — itinerary builder with drag-and-drop (dnd-kit)
- **ExploreTab** — Google Places search near destination
- **TripTabs** — tab container + transport search sheet

### State management
- `AuthContext` — current user, loading state, refetch
- TanStack Query — server state (trips, invitations, places)
- Local state — form state, modals, UI

### Axios instance (`api/axios.js`)
- Base URL `/api`
- `withCredentials: true` for cookie auth

---

## Auth flow detail
```
1. User clicks "Login with Google"
2. GET /api/auth/google?mode=login
   → sets req.session.mode = "login"
   → redirects to Google
3. Google redirects to /api/auth/google/callback
   → passport validates, finds/creates user
   → googleCallback sets httpOnly accessToken (15m) + refreshToken (7d) cookies
   → redirects to /dashboard or /set-username
4. Client reads user via GET /api/auth/me (cookie sent automatically)
5. When accessToken expires:
   → axios interceptor calls POST /api/auth/refresh with refreshToken cookie
   → server rotates both tokens
   → original request retried
```

---

## Trip status sync
`computeTripStatus(startDate, endDate)` is a pure function that returns `upcoming|ongoing|past|null`. It is used in three places:
- `pre('save')` hook — keeps status correct when a trip is created/edited
- `Trip.applyComputedStatus(trips)` — read path; corrects status **in memory** for display, no DB write
- `Trip.syncAllStatuses()` — scheduled BullMQ job (every 15 min); bulk-persists corrections via `updateMany`

This removed the previous write-on-read anti-pattern (status was persisted on every `getMyTrips`).

---

## Security posture (current)
Hardened as of 2026-08-29:
- `helmet()` — security headers, globally applied
- `globalLimiter` on `/api`, `authLimiter` on `/api/auth` — brute-force protection
- `sanitizeRequest` — strips NoSQL operators (`$`, `.`) from body/params/query
- `escapeRegex()` — user search input escaped before regex use
- Refresh tokens stored **hashed** (SHA-256), never plaintext
- Session/auth cookies `httpOnly` + `secure` in prod + `sameSite: lax`
- `config/env.js` — fail-fast validation of required secrets in production
- Covered by `__tests__/security.test.js`

## Scaling the profile, follow graph & search

### User search
- `searchUsers` does an **anchored, lowercase, non-`i` prefix regex** (`/^query/`) on the
  indexed `username` field. Usernames are stored lowercase, so the query is lowercased and the
  case-insensitive flag is dropped — this lets MongoDB serve it from the btree **index range
  scan** instead of a collection scan. This is the single most important search optimization.
- Results are `.lean()`, capped at 10, index-ordered (alphabetical).
- **When you need fuzzy / typo-tolerant / popularity-ranked / multi-field (name+username)
  search**: move to **MongoDB Atlas Search** (built-in Lucene, no extra infra) or a dedicated
  engine (**Typesense / Meilisearch / Elasticsearch**). Regex prefix does not cover fuzzy search.

### Follow graph
- Follow/unfollow run in a **transaction** that writes the `Follow` edge and atomically `$inc`s
  the denormalized `followersCount` / `followingCount` — so counts are O(1) reads (no `countDocuments`).
- Follower/following lists use **`_id`-based cursor pagination** (ObjectId is monotonic + unique),
  which avoids the duplicate/skip bug of a non-unique `createdAt` cursor. Page size is capped at 50.
  Backed by compound indexes `{following, _id}` and `{follower, _id}`.
- Follow-status is an O(1) lookup on the unique `{follower, following}` index.
- **Self-healing counters**: `services/followCounts.js` `reconcileFollowCounts()` recomputes counts
  from the `Follow` collection via aggregation and bulk-fixes drift. Scheduled weekly
  (`JOB_SYNC_FOLLOW_COUNTS`, Sun 04:00) — a safety net; transactions keep counts correct day-to-day.

### Profile page
- `getUserProfile` caches the **viewer-independent** part (profile doc + public trips) in Redis for
  30s keyed by username, so hot/celebrity profiles don't hammer the DB. `isFollowing` is per-viewer
  and always computed fresh (one indexed lookup). All reads are `.lean()` and use the read replica.

### Is MongoDB the right database?
**Yes — keep MongoDB for the core.** Rationale and the few places to augment it:

| Concern | Verdict |
|---|---|
| Users, trips (embedded itineraries), invitations | MongoDB is ideal — document model fits; scales via indexes + sharding to 10M+ users |
| Follow graph (follow/unfollow, lists, counts) | MongoDB is fine — simple adjacency + denormalized counts. A graph DB (Neo4j) is only worth it for deep traversals (friends-of-friends, mutuals, recommendations), which this app doesn't do |
| Counts / hot reads | Denormalized on User + Redis cache — no separate store needed |
| Username prefix autocomplete | MongoDB indexed prefix (current) is fast |
| Fuzzy / ranked / multi-field search | Augment with **Atlas Search** or Typesense — do NOT switch the primary DB |
| Sessions, cache, queues, rate limiting | **Redis** (already in place) |

**Recommendation:** Do not migrate databases. Scale MongoDB with: proper indexes (done),
read replicas (done, `USE_READ_REPLICA`), Redis caching (done), and **sharding** when a single
replica set is saturated (shard `users` by `_id`, `follows` by `follower`). Add **Atlas Search**
only when product needs fuzzy search. Switching to Postgres/graph/etc. would add migration risk
and ops burden without solving a bottleneck this workload actually has.

## Known technical debt (prioritised)
1. ~~`inviteMember` awaits `sendInviteEmail`~~ ✅ DONE — emails dispatched via BullMQ queue
2. ~~`syncStatuses` on read path~~ ✅ DONE — moved to a BullMQ repeatable job; reads compute in memory
3. ~~No Redis caching on explore routes~~ ✅ DONE — cached with TTL
4. ~~In-memory session store won't work across instances~~ ✅ DONE — Redis session store (with fallback)
5. `erail.in` scraping is fragile → get a real train data contract
6. No per-endpoint request validation library (zod/joi) — controllers validate manually
7. Refresh token rotation exists but no reuse-detection / token family revocation yet
8. **Frontend lint debt**: 31 pre-existing ESLint errors across 14 files (mostly React 19's
   `react-hooks/set-state-in-effect`). CI runs lint as **non-blocking** until cleared —
   flip `continue-on-error` off in `.github/workflows/ci.yml` once fixed.
