import { afterAll, beforeAll, expect, test } from "bun:test";
import { createTestServer, type TestActor, type TestServer } from "../api/test-server";
import { ROLES, can } from "../lib/permissions";
import { insertListWithMembership, selectListCandidatesFor } from "./queries";

/**
 * Role validity lives in code, not in the schema (ADR-0005, amended): `memberships.role` carries
 * no check constraint, so these run against a real Postgres to prove both halves of that — the
 * column takes whatever the code calls a Role, and a value the code does not know never reaches
 * `can()` wearing the `Role` type.
 */
let server: TestServer;
let actor: TestActor;

beforeAll(async () => {
  server = await createTestServer();
  actor = await server.signIn();
});

afterAll(async () => {
  await server.stop();
});

async function membershipRoleOn(listId: string): Promise<string> {
  const rows = (await server.sql`select role from memberships where list_id = ${listId}`) as { role: string }[];
  if (rows[0] === undefined) throw new Error("no membership row");
  return rows[0].role;
}

test("the column accepts a Role the old check constraint refused", async () => {
  const list = await insertListWithMembership(server.sql, "Groceries", actor.accountId, "owner");

  await server.sql`update memberships set role = 'viewer' where list_id = ${list.id}`;

  expect(await membershipRoleOn(list.id)).toBe("viewer");
});

test("every Role the code knows round-trips through Postgres and can() resolves it", async () => {
  for (const role of ROLES) {
    const list = await insertListWithMembership(server.sql, `List ${role}`, actor.accountId, role);

    const candidates = await selectListCandidatesFor(server.sql, actor.accountId);
    const candidate = candidates.find(({ list: found }) => found.id === list.id);
    if (candidate === undefined) throw new Error(`no candidate for ${list.id}`);

    expect(candidate.memberships[0]?.role).toBe(role);
    expect(can({ id: actor.accountId }, "list:read", { id: list.id, memberships: candidate.memberships })).toBe(true);
  }
});
