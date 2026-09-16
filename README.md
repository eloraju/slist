# slist

A self-hosted, multi-user list application. People keep shared lists — shopping, todo — that stay
in sync across their devices and with the people they share them with, in realtime. Every visitor
gets a working Account from their first visit; no sign-up, no un-authenticated mode.

The domain vocabulary is in [`CONTEXT.md`](./CONTEXT.md), the architecture decisions in
[`docs/adr/`](./docs/adr/), and the rules for writing code here in
[`CONVENTIONS.md`](./CONVENTIONS.md).

## Self-hosting

```bash
cp .env.example .env   # set PUBLIC_URL, and the Postgres password if this is reachable
docker compose up
```

One container serves the API, the WebSocket and the frontend from the same origin, alongside a
Postgres. Migrations run on startup before the server binds, so pulling a new image just works
(ADR-0008).

## Configuration

`PUBLIC_URL` is the single source of truth for the origin (ADR-0008): the session cookie's `Secure`
flag, the WebSocket URL and the origin in Invite links all come from it. Nothing is read from the
request `Host` header. slist must be served from the **root of its origin** — a path prefix such as
`https://example.com/lists` is not supported and is refused at boot. Put it behind a subdomain
instead.

`AUTH_SECRET` is optional: left unset, a secret is generated on first boot and persisted in the
database, so sessions survive a restart. If you do set it, it must be at least 32 characters.

`PORT` defaults to 3000 and must be a whole number between 1 and 65535. Every one of these
variables fails at boot with a message naming it. See [`.env.example`](./.env.example) for the
full list.

## Development

Requires [Bun](https://bun.com) 1.4 or later and a Postgres.

```bash
bun install
bun run test:db    # a throwaway Postgres for the tests, on 55433
bun run dev        # hot-reloading server on PORT (3000 by default)
```

```bash
bun test           # each test creates its own UUID-named database
bun run typecheck
bun run lint
```
