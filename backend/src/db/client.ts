import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "../env";
import * as schema from "./schema";

/**
 * Hosted Postgres (Neon, Supabase, RDS) requires TLS. `sslmode=require` in DATABASE_URL
 * must not be paired with `ssl: false` — that yields flaky / terminated connections.
 *
 * `DATABASE_SSL=false` forces TLS off for local Postgres without sslmode in the URL.
 */
function resolvePgSsl(connectionString: string): false | { rejectUnauthorized: boolean } {
  const lower = connectionString.toLowerCase();
  const sslEnv = env.database.sslRaw?.trim().toLowerCase();
  if (sslEnv === "false") return false;
  if (sslEnv === "true") return { rejectUnauthorized: false };

  if (lower.includes("sslmode=disable")) return false;
  if (
    lower.includes("sslmode=require") ||
    lower.includes("sslmode=verify-full") ||
    lower.includes("sslmode=verify-ca") ||
    lower.includes("sslmode=prefer")
  ) {
    return { rejectUnauthorized: false };
  }

  const isLocalHost =
    lower.includes("@localhost") ||
    lower.includes("@127.0.0.1") ||
    /[/@]localhost[:/]/.test(lower) ||
    /[/@]127\.0\.0\.1[:/]/.test(lower);

  if (isLocalHost) return false;

  return { rejectUnauthorized: false };
}

function createPool(): Pool {
  const pool = new Pool({
    connectionString: env.database.url,
    ssl: resolvePgSsl(env.database.url),
    max: env.database.poolMax,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: env.database.poolConnectionTimeoutMs,
    keepAlive: true,
  });

  pool.on("error", (err) => {
    console.error("PostgreSQL pool error:", err);
  });

  return pool;
}

/**
 * In dev, `tsx watch` re-executes this module on change; a naive `new Pool()` leaks
 * connections. Persist the pool on `globalThis` like `@epic-web/remember` (prod skips this).
 */
const globalForPool = globalThis as typeof globalThis & { __decorPgPool?: Pool };

/** Shared `pg` pool for Drizzle and Better Auth (one SSL/tuning setup; dev HMR singleton). */
export const pool = env.isProd
  ? createPool()
  : (globalForPool.__decorPgPool ??= createPool());

export const db = drizzle(pool, { schema });

export type Database = typeof db;
