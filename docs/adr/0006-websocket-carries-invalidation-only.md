# The WebSocket carries invalidation, not data

A client holds one WebSocket, subscribed to exactly one topic: `account:<id>`,
its own. A write publishes a typed message to the topic of every Account that
may read the affected List; those clients refetch over HTTP. The socket carries
no rows and guarantees no ordering.

This makes staleness structurally impossible: any message, duplicated, delayed
or out of order, results in fresh data, and reconnect handling is "invalidate
everything and refetch." A replication-stream socket would be more efficient but
inherits silent-staleness on a dropped message and needs gap detection — real
protocol work in exchange for kilobytes, on lists of tens of items.

## The message

Messages are a discriminated union validated by Zod at both ends, defined in
`src/lib/wire.ts`:

```ts
{ type: "item:check", data: { listId } }
```

`type` names the write that happened, from a closed set following the
`namespace:verb` shape `Permission` already uses. **`data` carries ids and never
values**: a rename message says which List was renamed, never what it is now
called. A client therefore *cannot* apply a message optimistically — it can only
decide what to refetch — which is this ADR's guarantee expressed as a type
rather than as a rule.

`type` is deliberately finer-grained than the two refetch behaviours a client
has today, because Phase 3's `membership:removed` needs genuinely different
handling: drop the List from view. Once one message type branches, all of them
should be distinguishable.

## One topic per Account, not one per List

A per-List topic cannot tell a client about a List created after its socket
opened, and would need re-subscription every time a Membership changes. A
per-Account topic has neither blind spot, because the *publisher* resolves
recipients at publish time.

Resolving them is a capability decision, so it goes through `can()` —
`memberships.filter(m => can({id: m.accountId}, "list:read", list))` — and not
through the Membership rows directly (ADR-0005). Today every Role holds
`list:read` and the two agree; the day one does not, this is a data leak rather
than a missing notification.

The cost is one Membership query and N publishes per write instead of one. At
household scale that is nothing, and the query is already needed.

## The socket is not the request channel

Everything the client *does* still goes over REST. Folding requests into the
socket — one channel, RPC-style — was considered and declined.

The guarantee at the top of this ADR depends on HTTP being a *separate* source
of truth: "any message results in fresh data" is only true if fetching is
reliable when the socket is not. Collapsing the channels means a dropped socket
is a dead app, and it re-opens the in-flight-write problem that ADR-0002
deliberately closed. It would also cost a self-hoster `curl` (ADR-0008), and
rewrite roughly 830 lines of transport and integration tests for no user-visible
change.

Deferring is cheap because the domain layer knows nothing about transport: an
RPC adapter later would be a *second caller* of `createList` and `addItem`, not
a rewrite of them.

## Consequences

Writes publish through a single function rather than scattered `server.publish`
calls, so that fanning out across app replicas later (via Postgres
`LISTEN/NOTIFY`) is one change. In-process pub/sub only reaches clients on the
same instance, which is fine for a single-instance homelab deploy.

The socket is strictly server-to-client. There is no `message` handler, so "the
client cannot tell the server anything over the socket" is a property of the
code rather than a convention.

Authors are **not** excluded from their own echo. Doing so would require a
client identity on every request and in every message, and the flicker it guards
against does not occur: the optimistic update already holds the server's answer,
and a refetch keeps the current rows on screen while it is in flight. This ADR's
upgrade path stays open if that turns out to be wrong.

Upgrading to patch-carrying messages later is additive: add a per-List version
counter and send rows alongside; the client still ultimately trusts HTTP.
