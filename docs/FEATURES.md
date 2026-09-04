# Features & Changelog

Update this file whenever a feature is added, changed, or removed. Keep entries newest-first.

---

## Changelog

### 2026-09-04 — Discover public trips + personal Wishlist (backend)
- New **discover** module (`discoverController` + `discoverRoutes`, mounted at `/api/discover`,
  all routes `protect`-gated).
- **`GET /api/discover/trips?q=&cursor=&limit=`** — browse **public** trips (`isPublic: true`),
  newest-first, cursor-paginated (`limit+1` → `hasMore`/`nextCursor`, max 40). `q` matches trip
  `name` + `destination.name/city/country` via a regex run through `escapeRegex` (no injection).
  Routed to a read replica (`analyticsReadPreference()`) as a browse/display read. Returns a
  trimmed shape (owner populated `name/avatar/username`, `membersCount`, cover, dates).
- **Wishlist** (`Wishlist` model): a user's saved items from Discover. Deliberately denormalized —
  stores a display snapshot (title/subtitle/image/rating/lat/lng/meta) so it renders without
  re-fetching a source that went private or re-billing Google Places. `kind` ∈
  trip/place/restaurant/hotel/stay/activity/sight; `refId` = trip id or Google placeId.
  - `POST /api/discover/wishlist` — idempotent upsert, unique per `(user, kind, refId)`; a
    duplicate under a race (11000) returns 200 with the existing item. Whitelisted fields only.
  - `GET /api/discover/wishlist?kind=&cursor=&limit=` — the caller's saved items, newest-first,
    cursor-paginated (max 60), optional `kind` filter.
  - `GET /api/discover/wishlist/keys` — the set of saved `refIds` (for filled-heart state on Discover).
  - `DELETE /api/discover/wishlist/:id` — remove by wishlist `_id` **or** `refId`; scoped to the
    caller (another user's item → 404).
- **Tests**: `discover.test.js` (14) — public-only filtering, `q` search + regex escaping,
  pagination; wishlist add/idempotency, validation (400), kind→trip ref, per-user list scoping,
  kind filter, keys, remove by id/refId, cross-user 404, and 401s.

### 2026-09-02 — Notes tab: collaborative notes feed + checklists
- The trip **Notes** tab now has two sections (toggle): **Notes** and **Checklists**.
- **Notes feed** (`TripNote` collection, cursor-paginated): any trip member can post a note;
  each note is attributed to its author (avatar + @username + time), newest-first. Author or
  trip owner can delete a note. Members-only (same live `Trip.members` check as trip chat).
- **Checklists** (`Checklist` collection, items embedded with their own `_id`): create multiple
  named checklists; add/delete items; check/uncheck (stores `doneBy`). On first visit with none,
  a **default checklist with 3 starter items** is auto-seeded (guarded against double-create).
  Item toggle/add/delete use atomic positional updates ($set/$push/$pull). Creator or owner can
  delete a whole checklist.
- Replaces the old single shared-textarea note. Notes tab (and Files) also made full-width —
  the itinerary+map split is now Plan-only.
- **Tests**: `tripNotes.test.js` (10) — note add/list/pagination/delete-authz, checklist
  create/list/delete-authz, item add/toggle(doneBy)/edit/delete, empty→400, missing→404,
  non-member→403.

### 2026-09-02 — Per-trip discussion chat (members-only)
- New **Chat** tab on every trip (next to Files). Backend: `TripMessage` model +
  `tripChatController` + routes nested at `/api/trips/:tripId/chat`.
- **Access control**: every request re-checks `Trip.members` live, so a user who leaves
  or is removed **instantly** loses access (no stale membership). Non-members → 403.
- **Share places from Explore**: hotels/restaurants/attractions can be shared straight
  into the chat — the place is stored **denormalized** on the message (`sharedPlace`), so
  the card renders instantly and we never re-hit/re-bill the Places API. Renders a compact
  hotel/restaurant card (photo, name, category·rating, address, maps link).
- **Reply** (WhatsApp-style): quoted `replyTo` with a preview above the reply and a
  reply-compose bar; validated to belong to the same trip.
- **Reactions, delete, live polling, infinite scroll** — same production patterns as the
  community chat (embedded reactions, `?after=` returns `updated` for live reaction/delete
  sync via `{trip, updatedAt}` index, cursor pagination up).
- **Delete like WhatsApp**: sender deletes own; trip owner (admin) deletes any →
  "deleted by admin" tombstone.
- **System notice**: accepting a trip invite posts "@user joined the trip".
- **Mobile-first interactions**: tap a message → action sheet (react / reply / delete) —
  no hover required (works on touch and desktop).
- **Tests**: `tripChat.test.js` (14) — access control incl. non-member 403, send/list/
  pagination, place-share (+400), replies (+cross-trip 400), reactions, delete (sender vs
  admin, 403), live `updated`, and the invite-accept system message.

### 2026-09-02 — Chat upgrades: reactions, search, system notices, delete, infinite scroll
- **Emoji reactions** (Slack-style): embedded `reactions: [{emoji, users[]}]` on the message
  (bounded per message, same access path → zero extra queries). `POST :id/messages/:mid/react`
  toggles. Reaction chips show counts + who-reacted; hover picker with a common-emoji set.
- **In-chat search**: `GET :id/messages/search?q=` (regex, members-only) with a full-screen
  search UI; tapping a result jumps/highlights the message. (At larger scale → Atlas Search.)
- **System notices**: joining/leaving/removal posts an italic `type:"system"` message
  ("@alice joined" / "left" / "was removed"), rendered as a centered pill.
- **Delete like WhatsApp**: the **sender** can delete their own message; the **owner/admin**
  can delete anyone's → tombstone reads *"deleted by admin"* vs *"This message was deleted"*.
  Soft delete wipes content off the wire.
- **Live propagation**: the `?after=` poll now returns `updated` (messages changed since the
  cursor — reactions/deletions) via the `{community, updatedAt}` index, so reactions and
  deletions reflect on every client within the poll interval — not just for new messages.
- **Infinite scroll**: older history loads on scroll-up via the existing `?cursor=` pagination,
  preserving viewport position; the "start of community" intro only shows once fully back-scrolled.
- **Images**: model prepped (`type:"image"`, `imageUrl`) — actual upload needs object storage
  (Cloudinary/S3), flagged as the one piece requiring infra (not a DB change).
- **DB note**: MongoDB remains the right store at this scale; Redis+Socket.io is the path for
  true realtime/presence/typing, and a search engine only once regex search outgrows itself.
- **Tests**: reactions (add/toggle/accumulate/400/403), search (match + members-only),
  system notices (joined/left), delete (sender vs admin, 403), and live `updated` polling.

### 2026-09-02 — Communities + group chat (Slack/WhatsApp-style)
- **Communities**: public (discoverable, `#name`) and private (🔒 request-to-join).
  Models: `Community`, `CommunityMember` (separate collection so large communities
  scale — not an embedded array), `JoinRequest` (partial-unique pending index),
  `Message` (text / trip_share / system, with resolved `mentions`).
- **System design**: multi-document writes use Mongoose **transactions** (create =
  community+owner-member; join/leave/accept = member ± `membersCount`; delete cascades
  messages/members/requests). Denormalized `membersCount`. All list endpoints are
  cursor-paginated; authorization is re-checked per request via `CommunityMember`.
- **API** (`/api/communities`): create, `search` (public, prefix), `mine` (owned+joined),
  get one (private → `locked`/`requested`), join (public), request (private),
  list/respond requests (owner/admin), members, leave, delete. Chat: `GET :id/messages`
  (history cursor **or** `?after=` polling), `POST :id/messages`, `PATCH :id/read`.
- **Chat**: near-real-time via short-interval polling while a chat is open (2–3s); the
  schema/API are Socket.io-ready for a later real-time upgrade with no data changes.
- **@mentions**: `@username` is resolved to community members only; each mention raises a
  `mention` notification (bell badge = "tagged you"), and mentions render highlighted in chat.
- **Trip sharing**: share a trip you belong to into a community (renders a minimal trip
  card); a **Share** button on the trip page opens a community picker; a **Share a trip**
  action lives in the chat composer too.
- **Frontend**: `Communities` hub (create, my/joined lists, search with a **People ⟷
  Community** toggle, `#`/🔒 display) and `CommunityDetail` (chat, members & requests panel,
  leave/delete), plus a **Community** tab in the dashboard nav next to Wishlist.
- **Tests**: `communities.test.js` (create/search/join/private-requests/accept-reject/
  leave/delete + authz matrix) and `messages.test.js` (send/list/pagination/`after`-polling,
  mentions incl. self/non-member, trip-share incl. 403/400, mark-read). Notification model
  gains `community` + `mention`/`community_*` types.

### 2026-09-02 — Invite by username + in-app notification system
- **Invite by username** (alongside email). `POST /api/trips/:id/invite` now accepts
  `{ username }` or `{ email }`; username is resolved to the account, so the canonical
  email + `invitedUser` are stored either way. Guards: 404 unknown username, 400 self-invite,
  409 already a member, 400 when neither is given.
- **User search UI**: reusable `UserSearchSelect` (debounced `/api/users/search`, recommendations
  with avatar/name/@username and an Invite/Add button) used in both the **trip invite modal**
  (username/email toggle) and the **create-trip invite step** (search + "or add by email").
- **Notification system** (`models/Notification.js` + `controllers/notificationController.js` +
  `routes/notificationRoutes.js` at `/api/notifications`): `GET /` (cursor-paginated),
  `GET /unread-count`, `PATCH /:id/read`, `PATCH /read-all`. Types: `trip_invite`,
  `invite_accepted`, `invite_declined`. Indexed `{recipient, createdAt}` and `{recipient, read}`.
  Stateless (badge via polling) so the app tier stays horizontally scalable.
- **Both channels on invite**: an invited user with an account gets an in-app notification
  *and* an email (both non-blocking, wrapped in try/catch off the response path). Accepting/
  declining notifies the inviter and clears the invitee's invite notification.
- **Dashboard bell** (`components/NotificationBell.jsx`): unread badge, dropdown list, one-click
  **Accept/Decline** for invites, and **View trip**; responsive (bottom-anchored on mobile).
- **Tests**: `notifications.test.js` — notification list/count/mark-read/mark-all/pagination/auth,
  invite-by-username (create + notification, 404/400/409 matrix, email-to-existing-user notifies,
  email-to-non-user does not), and accept/decline flows (member added, notification cleared,
  inviter notified). Existing invite tests still green (backend suite: 167 tests).

### 2026-09-02 — Expenses: required title + optional description
- Each expense now has a required **`title`** (short heading) and an optional
  **`description`** (longer note, defaults to `""`). Enforced in the model, validated
  in the controller, surfaced in the add-expense modal (Title required, Description
  optional textarea) and shown on expense cards / member breakdown.
- Tests updated: 400 when title missing/blank; description optional (creates without it)
  and stored when provided.

### 2026-09-02 — Expenses & Splits (Splitwise-style)
- New **Expenses/Splits** module for trips — a "Split" tab with two views: *Expenses*
  (list + add) and *Splits* (per-member balances + settlement suggestions).
- **Model** (`models/Expense.js`): money stored as integer **minor units (paise)**
  end-to-end so split sums are always exact (no floating-point drift). Source of truth
  for balances is each expense's resolved per-participant `owed`. Indexes on
  `{trip, createdAt}`, `{trip, participants.user}`, `{trip, paidBy}`.
- **Split logic** (`utils/splits.js`, pure + unit-tested): `equal`, `exact`,
  `percentage`, and `shares` methods, using largest-remainder distribution so parts
  always sum to the total (the 100/3 case). Greedy `settleBalances()` minimises transfers.
- **API** (nested `/api/trips/:tripId/expenses`, all membership-checked; viewers can't mutate):
  - `POST /` create · `GET /` list (cursor-paginated) · `PUT/DELETE /:id`
  - `GET /balances` — single `$facet` aggregation → each member's paid/owed/net + settlements
  - `GET /user/:userId` — that member's expenses with their per-expense share (drill-down)
- **UI** (`client/src/pages/trip/SplitTab.jsx`): add-expense modal with live split preview
  and validation; balances list with net (green/red) → tap a member for their breakdown;
  responsive (bottom-sheet modal on mobile).
- **Tests**: `splits.test.js` (pure math: rounding, validation, settlement conservation)
  and `expenses.test.js` (create/list/balances/breakdown/update/delete across the
  200/400/401/403/404 matrix).

### 2026-08-30 — React Native app (Expo) + mobile auth
- New **`mobile/`** app: Expo SDK 57 + expo-router + NativeWind + TanStack Query.
  Core-first scope: Google login, Trips list, Create trip, Trip detail (itinerary +
  explore nearby), Find people/follow, Profile, invite deep links (`wohoo://invite/:token`).
- **Backend (additive, no web impact):** `POST /api/auth/google/mobile` (verify Google
  ID token via `google-auth-library` → JWTs in JSON body); `/api/auth/refresh` + `/logout`
  now also accept the refresh token in the body/header for mobile; `GOOGLE_MOBILE_AUDIENCES` env.
- Same backend as web — only auth differs (Bearer tokens + secure device storage).
- Validated: backend **95 tests**; mobile `tsc` clean + `expo-doctor` 21/21. See `mobile/README.md`.

### 2026-08-30 — Cost: background queues off by default
- BullMQ email + maintenance queues gated behind **`ENABLE_QUEUES`** (default off). The always-on
  worker polled Redis 24/7, producing nearly all Upstash commands at near-zero traffic.
- With queues off: **email sends inline**, **trip status computed on read** — no user-visible change.
  `REDIS_URL` still powers the Google Places cache + sessions.
- Prod worker scaled to 0. Reversible: `ENABLE_QUEUES=true` + `fly scale count worker=1`.

### 2026-08-30 — Icon system (emoji → Lucide)
- **Replaced all UI emojis with Lucide icons** (`lucide-react`) for a premium, consistent look —
  across dashboard, trip plan/explore/detail, create-trip, invites, profile, home, auth.
- **Central icon module** `client/src/lib/icons.jsx` — single source of truth: transport-mode,
  item-type, place-kind and amenity icon maps + `iconSvg()` (renders a Lucide component to an SVG
  string for Mapbox marker/popup HTML, which can't hold React nodes).
- **Backend**: `explore` route now sends a stable amenity `key` (not an emoji); the client maps it
  to a Lucide icon (`AMENITY_ICON`).
- Map rating pills keep the monochrome `★` glyph (clean/typographic, not an emoji); decorative
  `✦` flourishes on the homepage are typography, left as-is.
- Tests: client 16 + backend 88 green; production build verified.

### 2026-08-30 — 14-day persistent login + auth hardening
- Refresh token lifetime 7d → **14d**; client **silently refreshes** on load so users stay logged
  in across tab close/reopen until manual logout.
- Cookies default **`sameSite=lax`** (CSRF-safe; prod is same-site `api.wohoo.in`↔`wohoo.in`);
  cross-site envs set `COOKIE_SAMESITE=none`. Logout clears with matching attributes.
- Auth routes send **`Cache-Control: no-store`** so browsers never serve a stale OAuth redirect.

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
