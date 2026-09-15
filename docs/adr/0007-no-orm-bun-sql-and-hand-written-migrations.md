# No ORM: `Bun.sql` and hand-written SQL migrations

Drizzle entered the plan to make switching databases easy. ADR-0001 removed that
goal, so it had to re-earn its place, and for this app it does not.

The queries are about fifteen endpoints, nearly all single-table with one
Membership join for the permission check — the workload a query builder helps
least with. And Better Auth's CLI is *worse* through an ORM: with the built-in
Kysely adapter, `generate` emits a plain SQL file and `migrate` applies it,
whereas the Drizzle adapter emits a Drizzle schema file that must then be run
through `drizzle-kit` to become SQL, and has no `migrate` at all.

So: `Bun.sql` tagged templates for application queries, numbered `.sql` files in
a migrations directory applied on boot by a small runner inside a transaction,
and Better Auth's generated SQL as just another file in that directory.

## One connection pool, shared with Better Auth

Better Auth's `database` option accepts a Kysely `Dialect`, not only a `pg.Pool`:

```ts
database: { dialect: new PostgresJSDialect({ postgres: sql }), type: "postgres" }
```

`kysely-postgres-js` (maintained under the `kysely-org` org) accepts a `Bun.SQL`
instance where it expects a postgres.js client, since the two share a compatible
tagged-template interface. So one `Bun.sql` pool serves both the application and
Better Auth, and `pg` stays out of the dependency tree entirely — which keeps
`CLAUDE.md`'s "`Bun.sql` for Postgres" rule true across the whole codebase.

Better Auth declined to support `Bun.SQL` first-class (issue #11266, closed as
not planned) on the grounds of staying runtime-agnostic, pointing at exactly
this adapter route. It is a scoping decision, not a technical barrier.

## Consequences

**Bun 1.4 or later is required.** Pre-1.4 `bun:sql` could return one query's rows
to another when a parameterless and a parameterised query shared a connection
(oven-sh/bun#32772) — a pattern an auth adapter hits routinely. The Dockerfile
pins it; developers need it locally too.

**The dialect is verified in Phase 0**, before anything is built on it. Two
things to confirm: that `kysely-postgres-js`'s peer dependency on `postgres`
does not drag postgres.js into the tree despite our passing a `Bun.SQL`, and
that Better Auth's CLI-generated schema applies cleanly through it. If either
fails, the fallback is Better Auth's documented `pg.Pool` config — a two-line
change at that point, at the cost of a second pool and the `CLAUDE.md` conflict.

Row types are written per query rather than inferred from a schema. Plain SQL
migration files are also easier for a self-hoster to debug when one fails on
their machine than a generated diff.
