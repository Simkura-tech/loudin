# Loudin API — container for the docker-compose evaluation stack.
# Not tuned for production (production runs on VMs with systemd — see
# docs/operations/deployment.md).

FROM node:22-alpine

WORKDIR /app

# Install dependencies first so source edits don't bust the npm cache layer.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

ENV PORT=3000
EXPOSE 3000

# On every start: run migrations + dev seed, then boot the API. Both steps
# are idempotent — migrate.js tracks applied files in the `migrations`
# table, and seed.sql bails out cleanly if `companies` already has rows —
# so this is "initialize on first start, no-op afterwards".
CMD ["sh", "-c", "node database/scripts/init-db.js --seed && exec node server.js"]
