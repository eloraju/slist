# Postgres from the start, not SQLite

The project began with "start on SQLite, switch database later, Drizzle will
handle it." Drizzle does not: it has no dialect-agnostic table object, so
`sqliteTable` and `pgTable` are separate builders and a dialect switch rewrites
every table definition. Worse, the column mappings are representation changes,
not renames (SQLite has no boolean, no datetime, no uuid), so the switch is a
data migration too.

Since the deployment target is a `docker compose` file for people's homelabs,
Postgres is a container they were going to run anyway. We take it from day one
and drop portability as a goal entirely: no data-access abstraction built for
swapping, and dialect-specific features (`jsonb`, partial indexes, `timestamptz`,
`gen_random_uuid()`, `LISTEN/NOTIFY`) are fair game.

## Considered options

- **SQLite via `bun:sqlite`**: simplest single-file deploy, but the stated end
  goal was always a compose file, so Postgres costs nothing extra.
- **libSQL/Turso**: same `sqlite` dialect, networked and replicated, only the
  driver changes. The right answer *if* we had stayed on SQLite. Rejected
  because it is a hosted service, and self-hostability is the point.
