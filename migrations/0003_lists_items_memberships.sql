-- Lists, their Memberships and their Items (CONTEXT.md).
--
-- There is deliberately no `position` column on items: Items have no inherent order, the server
-- never orders them, and sorting is the client's job. A column would be an invitation to start.
--
-- `memberships.role` is only ever read by `can()` (ADR-0005); the check constraint keeps the
-- column honest about the Roles that exist in code.

create table lists (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table memberships (
  list_id uuid not null references lists (id) on delete cascade,
  account_id text not null references "user" (id) on delete cascade,
  role text not null check (role in ('owner', 'editor')),
  created_at timestamptz not null default now(),
  primary key (list_id, account_id)
);

-- A List whose Owners have all gone keeps working (ADR-0004), so nothing here requires an Owner
-- to exist: an Ownerless List is a valid state, not a broken one.
create index memberships_account_id_idx on memberships (account_id);

create table items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references lists (id) on delete cascade,
  name text not null,
  -- Shopping quantities are approximate ("0.5 kg"), so a float is the right shape; nothing here
  -- is money, where the rounding would matter.
  quantity double precision check (quantity > 0),
  unit text,
  note text,
  checked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A unit with nothing to measure is not a quantity; the Zod schemas say the same thing at the
  -- edge, and the database refuses to hold the state they reject.
  constraint items_unit_needs_quantity check (unit is null or quantity is not null)
);

create index items_list_id_idx on items (list_id);
