# Deployment & CI/CD

## ⚡ Current live deployment (runbook) — updated 2026-08-29

**Live URLs**
| Layer | URL | Host |
|---|---|---|
| Frontend (prod) | **https://wohoo.in** (+ www) — also wohoo-main.akash-bansal-48b.workers.dev | Cloudflare Workers (static assets); custom domain via `wrangler.jsonc` routes |
| Frontend (beta) | https://wohoo-beta.akash-bansal-48b.workers.dev | Cloudflare Workers (static assets) |
| Backend (prod) | **https://api.wohoo.in** (Cloudflare-proxied → Fly) — also wohoo-api.fly.dev | Fly.io (region `sin`) — API + worker |
| Backend (beta) | https://wohoo-api-beta.fly.dev | Fly.io (region `sin`) — API only |
| Repo | github.com/akashwohoo07/wohoo-main | branches: `main` (prod), `beta` |

### 🔴 Release workflow (ALWAYS follow)
1. Make the change → deploy to **beta** (frontend + backend) → **ask the user if they want to
   manually test the feature on beta**.
2. Only after beta is confirmed working → promote to **prod**.
3. Never deploy straight to prod without beta first.

Frontend envs are two separate Cloudflare Workers built with different `VITE_API_URL`:
- prod build → `https://wohoo-api.fly.dev`, deploy `wohoo-main` (default `wrangler.jsonc`)
- beta build → `https://wohoo-api-beta.fly.dev`, deploy `wohoo-beta` (`wrangler.beta.jsonc`)
Always rebuild with the correct `VITE_API_URL` before each deploy (the `dist/` is shared/transient).

**Accounts:** GitHub `akashwohoo07` · Fly `akash.bansal@wohoo.in` · Cloudflare `akash-bansal-48b` ·
MongoDB Atlas (prod cluster `wohoo-prod`, beta cluster `cluster0`) · Upstash (prod + beta Redis).

**Fly apps & processes**
- `wohoo-api` (prod): process `app` (web, scale-to-zero) + process `worker` (1 machine, always-on).
- `wohoo-api-beta`: process `app` only (no Redis, worker off → inline email fallback).

### How to redeploy

**Frontend** (deployed manually via wrangler — Git auto-build not yet wired):
```bash
cd client
# BETA first:
VITE_API_URL="https://wohoo-api-beta.fly.dev" npm run build
npx wrangler deploy --config wrangler.beta.jsonc          # → wohoo-beta.akash-bansal-48b.workers.dev
# then PROD (after beta verified):
VITE_API_URL="https://api.wohoo.in" npm run build        # api.wohoo.in = same-site as wohoo.in → first-party cookies (mobile login works)
npx wrangler deploy                                       # → wohoo.in / www.wohoo.in
```
SPA routing is handled by the wrangler configs (`not_found_handling: single-page-application`).
Do NOT add a `public/_redirects` file — it conflicts with Workers assets and breaks deploy.

**Backend** (manual, per environment):
```bash
cd backend
fly deploy -a wohoo-api-beta --ha=false --process-groups app     # beta (app only)
fly deploy -a wohoo-api --ha=false --process-groups app          # prod app
fly scale count worker=1 -a wohoo-api                             # ensure prod worker running
```
**Auto-deploy**: pushing to `beta` runs GitHub Actions (`deploy-backend.yml`) → tests → deploys the
**beta** backend automatically (app process only). **Prod is never auto-deployed** — promote it
manually with the command above after beta is verified. `FLY_API_TOKEN` is an org-scoped Fly token
stored as a repo secret.

### How to change env / secrets
- **Backend secrets** (Mongo, Redis, Google, email, JWT): `fly secrets set KEY="value" -a <app>`
  then the machine restarts. `CLIENT_URL` must equal the frontend origin (CORS). Prod `CLIENT_URL`
  = the Cloudflare URL above.
- **Frontend build vars** (`VITE_*`): baked at build time. Change by rebuilding with the new value
  (inline env or `client/.env`) and running `npx wrangler deploy`.

### Auth cookies & session lifetime
- Access token **15m**, refresh token **14d** (hashed in DB, rotated on every refresh). The client
  silently refreshes on load, so users stay logged in for 14 days across tab close/reopen until they
  log out manually.
