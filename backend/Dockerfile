# ── Wohoo API / Worker image ─────────────────────────────────
# Single image runs either the API (node src/server.js) or the worker
# (node src/workers/index.js) — Fly selects which via [processes] in fly.toml.
FROM node:20-slim

WORKDIR /app

# Install production deps only (respects .npmrc legacy-peer-deps)
COPY package*.json .npmrc ./
RUN npm ci --omit=dev

# App source
COPY . .

ENV NODE_ENV=production
EXPOSE 8000

# Default command (overridden per Fly process group)
CMD ["node", "src/server.js"]
