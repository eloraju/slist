# Implementation plan

Decisions behind this plan are in [`docs/adr/`](./adr/); the domain vocabulary
is in [`CONTEXT.md`](../CONTEXT.md). Phases are independent deliverables and are
ordered so that each one is usable on its own.

**Stack**: `Bun.serve` (HTTP + WebSocket + static frontend, one process) ·
Postgres · `Bun.sql` · Better Auth (sharing the same pool via a Kysely dialect) ·
React 19 · TanStack Query · Zod. No ORM, no `pg`, no Vite, no TanStack Start, no
sync engine. **Bun 1.4+ required** (ADR-0007).

---

## Phase 0 — Skeleton and self-host contract

Nothing visible, but it proves the deployment story on day one rather than
discovering at the end that nobody else can run it.

- `docker-compose.yml`: `app` + `postgres`, named volume, Postgres healthcheck
  gating `depends_on: condition: service_healthy`, pinned Postgres major.
- `.env.example` with `PUBLIC_URL` and `DATABASE_URL`.
- Migration runner: numbered `.sql` files applied on boot inside a transaction,
  tracked in a `_migrations` table, before the server binds.
- **Spike first**: Better Auth on one shared `Bun.sql` pool via
  `kysely-postgres-js`'s `PostgresJSDialect` (ADR-0007). Confirm no postgres.js
  in the tree and that the CLI-generated schema applies. Fall back to a `pg`
  Pool if not, before anything is built on it.
- Better Auth with the Anonymous plugin on, its schema generated via the CLI as
  plain SQL and committed as a migration file.
- Dockerfile pinned to `oven/bun:1.4` or later.
- `.prettierrc` (committed), `eslint.config.js`, and `src/lib/result.ts` —
  `ok`/`err`/`isOk`/`map`/`andThen`/`unwrapOr`/`fromPromise`, unit-tested.
- Signing secret: read from env, else generate on first boot and persist.
- `PUBLIC_URL` derives the cookie `Secure` flag and is the only origin source.

**Done when**: a stranger clones, copies `.env.example`, runs `docker compose
up`, opens `PUBLIC_URL`, and gets a session cookie for a new Anonymous Account.

**Delivered** (#1). The spike passed on every check, so Better Auth runs on one
shared `Bun.sql` pool via `PostgresJSDialect` and the `pg` fallback was not
needed.

One decision differs from the shape described above: **session bootstrap is
client-side**. `/*` serves the bundle and does no session work; the React app
calls the anonymous sign-in on boot when it finds no session, behind a gate. A
server-side shell handler only covered exact `/`, so deep links and refreshes
got no Account. A failed or errored session check must never trigger sign-in —
only a definitive "no session" may — because minting a new Anonymous Account
over a network blip strands that visitor's Lists with no recovery (ADR-0003).

## Phase 1 — Lists and Items, single user

A complete, usable single-user app.

**Process experiment**: Phase 1 runs with a separate agent writing the pure-core
tests (`can()`, Zod schemas) from the ticket, a second implementing against them,
and a review agent on the diff. Every later phase uses one implementing agent
plus a review agent. If the split costs more than it catches, this phase is
redone without it — decide before starting Phase 2.

- Migrations for `lists`, `items`, `memberships`. Creating a List creates an
  Owner Membership for the creator.
- `can(account, permission, list)` — the only capability check in the app.
  Written correctly from the first endpoint even though every List has one
  Member; nothing is rewritten when sharing arrives.
- Zod-validated REST on `Bun.serve` routes: list CRUD, item CRUD, toggle
  Checked, plus the two bulk actions (clear Checked, uncheck all).
- React UI: instant actions (tick, delete, bulk) fire immediately; edited fields
  (name, note, quantity, unit) sit behind explicit save/cancel, so nothing is
  ever debounced. Sorting is client-side — default alphabetical and by Checked.

**Done when**: one person can keep a real shopping list on one device.

**Delivered** (#2). Three decisions taken during the work that the scope above
does not carry:

- **The server orders nothing, Lists included.** Said here of Items; it now
  holds for Lists too, sorted client-side by `byName`.
- **Empty means nothing, for `note` and `unit`.** On create, absent, `""`,
  whitespace and `null` all collapse to the key being absent; on update they
  collapse to key-present-`null`. Exactly one representation of "no value"
  reaches the database. `name` still rejects empty.
- The quantity/unit coupling is judged against the **payload**, not the
  resulting Item — deliberate, so the check stays in the pure core.

**Process experiment: the split is judged worth keeping.** The separate test
author caught the note/unit asymmetry, the `{note: undefined}`/`toEqual` hole
and a create-side `null` inconsistency before any implementation existed to be
rewritten, and verified its coupling test was ordering-sensitive empirically
rather than assuming it. The review agent independently found that
`GET /api/lists` decided visibility in SQL without ever calling `can()` — a
capability decision rather than a Role read, which is why three agents' greps
missed it, and the one thing Phase 3 would have had to rewrite. The weakness to
carry forward: the most common failure was a first red of "cannot find module",
which proves absence rather than behaviour. Later phases require a behavioural
red.

Follow-up work from both reviews is filed as #8–#17.

## Phase 2 — Realtime

- `ws.subscribe("list:<id>")` on connect, authorised through `can()`.
- Every write publishes `{ listId }` through **one** function — never a scattered
  `server.publish` — so multi-instance fan-out is a single change later.
- Client invalidates the matching TanStack Query key; invalidate everything on
  reconnect.
- Authors skip their own echo, so an optimistic edit does not flicker.

**Done when**: two browser tabs stay in sync, and killing the socket mid-session
recovers on reconnect.

## Phase 3 — Sharing

- Migration for `invites`: single-use token, target Role, 7-day expiry, issuer.
- Issue, redeem and revoke endpoints; redemption creates a Membership and
  consumes the Invite. Invite URLs are built from `PUBLIC_URL`.
- Member list UI: who is on this List, in what Role, remove, promote to Owner.
- Removal force-disconnects that Account's sockets for the List.

**Done when**: two Accounts on two devices share one List in realtime.

## Phase 4 — Registered Accounts

- Email + password on top of the existing Anonymous Account, via Better Auth's
  `onLinkAccount`. Upgrades in place: no migration of data, no second Account.
- Sign-in on a second device, session management, sign-out.
- Reaping job for Anonymous Accounts that have not been seen in N days.

**Done when**: the same Account, with its Lists, opens on a phone and a laptop.

## Phase 5 — Polish

- Ownerless List behaviour (ADR-0004): Owner-only actions disabled, everything
  else keeps working.
- Empty states, error states, offline indicator, PWA manifest.
- README: deploy, upgrade, back up, put it behind a reverse proxy.

---

## Deliberately not in scope

Offline-first edit queues (ADR-0002) · database-backed custom Roles (ADR-0005) ·
approval workflows · patch-carrying WebSocket messages (ADR-0006) · server-side
Item ordering · structured quantity parsing · email invites, and therefore SMTP
configuration.
