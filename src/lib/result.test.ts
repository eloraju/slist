import { describe, expect, test } from "bun:test";

import type { Result } from "./result";
import { andThen, err, fromPromise, isErr, isOk, map, ok, unwrapOr } from "./result";

type NotFound = { kind: "not_found"; id: string };
type Denied = { kind: "denied" };

const notFound: NotFound = { kind: "not_found", id: "list-1" };

describe("ok", () => {
  test("carries the value on an ok branch", () => {
    const result = ok(42);

    expect(result.ok).toBe(true);
    expect(result.value).toBe(42);
  });
});

describe("err", () => {
  test("carries the error on an err branch", () => {
    const result = err(notFound);

    expect(result.ok).toBe(false);
    expect(result.error).toEqual(notFound);
  });
});

describe("isOk", () => {
  test("is true for ok and narrows to the value", () => {
    const result: Result<number, NotFound> = ok(1);

    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result.value).toBe(1);
  });

  test("is false for err", () => {
    expect(isOk(err(notFound))).toBe(false);
  });
});

describe("isErr", () => {
  test("is true for err and narrows to the error", () => {
    const result: Result<number, NotFound> = err(notFound);

    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error.kind).toBe("not_found");
  });

  test("is false for ok", () => {
    expect(isErr(ok(1))).toBe(false);
  });
});

describe("map", () => {
  test("applies the function to an ok value", () => {
    expect(map(ok(2), (n) => n * 3)).toEqual(ok(6));
  });

  test("is a no-op over an err", () => {
    let called = false;
    const result = map(err(notFound) as Result<number, NotFound>, (n) => {
      called = true;
      return n * 3;
    });

    expect(called).toBe(false);
    expect(result).toEqual(err(notFound));
  });
});

describe("andThen", () => {
  test("chains the next step on an ok value", () => {
    const result = andThen(ok("list-1"), (id) => ok(id.length));

    expect(result).toEqual(ok(6));
  });

  test("returns the err the next step produced", () => {
    const denied: Denied = { kind: "denied" };
    const result = andThen(ok("list-1"), (): Result<number, Denied> => err(denied));

    expect(result).toEqual(err(denied));
  });

  test("short-circuits on an err without calling the next step", () => {
    let called = false;
    const result = andThen(err(notFound) as Result<string, NotFound>, (id) => {
      called = true;
      return ok(id.length);
    });

    expect(called).toBe(false);
    expect(result).toEqual(err(notFound));
  });
});

describe("unwrapOr", () => {
  test("returns the value on an ok branch", () => {
    expect(unwrapOr(ok(7), 0)).toBe(7);
  });

  test("returns the fallback on an err branch", () => {
    expect(unwrapOr(err(notFound) as Result<number, NotFound>, 0)).toBe(0);
  });
});

describe("fromPromise", () => {
  test("wraps a resolved promise as ok", async () => {
    const result = await fromPromise(Promise.resolve("session"), () => notFound);

    expect(result).toEqual(ok("session"));
  });

  test("maps a thrown value into the caller's typed error", async () => {
    const boom = new Error("connection reset");
    const result = await fromPromise<string, NotFound>(Promise.reject(boom), (cause) => ({
      kind: "not_found",
      id: String(cause),
    }));

    expect(result).toEqual(err({ kind: "not_found", id: "Error: connection reset" }));
  });

  test("passes the thrown value through untouched, including non-Error throws", async () => {
    let seen: unknown = undefined;
    await fromPromise(Promise.reject("a string throw"), (cause) => {
      seen = cause;
      return notFound;
    });

    expect(seen).toBe("a string throw");
  });
});
