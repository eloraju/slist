import { z } from "zod";
import type { AppError, RequestIssue } from "../lib/errors";
import { err, fromPromise, ok, type Result } from "../lib/result";

/**
 * The one place an error `kind` becomes a status code (CONVENTIONS.md, "Errors are values"). The
 * `never` assignment is the point of it: a new variant fails to compile here rather than
 * silently becoming a 500 somewhere.
 */
export function statusFor(error: AppError): number {
  switch (error.kind) {
    case "unauthenticated":
      return 401;
    case "forbidden":
      return 403;
    case "not_found":
      return 404;
    case "invalid_request":
      return 400;
    default: {
      const unhandled: never = error;
      throw new Error(`unhandled error kind: ${JSON.stringify(unhandled)}`);
    }
  }
}

/** A domain `Result` as a response. A `null` value means the action left nothing to return. */
export function respond<T>(result: Result<T, AppError>, status = 200): Response {
  if (!result.ok) {
    return Response.json({ error: result.error.kind, ...detailsOf(result.error) }, { status: statusFor(result.error) });
  }
  if (result.value === null) return new Response(null, { status: 204 });
  return Response.json(result.value, { status });
}

/** An id in a path is untrusted input like any other, so it is parsed, not cast. */
const idSchema = z.uuid();

export function parseId(value: string | undefined, name: string): Result<string, AppError> {
  const parsed = idSchema.safeParse(value);
  if (!parsed.success) return err({ kind: "invalid_request", issues: [{ path: name, message: "not an id" }] });
  return ok(parsed.data);
}

export async function parseBody<T>(req: Request, schema: z.ZodType<T>): Promise<Result<T, AppError>> {
  // A body that is not JSON at all is a client bug, not a crash: `req.json()` throws, so it is
  // wrapped at its boundary.
  const body = await fromPromise(req.json() as Promise<unknown>, () => null);
  if (!body.ok) return err({ kind: "invalid_request", issues: [{ path: "", message: "expected a JSON body" }] });

  const parsed = schema.safeParse(body.value);
  if (!parsed.success) return err({ kind: "invalid_request", issues: issuesOf(parsed.error) });
  return ok(parsed.data);
}

function issuesOf(error: z.ZodError): RequestIssue[] {
  return error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }));
}

function detailsOf(error: AppError): Record<string, unknown> {
  return error.kind === "invalid_request" ? { issues: error.issues } : {};
}
