# The WebSocket carries invalidation, not data

A write publishes `{ listId }` to a per-List topic using `Bun.serve`'s native
pub/sub (`ws.subscribe("list:<id>")` / `server.publish(...)`). Clients holding
that List refetch it over HTTP. The socket carries no rows and guarantees no
ordering.

This makes staleness structurally impossible: any message, duplicated, delayed
or out of order, results in fresh data, and reconnect handling is "invalidate
everything and refetch." A replication-stream socket would be more efficient but
inherits silent-staleness on a dropped message and needs gap detection — real
protocol work in exchange for kilobytes, on lists of tens of items.

## Consequences

Writes must publish through a single function rather than scattered
`server.publish` calls, so that fanning out across app replicas later (via
Postgres `LISTEN/NOTIFY`) is one change. In-process pub/sub only reaches clients
on the same instance, which is fine for a single-instance homelab deploy.

Upgrading to patch-carrying messages later is additive: add a per-List version
counter and send rows alongside; the client still ultimately trusts HTTP.