- Cookie `SameSite` = `COOKIE_SAMESITE` env, **default `lax`** (CSRF-safe). Prod uses `lax` because
  `api.wohoo.in` and `wohoo.in` are same-site (no override needed). **Beta must set
  `COOKIE_SAMESITE=none`** — its frontend/back are different sites (`*.workers.dev` ↔ `*.fly.dev`),
  so `lax` would drop the cookie and login would silently fail.
- All `/api/auth/*` responses send `Cache-Control: no-store` so browsers never cache a stale OAuth redirect.

### Gotchas already hit & fixed (don't repeat)
- Fly region `bom` (Mumbai) is **deprecated** → use `sin` (Singapore).
- Beta backend **needs `COOKIE_SAMESITE=none`** (cross-site); prod leaves it unset (defaults to secure `lax`).
- `connect-redis` v7 is a **default** ESM export → `import RedisStore from "connect-redis"` (named import breaks native Node, though it passes in Vitest).
- `config/db.js` reads `MONGO_URL`; deploy secret is `MONGODB_URI` → `db.js` now accepts both.
- Mongo `bad auth` = wrong/URL-unsafe password → use an **alphanumeric** DB password.
- Cloudflare Workers assets: no `_redirects` file; use `wrangler.jsonc` SPA handling.
- Cloudflare monorepo: build **Root directory** must be `client` (if using the Git-connected build).

### Still TODO (known, not blocking)
- Fix Google **Places API (New)** key (403) so Explore works: enable Places API (New) + billing,
  remove HTTP-referrer restriction on the key.
- Rotate the Google OAuth client secret (it appeared in chat during setup).
- Optional: separate **beta frontend** pointing at `wohoo-api-beta`; wire frontend Git auto-deploy.
- Set spending caps on Fly / Atlas / Upstash.

## Pipeline overview

```
        ┌─────────────┐   push beta    ┌──────────────┐   auto   ┌────────────────────┐
 code → │  git (beta) │ ─────────────▶ │ GitHub Actions│ ───────▶ │ STAGING             │
        └─────────────┘   CI: test     │ CI + Deploy   │  deploy  │ Fly wohoo-api-beta  │
              │                         └──────────────┘          │ CF Pages (preview)  │
              │ verify staging                                     └────────────────────┘
              ▼
        PR beta → main  (CI must pass + review)
              │ merge
              ▼
        ┌─────────────┐   push main    ┌──────────────┐   auto   ┌────────────────────┐
        │  git (main) │ ─────────────▶ │ GitHub Actions│ ───────▶ │ PRODUCTION          │
        └─────────────┘   CI: test     │ CI + Deploy   │  deploy  │ Fly wohoo-api       │
                                        └──────────────┘          │ CF Pages (prod)     │
                                                                   └────────────────────┘
```

- **Frontend**: Cloudflare Pages Git integration — builds automatically per branch
  (production branch `main`, preview builds for `beta`).
- **Backend**: GitHub Actions (`deploy-backend.yml`) runs tests, then `flyctl deploy` to the
  Fly app matching the branch. API + worker run as two process groups from one image.
- **Data**: MongoDB Atlas + Upstash Redis, one instance each per environment (beta / prod).

## Environments

| | Staging (beta) | Production (main) |
|---|---|---|
| Git branch | `beta` | `main` |
| Fly app | `wohoo-api-beta` | `wohoo-api` |
| Frontend | CF Pages preview (beta branch) | CF Pages production |
| Mongo | Atlas M0 (free) | Atlas Serverless/Flex → M10 |
| Redis | Upstash free db | Upstash paid/pay-go db |
| Cost | ~$0 | ~$5–15/mo (scale-to-zero) |

---

## One-time setup

### 1. Accounts to create
- **Fly.io** — https://fly.io (install `flyctl`, run `fly auth login`)
- **Cloudflare** — https://dash.cloudflare.com (Pages)
- **MongoDB Atlas** — https://cloud.mongodb.com
- **Upstash** — https://upstash.com (Redis)
- (already have) Google Cloud (Places key), Resend (email)

