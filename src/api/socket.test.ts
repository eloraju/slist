import { afterAll, beforeAll, expect, test } from "bun:test";
import { message, type MessageType } from "../lib/wire";
import { createTestServer, type TestActor, type TestServer } from "./test-server";

/**
 * The socket end of every write, against a real Postgres and a real WebSocket client
 * (CONVENTIONS.md, "Tests"). What is asserted is ADR-0006's promise: a message names the write
 * and the List it happened to, carries no values, and reaches exactly the Accounts that may read
 * that List.
 */
let server: TestServer;

beforeAll(async () => {
  server = await createTestServer();
});

afterAll(async () => {
  await server.stop();
});

async function call(method: string, path: string, actor: TestActor, body?: unknown): Promise<Response> {
  const response = await fetch(`${server.url}${path}`, {
    method,
    headers: {
      cookie: actor.cookie,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  expect(response.status).toBeLessThan(400);
  return response;
}

async function createList(actor: TestActor, name = "Groceries"): Promise<string> {
  const created = (await (await call("POST", "/api/lists", actor, { name })).json()) as { id: string };
  return created.id;
}

async function createItem(actor: TestActor, listId: string, name = "Milk"): Promise<string> {
  const created = (await (await call("POST", `/api/lists/${listId}/items`, actor, { name })).json()) as { id: string };
  return created.id;
}

/** An Editor Membership, the Role an Invite will grant in a later phase. */
async function addEditor(listId: string): Promise<TestActor> {
  const editor = await server.signIn();
  await server.sql`insert into memberships (list_id, account_id, role) values (${listId}, ${editor.accountId}, 'editor')`;
  return editor;
}

/**
 * The security case, and the analogue of the denied-permission test every endpoint has. It asserts
 * the silence together with a Member's message on the same write, so it cannot pass because
 * nothing was published at all.
 */
test("a non-Member's socket receives nothing", async () => {
  const owner = await server.signIn();
  const stranger = await server.signIn();
  const listId = await createList(owner, "Private");
  const ownersSocket = await server.openSocket(owner);
  const strangersSocket = await server.openSocket(stranger);

  await call("POST", `/api/lists/${listId}/items`, owner, { name: "Milk" });

  expect(await ownersSocket.next()).toEqual(message("item:create", listId));
  expect(strangersSocket.received).toEqual([]);
  ownersSocket.close();
  strangersSocket.close();
});

/**
 * The Memberships are gone by the time anyone could be asked who to notify, which is why
 * `deleteList` returns the rows it removed rather than `null` (ADR-0006).
 */
test("list:delete reaches every former Member", async () => {
  const owner = await server.signIn();
  const listId = await createList(owner, "Shared");
  const editor = await addEditor(listId);
  const ownersSocket = await server.openSocket(owner);
  const editorsSocket = await server.openSocket(editor);

  const response = await call("DELETE", `/api/lists/${listId}`, owner);

  // The browser client expects `null` from a delete, so the richer Result stops at the boundary.
  expect(response.status).toBe(204);
  expect(await ownersSocket.next()).toEqual(message("list:delete", listId));
  expect(await editorsSocket.next()).toEqual(message("list:delete", listId));
  ownersSocket.close();
  editorsSocket.close();
});

test("creating a List notifies its creator, who is the only Member there is", async () => {
  const owner = await server.signIn();
  const socket = await server.openSocket(owner);

  const listId = await createList(owner, "Fresh");

  expect(await socket.next()).toEqual(message("list:create", listId));
  socket.close();
});

test("renaming a List notifies every Member, because the index shows names", async () => {
  const owner = await server.signIn();
  const listId = await createList(owner, "Shopping");
  const editor = await addEditor(listId);
  const ownersSocket = await server.openSocket(owner);
  const editorsSocket = await server.openSocket(editor);

  await call("PATCH", `/api/lists/${listId}`, owner, { name: "Weekend shop" });

  // The message says which List was renamed and never what it is now called (ADR-0006).
  expect(await ownersSocket.next()).toEqual(message("list:rename", listId));
  expect(await editorsSocket.next()).toEqual(message("list:rename", listId));
  ownersSocket.close();
  editorsSocket.close();
});

/**
 * Every Item write, one row each, because the interesting part is the mapping from endpoint to
 * `type` and a test per endpoint would repeat the same six lines around it.
 */
const itemWrites: {
  write: string;
  type: MessageType;
  call: (actor: TestActor, listId: string, itemId: string) => Promise<Response>;
}[] = [
  {
    write: "adding an Item",
    type: "item:create",
    call: (actor, listId) => call("POST", `/api/lists/${listId}/items`, actor, { name: "Bread" }),
  },
  {
    write: "editing an Item",
    type: "item:update",
    call: (actor, listId, itemId) => call("PATCH", `/api/lists/${listId}/items/${itemId}`, actor, { name: "Oat milk" }),
  },
  {
    write: "removing an Item",
    type: "item:delete",
    call: (actor, listId, itemId) => call("DELETE", `/api/lists/${listId}/items/${itemId}`, actor),
  },
  {
    write: "setting Checked",
    type: "item:check",
    call: (actor, listId, itemId) =>
      call("PUT", `/api/lists/${listId}/items/${itemId}/checked`, actor, { checked: true }),
  },
  {
    write: "clearing the Checked Items",
    type: "item:clear_checked",
    call: (actor, listId) => call("POST", `/api/lists/${listId}/clear-checked`, actor, {}),
  },
  {
    write: "unchecking every Item",
    type: "item:uncheck_all",
    call: (actor, listId) => call("POST", `/api/lists/${listId}/uncheck-all`, actor, {}),
  },
];

test.each(itemWrites)("$write notifies every Member with $type", async ({ type, call: write }) => {
  const owner = await server.signIn();
  const listId = await createList(owner, "Shared");
  const editor = await addEditor(listId);
  const itemId = await createItem(owner, listId);
  const ownersSocket = await server.openSocket(owner);
  const editorsSocket = await server.openSocket(editor);

  await write(owner, listId, itemId);

  expect(await ownersSocket.next()).toEqual(message(type, listId));
  expect(await editorsSocket.next()).toEqual(message(type, listId));
  ownersSocket.close();
  editorsSocket.close();
});
