import { SQL } from "bun";
import { createAuth } from "./auth";

/**
 * Config entry point for `@better-auth/cli generate` only — it introspects a live database and
 * emits the SQL we commit as a migration (ADR-0007). Run it under Bun, since it imports `bun`:
 *
 *   docker compose up -d postgres
 *   DATABASE_URL=... bunx --bun @better-auth/cli generate --config src/auth/auth-cli.ts \
 *     --output migrations/0002_better_auth.sql -y
 */
export const auth = createAuth({
  sql: new SQL(process.env.DATABASE_URL!),
  secret: "cli-only-secret",
  publicUrl: new URL(process.env.PUBLIC_URL ?? "http://localhost:3000"),
});
