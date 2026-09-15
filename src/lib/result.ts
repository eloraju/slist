/**
 * Expected failures travel as values, not exceptions (CONVENTIONS.md, "Errors are values").
 *
 * `E` is deliberately unconstrained: errors here are discriminated unions with a `kind`, and
 * pinning `E extends { kind: string }` would block the one place a raw error is still useful —
 * a boundary that has not decided on its variants yet.
 */
export type Ok<T> = { readonly ok: true; readonly value: T };
export type Err<E> = { readonly ok: false; readonly error: E };
export type Result<T, E> = Ok<T> | Err<E>;

export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}

export function isOk<T, E>(result: Result<T, E>): result is Ok<T> {
  return result.ok;
}

export function isErr<T, E>(result: Result<T, E>): result is Err<E> {
  return !result.ok;
}

export function map<T, E, U>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  return isOk(result) ? ok(fn(result.value)) : result;
}

/**
 * `E | F` lets a chained step add a failure the first step could not produce, so the union of
 * error variants grows with the chain instead of being flattened to the first one.
 */
export function andThen<T, E, U, F>(result: Result<T, E>, fn: (value: T) => Result<U, F>): Result<U, E | F> {
  return isOk(result) ? fn(result.value) : result;
}

export function unwrapOr<T, E>(result: Result<T, E>, fallback: T): T {
  return isOk(result) ? result.value : fallback;
}

/**
 * The boundary wrapper for code that throws — Better Auth, the Postgres driver. `onThrow` takes
 * the thrown value as `unknown` because JavaScript can throw anything, and it is the caller, not
 * this function, that knows which domain error the failure means.
 */
export async function fromPromise<T, E>(promise: Promise<T>, onThrow: (cause: unknown) => E): Promise<Result<T, E>> {
  try {
    return ok(await promise);
  } catch (cause) {
    return err(onThrow(cause));
  }
}
