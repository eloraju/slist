import type { SQL } from "bun";
import { parseRole, type Membership, type Role } from "../lib/permissions";

/**
 * Every line of SQL about Lists and Memberships, and no decisions (CONVENTIONS.md, "Where logic
 * lives"). Rows come back in the domain's shape so that snake_case stops at this file.
 */
export type ListRecord = { id: string; name: string; createdAt: string };

export type ListWithMemberships = { list: ListRecord; memberships: Membership[] };

type ListRow = { id: string; name: string; created_at: Date };
type MembershipRow = { list_id: string; account_id: string; role: string };

/**
 * The List and its creator's Membership commit together: a List that exists with nobody able to
 * see it would be unreachable forever, since only `can()` grants access and it reads Memberships.
 *
 * Which Role the creator gets is the domain's decision, so it arrives as an argument — and as a
 * `Role`, which a typo could not be.
 */
export async function insertListWithMembership(
  sql: SQL,
  name: string,
  accountId: string,
  role: Role,
): Promise<ListRecord> {
  const row = (await sql.begin(async (tx) => {
    const [created] = (await tx`
      insert into lists (name) values (${name})
      returning id, name, created_at
    `) as ListRow[];
    if (created === undefined) throw new Error("insert into lists returned no row");

    await tx`
      insert into memberships (list_id, account_id, role)
      values (${created.id}, ${accountId}, ${role})
    `;
    return created;
  })) as unknown as ListRow;

  return toListRecord(row);
}

export async function selectListWithMemberships(sql: SQL, listId: string): Promise<ListWithMemberships | undefined> {
  const [list] = (await sql`select id, name, created_at from lists where id = ${listId}`) as ListRow[];
  if (list === undefined) return undefined;

  const memberships = (await sql`
    select list_id, account_id, role from memberships where list_id = ${listId}
  `) as MembershipRow[];

  return { list: toListRecord(list), memberships: memberships.map(toMembership) };
}

/**
 * The Lists this Account has a Membership on, each with all of its Memberships, as candidates for
 * `listsVisibleTo` to judge. The `where` clause scopes the fetch; it does not decide visibility —
 * that is `can()`'s job, and this function makes no decisions (CONVENTIONS.md).
 *
 * No `order by`: the server orders nothing, Lists included. The client sorts what it renders.
 */
export async function selectListCandidatesFor(sql: SQL, accountId: string): Promise<ListWithMemberships[]> {
  const rows = (await sql`
    select lists.id, lists.name, lists.created_at, memberships.list_id, memberships.account_id, memberships.role
    from lists
    join memberships on memberships.list_id = lists.id
    where lists.id in (select list_id from memberships where account_id = ${accountId})
  `) as (ListRow & MembershipRow)[];

  const candidates = new Map<string, ListWithMemberships>();
  for (const row of rows) {
    const candidate = candidates.get(row.id) ?? { list: toListRecord(row), memberships: [] };
    candidate.memberships.push(toMembership(row));
    candidates.set(row.id, candidate);
  }

  return [...candidates.values()];
}

export async function updateListName(sql: SQL, listId: string, name: string): Promise<ListRecord | undefined> {
  const [row] = (await sql`
    update lists set name = ${name}, updated_at = now()
    where id = ${listId}
    returning id, name, created_at
  `) as ListRow[];

  return row === undefined ? undefined : toListRecord(row);
}

/** Items and Memberships go with the List through `on delete cascade`. */
export async function deleteListById(sql: SQL, listId: string): Promise<void> {
  await sql`delete from lists where id = ${listId}`;
}

function toListRecord(row: ListRow): ListRecord {
  return { id: row.id, name: row.name, createdAt: row.created_at.toISOString() };
}

/**
 * A row comes back as text, and nothing in the schema says which Roles exist (ADR-0005, amended),
 * so the Role is narrowed here rather than asserted. An unrecognised value is a violated
 * invariant — someone wrote a Role by hand, or an older image is reading a newer database — and a
 * query function cannot decide what to do about it, so it throws (CONVENTIONS.md, "Errors are
 * values"). The alternative is worse: casting hands `can()` a Role that is not one, and the app
 * fails somewhere that never mentions the row.
 */
function toMembership(row: MembershipRow): Membership {
  const role = parseRole(row.role);
  if (role === undefined) {
    throw new Error(`membership (${row.list_id}, ${row.account_id}) has an unknown role ${JSON.stringify(row.role)}`);
  }

  return { listId: row.list_id, accountId: row.account_id, role };
}
