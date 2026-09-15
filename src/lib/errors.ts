import type { Permission } from "./permissions";

/**
 * The expected failures of a domain function, carried as values (CONVENTIONS.md, "Errors are
 * values"). They are mapped to HTTP status codes in exactly one place, `statusFor` in
 * `src/api/http.ts`, so adding a variant here makes TypeScript name the spot that has not
 * handled it.
 *
 * `not_found` covers a List an Account has no Membership on: it cannot see the List at all
 * (CONTEXT.md, "Membership"), so it is never told that one exists. `forbidden` is for a Member
 * who can see the List but lacks the Permission for this action.
 */
export type AppError =
  | { kind: "unauthenticated" }
  | { kind: "not_found" }
  | { kind: "forbidden"; permission: Permission }
  | { kind: "invalid_request"; issues: RequestIssue[] };

export type RequestIssue = { path: string; message: string };
