# Anonymous Accounts are real server-side Accounts

The obvious design is "anonymous users keep lists in localStorage; accounts and
sharing come later." We rejected it: it means two storage backends, two data
paths, and a localStorage-to-server migration to write later — the app built
twice.

Instead, the server creates a real Account on first visit and hands back a
session cookie. An Anonymous Account owns Lists, syncs across the WebSocket and
can share immediately. Registering later attaches an email to the Account that
already exists; nothing migrates, because nothing moved. Better Auth's Anonymous
plugin provides this directly, with an `onLinkAccount` hook for the upgrade.

## Consequences

Every visitor creates a row, so anonymous Accounts that never return need
reaping. An Anonymous Account lives in one cookie on one device: clearing it
loses the Lists permanently, with no recovery path. See ADR-0004 for what that
does to the Lists they owned.
