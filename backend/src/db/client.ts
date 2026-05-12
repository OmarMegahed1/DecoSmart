import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { config } from "./config";
import * as schema from "./schema";

/**
 * Hosted Postgres (Neon, Supabase, RDS) requires TLS. `sslmode=require` in DATABASE_URL
 * must not be paired with `ssl: false` — that yields flaky / terminated connections.
 *
 * `DATABASE_SSL=false` forces TLS off for local Postgres without sslmode in the URL.
 */
function resolvePgSsl(connectionString: string): false | { rejectUnauthorized: boolean } {
  const lower = connectionString.toLowerCase();
  const env = process.env.DATABASE_SSL?.trim().toLowerCase();
  if (env === "false") return false;
  if (env === "true") return { rejectUnauthorized: false };

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

const pool = new Pool({
  connectionString: config.database.url,
  ssl: resolvePgSsl(config.database.url),
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: parseInt(process.env.DATABASE_POOL_CONNECTION_TIMEOUT_MS ?? "15000", 10),
  keepAlive: true,
});

pool.on("error", (err) => {
  console.error("PostgreSQL pool error:", err);
});

export const db = drizzle(pool, { schema });

export type Database = typeof db;
