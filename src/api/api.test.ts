import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createTestServer, type TestActor, type TestServer } from "./test-server";

/**
 * Every endpoint has a happy path and a denied permission, against a real Postgres
 * (CONVENTIONS.md, "Tests"). Denial has two shapes: an Account with no Membership cannot see the
 * List at all, so it is told 404, while a Member who lacks the Permission is told 403.
 */
let server: TestServer;
let owner: TestActor;
let stranger: TestActor;

beforeAll(async () => {
  server = await createTestServer();
  owner = await server.signIn();
  stranger = await server.signIn();
});

afterAll(async () => {
  await server.stop();
});

type Json = Record<string, unknown>;

/** Bun's tagged template is untyped; the shape a test asserts on is the test's business. */
async function rows<T = Json>(query: unknown): Promise<T[]> {
  return (await query) as T[];
}

async function call(method: string, path: string, actor: TestActor | null, body?: unknown): Promise<Response> {
  return fetch(`${server.url}${path}`, {
    method,
    headers: {
      ...(actor ? { cookie: actor.cookie } : {}),
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function json(response: Response): Promise<Json> {
  return (await response.json()) as Json;
}

async function createList(actor: TestActor, name = "Groceries"): Promise<string> {
  const response = await call("POST", "/api/lists", actor, { name });
  expect(response.status).toBe(201);
  return (await json(response)).id as string;
}

async function createItem(actor: TestActor, listId: string, body: Json): Promise<Json> {
  const response = await call("POST", `/api/lists/${listId}/items`, actor, body);
  expect(response.status).toBe(201);
  return json(response);
}

/** An Editor Membership, the Role an Invite will grant in a later phase. */
async function addEditor(listId: string): Promise<TestActor> {
  const editor = await server.signIn();
  await rows(
    server.sql`insert into memberships (list_id, account_id, role) values (${listId}, ${editor.accountId}, 'editor')`,
  );
  return editor;
}

describe("POST /api/lists", () => {
  test("creates a List and an Owner Membership for the creator", async () => {
    const response = await call("POST", "/api/lists", owner, { name: "  Groceries  " });

    expect(response.status).toBe(201);
    const created = await json(response);
    expect(created.name).toBe("Groceries");
    const memberships = await rows(server.sql`select account_id, role from memberships where list_id = ${created.id}`);
    expect(memberships).toEqual([{ account_id: owner.accountId, role: "owner" }]);
  });

  test("rejects a nameless List", async () => {
    const response = await call("POST", "/api/lists", owner, { name: "   " });

    expect(response.status).toBe(400);
  });

  test("rejects a visitor with no session", async () => {
    const response = await call("POST", "/api/lists", null, { name: "Groceries" });

    expect(response.status).toBe(401);
  });
});

describe("GET /api/lists", () => {
  test("returns the Lists the Account is a Member of", async () => {
    const mine = await server.signIn();
    const listId = await createList(mine, "Mine");

    const response = await call("GET", "/api/lists", mine);

    expect(response.status).toBe(200);
    const body = await json(response);
    expect((body.lists as Json[]).map((list) => list.id)).toEqual([listId]);
  });

  test("shows nothing of another Account's Lists", async () => {
    await createList(owner, "Private");

    const response = await call("GET", "/api/lists", stranger);

    expect(response.status).toBe(200);
    expect((await json(response)).lists).toEqual([]);
  });
});

describe("GET /api/lists/:listId", () => {
  test("returns the List with its Items", async () => {
    const listId = await createList(owner, "Weekly shop");
    await createItem(owner, listId, { name: "Milk", quantity: 2, unit: "l" });

    const response = await call("GET", `/api/lists/${listId}`, owner);

    expect(response.status).toBe(200);
    const body = await json(response);
    expect((body.list as Json).name).toBe("Weekly shop");
    const items = body.items as Json[];
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ name: "Milk", quantity: 2, unit: "l", checked: false });
  });

  test("an Account with no Membership cannot see it at all", async () => {
    const listId = await createList(owner);

    const response = await call("GET", `/api/lists/${listId}`, stranger);

    expect(response.status).toBe(404);
  });

  test("rejects a listId that is not an id", async () => {
    const response = await call("GET", "/api/lists/not-an-id", owner);

    expect(response.status).toBe(400);
  });
});

describe("PATCH /api/lists/:listId", () => {
  test("renames the List", async () => {
    const listId = await createList(owner);

    const response = await call("PATCH", `/api/lists/${listId}`, owner, { name: " Weekly shop " });

    expect(response.status).toBe(200);
    expect((await json(response)).name).toBe("Weekly shop");
  });

  test("an Editor may rename the List", async () => {
    const listId = await createList(owner);
    const editor = await addEditor(listId);

    const response = await call("PATCH", `/api/lists/${listId}`, editor, { name: "Editor's name" });

    expect(response.status).toBe(200);
  });

  test("an Account with no Membership cannot rename it", async () => {
    const listId = await createList(owner);

    const response = await call("PATCH", `/api/lists/${listId}`, stranger, { name: "Theirs" });

    expect(response.status).toBe(404);
  });
});

describe("DELETE /api/lists/:listId", () => {
  test("deletes the List and its Items", async () => {
    const listId = await createList(owner);
    await createItem(owner, listId, { name: "Milk" });

    const response = await call("DELETE", `/api/lists/${listId}`, owner);

    expect(response.status).toBe(204);
    expect(await rows(server.sql`select id from lists where id = ${listId}`)).toEqual([]);
    expect(await rows(server.sql`select id from items where list_id = ${listId}`)).toEqual([]);
  });

  test("an Editor may not delete the List", async () => {
    const listId = await createList(owner);
    const editor = await addEditor(listId);

    const response = await call("DELETE", `/api/lists/${listId}`, editor);

    expect(response.status).toBe(403);
    expect(await rows(server.sql`select id from lists where id = ${listId}`)).toHaveLength(1);
  });
});

describe("POST /api/lists/:listId/items", () => {
  test("adds an Item with a quantity and a unit", async () => {
    const listId = await createList(owner);

    const response = await call("POST", `/api/lists/${listId}/items`, owner, {
      name: " Mince ",
      quantity: 0.5,
      unit: "kg",
      note: "lean",
    });

    expect(response.status).toBe(201);
    expect(await json(response)).toMatchObject({
      name: "Mince",
      quantity: 0.5,
      unit: "kg",
      note: "lean",
      checked: false,
    });
  });

  test("adds an Item with no quantity at all", async () => {
    const listId = await createList(owner);

    const created = await createItem(owner, listId, { name: "Milk" });

    expect(created).toMatchObject({ name: "Milk", quantity: null, unit: null, note: null });
  });

  test("rejects a unit with nothing to measure", async () => {
    const listId = await createList(owner);

    const response = await call("POST", `/api/lists/${listId}/items`, owner, { name: "Mince", unit: "kg" });

    expect(response.status).toBe(400);
  });

  test("an Account with no Membership may not add an Item", async () => {
    const listId = await createList(owner);

    const response = await call("POST", `/api/lists/${listId}/items`, stranger, { name: "Milk" });

    expect(response.status).toBe(404);
    expect(await rows(server.sql`select id from items where list_id = ${listId}`)).toEqual([]);
  });
});

describe("PATCH /api/lists/:listId/items/:itemId", () => {
  test("edits the name, the quantity, the unit and the note", async () => {
    const listId = await createList(owner);
    const item = await createItem(owner, listId, { name: "Milk" });

    const response = await call("PATCH", `/api/lists/${listId}/items/${item.id}`, owner, {
      name: "Oat milk",
      quantity: 2,
      unit: "l",
      note: "the barista one",
    });

    expect(response.status).toBe(200);
    expect(await json(response)).toMatchObject({
      name: "Oat milk",
      quantity: 2,
      unit: "l",
      note: "the barista one",
    });
  });

  test("clears the note and the quantity with null", async () => {
    const listId = await createList(owner);
    const item = await createItem(owner, listId, { name: "Milk", quantity: 2, unit: "l", note: "oat" });

    const response = await call("PATCH", `/api/lists/${listId}/items/${item.id}`, owner, {
      quantity: null,
      unit: null,
      note: null,
    });

    expect(response.status).toBe(200);
    expect(await json(response)).toMatchObject({ name: "Milk", quantity: null, unit: null, note: null });
  });

  test("leaves the fields the payload does not mention alone", async () => {
    const listId = await createList(owner);
    const item = await createItem(owner, listId, { name: "Milk", quantity: 2, unit: "l", note: "oat" });

    const response = await call("PATCH", `/api/lists/${listId}/items/${item.id}`, owner, { name: "Oat milk" });

    expect(await json(response)).toMatchObject({ name: "Oat milk", quantity: 2, unit: "l", note: "oat" });
  });

  test("refuses to toggle Checked — that is its own endpoint", async () => {
    const listId = await createList(owner);
    const item = await createItem(owner, listId, { name: "Milk" });

    const response = await call("PATCH", `/api/lists/${listId}/items/${item.id}`, owner, { checked: true });

    expect(response.status).toBe(400);
  });

  test("an Item on another List is not found", async () => {
    const listId = await createList(owner);
    const otherListId = await createList(owner, "Other");
    const item = await createItem(owner, listId, { name: "Milk" });

    const response = await call("PATCH", `/api/lists/${otherListId}/items/${item.id}`, owner, { name: "Moved" });

    expect(response.status).toBe(404);
  });

  test("an Account with no Membership may not edit an Item", async () => {
    const listId = await createList(owner);
    const item = await createItem(owner, listId, { name: "Milk" });

    const response = await call("PATCH", `/api/lists/${listId}/items/${item.id}`, stranger, { name: "Theirs" });

    expect(response.status).toBe(404);
  });
});

describe("DELETE /api/lists/:listId/items/:itemId", () => {
  test("removes the Item", async () => {
    const listId = await createList(owner);
    const item = await createItem(owner, listId, { name: "Milk" });

    const response = await call("DELETE", `/api/lists/${listId}/items/${item.id}`, owner);

    expect(response.status).toBe(204);
    expect(await rows(server.sql`select id from items where id = ${item.id}`)).toEqual([]);
  });

  test("an Account with no Membership may not remove an Item", async () => {
    const listId = await createList(owner);
    const item = await createItem(owner, listId, { name: "Milk" });

    const response = await call("DELETE", `/api/lists/${listId}/items/${item.id}`, stranger);

    expect(response.status).toBe(404);
    expect(await rows(server.sql`select id from items where id = ${item.id}`)).toHaveLength(1);
  });
});

describe("PUT /api/lists/:listId/items/:itemId/checked", () => {
  test("Checks an Item and un-Checks it again, leaving it on the List", async () => {
    const listId = await createList(owner);
    const item = await createItem(owner, listId, { name: "Milk" });

    const checked = await call("PUT", `/api/lists/${listId}/items/${item.id}/checked`, owner, { checked: true });
    expect(checked.status).toBe(200);
    expect(await json(checked)).toMatchObject({ id: item.id, checked: true });

    const unchecked = await call("PUT", `/api/lists/${listId}/items/${item.id}/checked`, owner, { checked: false });
    expect(await json(unchecked)).toMatchObject({ id: item.id, checked: false });
  });

  test("rejects a Checked state that is not a boolean", async () => {
    const listId = await createList(owner);
    const item = await createItem(owner, listId, { name: "Milk" });

    const response = await call("PUT", `/api/lists/${listId}/items/${item.id}/checked`, owner, { checked: "yes" });

    expect(response.status).toBe(400);
  });

  test("an Account with no Membership may not Check an Item", async () => {
    const listId = await createList(owner);
    const item = await createItem(owner, listId, { name: "Milk" });

    const response = await call("PUT", `/api/lists/${listId}/items/${item.id}/checked`, stranger, { checked: true });

    expect(response.status).toBe(404);
  });
});

describe("POST /api/lists/:listId/clear-checked", () => {
  test("removes the Checked Items and leaves the rest", async () => {
    const listId = await createList(owner);
    const milk = await createItem(owner, listId, { name: "Milk" });
    const bread = await createItem(owner, listId, { name: "Bread" });
    await call("PUT", `/api/lists/${listId}/items/${milk.id}/checked`, owner, { checked: true });

    const response = await call("POST", `/api/lists/${listId}/clear-checked`, owner, {});

    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({ removed: 1 });
    const remaining = await rows(server.sql`select id from items where list_id = ${listId}`);
    expect(remaining).toEqual([{ id: bread.id }]);
  });

  test("an Account with no Membership may not clear a List", async () => {
    const listId = await createList(owner);
    await createItem(owner, listId, { name: "Milk" });

    const response = await call("POST", `/api/lists/${listId}/clear-checked`, stranger, {});

    expect(response.status).toBe(404);
    expect(await rows(server.sql`select id from items where list_id = ${listId}`)).toHaveLength(1);
  });
});

describe("POST /api/lists/:listId/uncheck-all", () => {
  test("un-Checks every Checked Item", async () => {
    const listId = await createList(owner);
    const milk = await createItem(owner, listId, { name: "Milk" });
    await createItem(owner, listId, { name: "Bread" });
    await call("PUT", `/api/lists/${listId}/items/${milk.id}/checked`, owner, { checked: true });

    const response = await call("POST", `/api/lists/${listId}/uncheck-all`, owner, {});

    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({ unchecked: 1 });
    const checked = await rows(server.sql`select id from items where list_id = ${listId} and checked`);
    expect(checked).toEqual([]);
  });

  test("rejects a body naming the Items to act on — the action is the whole List", async () => {
    const listId = await createList(owner);

    const response = await call("POST", `/api/lists/${listId}/uncheck-all`, owner, { itemIds: ["item-1"] });

    expect(response.status).toBe(400);
  });

  test("an Account with no Membership may not un-Check a List", async () => {
    const listId = await createList(owner);
    const milk = await createItem(owner, listId, { name: "Milk" });
    await call("PUT", `/api/lists/${listId}/items/${milk.id}/checked`, owner, { checked: true });

    const response = await call("POST", `/api/lists/${listId}/uncheck-all`, stranger, {});

    expect(response.status).toBe(404);
    expect(await rows(server.sql`select id from items where list_id = ${listId} and checked`)).toHaveLength(1);
  });
});