### 2. MongoDB Atlas (×2: beta + prod)
1. Create a project → build a cluster (beta: **M0 free**; prod: **Serverless** or **Flex**).
2. Database Access → add a user (username + password).
3. Network Access → allow `0.0.0.0/0` (or Fly egress IPs).
4. Copy the connection string → this is `MONGODB_URI`.

### 3. Upstash Redis (×2: beta + prod)
1. Create a Redis database (region near Fly `bom`).
2. Copy the connection URL (`rediss://…`) → this is `REDIS_URL`.

### 4. Fly.io (backend API + worker)
```bash
cd backend
fly auth login
# create the two apps (no deploy yet)
fly apps create wohoo-api-beta
fly apps create wohoo-api

# set secrets per app (repeat for both, with each env's values)
fly secrets set -a wohoo-api-beta \
  MONGODB_URI="..." REDIS_URL="..." \
  JWT_SECRET="..." JWT_REFRESH_SECRET="..." SESSION_SECRET="..." \
  GOOGLE_CLIENT_ID="..." GOOGLE_CLIENT_SECRET="..." \
  GOOGLE_PLACES_KEY="..." AVIATIONSTACK_KEY="..." RAPIDAPI_KEY="..." \
  EMAIL_HOST="smtp.resend.com" EMAIL_PORT="465" EMAIL_SECURE="true" \
  EMAIL_USER="resend" EMAIL_PASS="..." APP_NAME="Wohoo" \
  FROM_EMAIL="noreply@yourdomain.com" \
  CLIENT_URL="https://beta.your-frontend.pages.dev" \
  USE_READ_REPLICA="false"
# ...same for -a wohoo-api with prod values + CLIENT_URL=prod URL

# scale process groups
#   beta: worker off (inline email fallback) to stay free
fly scale count app=1 worker=0 -a wohoo-api-beta
#   prod: 1 web (scale-to-zero) + 1 worker
fly scale count app=1 worker=1 -a wohoo-api
```
Get a deploy token for CI:
```bash
fly tokens create deploy -a wohoo-api        # prod token
fly tokens create deploy -a wohoo-api-beta   # (or one org token covering both)
```

### 5. GitHub → repo secrets
Settings → Secrets and variables → Actions → **New repository secret**:
- `FLY_API_TOKEN` = the Fly deploy token (an org-scoped token covers both apps).

Settings → Environments → create **staging** and **production**; on `production` add
**required reviewers** (you) so prod deploys wait for a click.

Settings → Branches → protect `main`: require PR + require the CI check to pass.

### 6. Cloudflare Pages (frontend)
1. Pages → Create → connect the GitHub repo.
2. Build settings:
   - **Root directory**: `client`
   - **Build command**: `npm run build`
   - **Output directory**: `dist`
   - **Production branch**: `main`
3. Environment variables — set for **Production** and **Preview** separately:
   - `VITE_API_URL` = prod: `https://wohoo-api.fly.dev` · preview: `https://wohoo-api-beta.fly.dev`
   - `VITE_MAPBOX_TOKEN`, `VITE_UNSPLASH_KEY`, `VITE_AVIATIONSTACK_KEY`, `VITE_RAPIDAPI_KEY`
4. Cloudflare auto-builds `main` → production and `beta` → a preview URL.

> After the frontend URLs exist, update each Fly app's `CLIENT_URL` secret to match (CORS).

---

## Ongoing flow (every change)
```bash
git checkout beta
# ...work...
git commit -am "change"
git push origin beta        # CI tests → deploys to staging (Fly beta + CF preview)
# verify on staging
# then open PR beta → main on GitHub → CI passes → approve → merge → prod deploys
```

## Rollback
- **Backend**: `fly releases -a wohoo-api` then `fly deploy --image <previous>` or `fly releases rollback`.
- **Frontend**: Cloudflare Pages → Deployments → "Rollback to this deployment".

## Notes
- Scale-to-zero web machines cold-start in ~1–2s. When that bothers prod users, set
  `min_machines_running = 1` in `fly.toml` (or `fly scale count app=2`).
- Set **spending limits/alerts** on Fly, Atlas, and Upstash — usage billing can spike on a
  traffic burst or a runaway loop.
- The worker is optional on beta (app falls back to inline email + no scheduled cron). Turn it
  on in prod (`worker=1`) so email is async and the trip-status / follow-count jobs run.
