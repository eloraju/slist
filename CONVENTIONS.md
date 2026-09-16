# Conventions

Rules for anyone, human or agent, writing code in this repo. Formatting is not
here: it lives in `.prettierrc` and `eslint.config.js` and is applied on save.
What follows is the part a formatter cannot enforce.

The domain vocabulary is in [`CONTEXT.md`](./CONTEXT.md) — use those terms in
names, types and test descriptions. The decisions behind the architecture are in
[`docs/adr/`](./docs/adr/).

## Functions read as instructions

A larger function should read as a sequence of named steps. Extract a function
when it gives a step a name that makes the caller clearer:

```ts
assertCanEditList(actor, list);   // a step, named
consumeInvite(invite);            // a step, named
```

Extract nothing that only renames an expression. `isChecked(item)` is
`item.checked` wearing a hat: it adds a file to open and tells the reader
nothing new.

The test is the **caller**, not the callee. A three-line function that makes its
caller read as instructions earns its place; a one-line wrapper that does not,
does not.

## Errors are values

Expected failures are returned as `Result<T, E>` from `src/lib/result.ts`. These
are outcomes the caller must handle: not found, permission denied, validation
failed, conflict, invite expired.

```ts
const list = await findList(listId);
if (!list.ok) return list;   // propagate
```

`if (!x.ok) return x;` is this codebase's `?` operator. Async is
`Promise<Result<T, E>>` — await it, then narrow.

Throw for conditions the caller cannot handle: a violated invariant, a bug, an
unreachable branch. Postgres being down is a crash, not a `Result`.

Errors are discriminated unions with a `kind`, mapped to HTTP status codes in
exactly one place, exhaustively. Adding a variant then makes TypeScript name the
place that has not handled it.

Code that throws — Better Auth, the Postgres driver — is wrapped at its boundary
with `fromPromise` so it enters the codebase as a value.

The discriminator word tells you which side of the boundary you are on:
`AppError` and every other internal union uses `kind`; messages on the wire use
`type` (`src/lib/wire.ts`). Seeing one or the other tells a reader whether they
are looking at a domain value or at a protocol payload.

## Where logic lives

Three layers, I/O at the edges:

- **Route handlers** parse input with Zod, call one domain function, and map its
  `Result` to a response. Nothing else.
- **Domain functions** hold the decisions. They call query functions and return
  `Result`.
- **Query functions** hold every line of SQL and make no decisions.

The **pure core** — `can()`, Zod schemas, sort comparators, expiry checks — takes
data and returns data, touching nothing else. Keep it growing: logic that moves
into the pure core becomes testable in milliseconds.

## Tests

Tests come first, and you show them **red** for the right reason before writing
the implementation. A test that passes before the implementation exists is
testing nothing.

- Every pure-core function has unit tests.
- Every endpoint has an integration test for its happy path and one for a denied
  permission, run against a real Postgres.
- UI is untested for now, deliberately.

Tests run against real infrastructure. A mocked database proves the mock was
called. There is no mocking framework in this repo, and adding one is a design
discussion, not a step in a ticket.

When a test blocks you, the test may be wrong — say so and fix it as its own
change, called out as such. Changing a test and making it pass in one step
hides the only signal the test had.

## Comments

Comments carry the **why**: the constraint, the trade-off, the gotcha. The code
already says what it does, and a comment restating it goes stale silently.

```ts
// Better Auth needs its own tables; its CLI generates this SQL (ADR-0007).
```

Where a decision has an ADR, name the ADR rather than re-explaining it.

## Commits

Conventional commits: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`.
One logical change per commit.

## Deferred on purpose

- **Biome** replaces Prettier and ESLint once the project is running. Prettier
  now because it already formats on save.
- **`Option<T>`** stays out. TypeScript's `T | undefined` under `strictNullChecks`
  is compiler-enforced and costs no ceremony; `Result` exists because typed
  errors have no such equivalent.
