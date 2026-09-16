import { describe, expect, test } from "bun:test";
import { accountTopic, message, MESSAGE_TYPES, parseMessage } from "./wire";

/**
 * The browser end of the wire, which is where a socket payload stops being untrusted input
 * (ADR-0006). The server end is covered by the socket integration tests.
 */
describe("parseMessage", () => {
  test("accepts every message the server can send", () => {
    for (const type of MESSAGE_TYPES) {
      const listId = "11111111-1111-4111-8111-111111111111";

      const parsed = parseMessage(JSON.stringify(message(type, listId)));

      expect(parsed).toEqual({ type, data: { listId } });
    }
  });

  test("drops a payload whose type is not one the client knows", () => {
    const payload = JSON.stringify({ type: "list:burn", data: { listId: "11111111-1111-4111-8111-111111111111" } });

    expect(parseMessage(payload)).toBeUndefined();
  });

  test("drops a listId that is not an id, rather than refetching whatever it names", () => {
    expect(parseMessage(JSON.stringify({ type: "list:rename", data: { listId: "../../etc" } }))).toBeUndefined();
  });

  test("drops a payload that is not JSON at all, since a socket frame can be anything", () => {
    expect(parseMessage("not json")).toBeUndefined();
    expect(parseMessage(new ArrayBuffer(4))).toBeUndefined();
  });
});

test("a topic names exactly one Account, which is the only topic anyone subscribes to", () => {
  expect(accountTopic("abc")).toBe("account:abc");
});
