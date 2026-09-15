# Bun 1.4 or later is required: pre-1.4 `bun:sql` could return one query's rows to another when a
# parameterless and a parameterised query shared a connection (oven-sh/bun#32772), which an auth
# adapter hits routinely (ADR-0007).
FROM oven/bun:1.4-alpine

WORKDIR /app

# Dependencies first, so a source change does not reinstall them.
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .

ENV NODE_ENV=production
EXPOSE 3000

# One process serves the API, the WebSocket and the bundled frontend — same origin, no CORS
# (ADR-0008). Migrations run inside this process before it binds.
CMD ["bun", "src/index.ts"]
