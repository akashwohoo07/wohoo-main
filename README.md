# Wohoo.in

Collaborative travel planning platform — plan trips, build itineraries, invite
collaborators, follow other travelers, and explore places. Monorepo: React web
client + Express/MongoDB API. React Native app planned.

## Structure
```
backend/   Express 5 + MongoDB API, BullMQ workers, Redis cache
client/    React 19 + Vite + Tailwind web app
docs/      CODEBASE.md (architecture) · FEATURES.md (changelog)
```

## Quick start
```bash
# Backend
cd backend && npm install
cp .env.example .env         # fill in values
npm run dev                  # API on :8000
npm run worker:dev           # background worker (needs REDIS_URL)

# Frontend
cd client && npm install
cp .env.example .env         # fill in values
npm run dev                  # web on :5173
```

## Tests
```bash
cd backend && npm test       # Vitest + Supertest + in-memory Mongo replica set
cd client  && npm test       # Vitest + React Testing Library
```

## Branch & release flow
- **`beta`** → staging environment. All changes land here first and are verified.
- **`main`** → production. Only fast-forwarded from `beta` via PR once beta is confirmed working.

```
feature work → push to beta → CI + staging deploy → verify → PR beta→main → prod deploy
```

## Deployment
| Piece | Host | Root dir | Start |
|---|---|---|---|
| Web | Vercel | `client` | `npm run build` (output `dist`) |
| API | Railway / Render | `backend` | `npm start` |
| Worker | Railway / Render (2nd service) | `backend` | `npm run worker` |
| Redis | Upstash | — | set `REDIS_URL` |
| MongoDB | Atlas | — | set `MONGODB_URI` |

See `docs/CODEBASE.md` for architecture and `docs/FEATURES.md` for the changelog.
