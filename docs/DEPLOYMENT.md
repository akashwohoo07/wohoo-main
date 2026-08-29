# Deployment & CI/CD

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
