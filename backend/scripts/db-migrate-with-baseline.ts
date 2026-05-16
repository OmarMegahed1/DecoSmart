/**
 * Keeps existing data: if the database already matches migrations 0000–0002 but
 * `drizzle.__drizzle_migrations` is empty or behind, inserts a baseline row for 0002
 * so `migrate` only applies 0003 (idempotent renames + enum).
 *
 * Usage: `npx tsx scripts/db-migrate-with-baseline.ts`
 * Requires DATABASE_URL (see backend/.env).
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

async function main() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error("DATABASE_URL is not set (load backend/.env).");
  }

  const migrationsFolder = path.join(process.cwd(), "src", "db", "migrations");
  const meta = readMigrationFiles({ migrationsFolder });
  const journal = JSON.parse(
    fs.readFileSync(path.join(migrationsFolder, "meta", "_journal.json"), "utf8")
  ) as { entries: Array<{ tag: string; when: number }> };

  if (journal.entries.length < 4 || meta.length < 4) {
    throw new Error("Expected at least 4 migrations in journal (0000–0003).");
  }

  const meta0002 = meta[2];
  const meta0003 = meta[3];

  const pool = new Pool({ connectionString: url });
  const db = drizzle(pool);

  const userRel = await pool.query<{ exists: boolean }>(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'user'
    ) AS exists
  `);
  const userTableExists = Boolean(userRel.rows[0]?.exists);

  let maxCreated: number | null = null;
  try {
    const m = await pool.query<{ m: string | null }>(`
      SELECT max(created_at)::text AS m FROM drizzle.__drizzle_migrations
    `);
    maxCreated = m.rows[0]?.m != null ? Number(m.rows[0].m) : null;
  } catch {
    maxCreated = null;
  }

  if (!userTableExists) {
    console.log("No public.user table — running full migration from 0000.");
    await migrate(db, { migrationsFolder });
    await pool.end();
    console.log("Migrations complete.");
    return;
  }

  const userCols = await pool.query<{ column_name: string }>(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user'
    AND column_name IN ('email_verified','emailVerified','created_at','createdAt')
  `);
  const names = new Set(userCols.rows.map((r) => r.column_name));
  const hasOldUserCols = names.has("emailVerified") || names.has("createdAt");
  const hasNewUserCols = names.has("email_verified") && names.has("created_at");

  const statusRow = await pool.query<{ udt_name: string }>(`
    SELECT udt_name::text FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'cad_jobs' AND column_name = 'status'
  `);
  const statusUdt = statusRow.rows[0]?.udt_name;

  const schemaMatches0003 = hasNewUserCols && statusUdt === "cad_job_status";

  if (schemaMatches0003) {
    if (maxCreated != null && maxCreated >= meta0003.folderMillis) {
      console.log("Database already at 0003 (schema + migration journal). Nothing to do.");
      await pool.end();
      return;
    }
    await pool.query(`CREATE SCHEMA IF NOT EXISTS drizzle`);
    await pool.query(`CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )`);
    await pool.query(
      `INSERT INTO drizzle.__drizzle_migrations ("hash", "created_at") VALUES ($1, $2)`,
      [meta0003.hash, meta0003.folderMillis]
    );
    console.log("Schema already matched 0003; recorded migration 0003 in __drizzle_migrations.");
    await pool.end();
    return;
  }

  if (hasOldUserCols && (maxCreated == null || maxCreated < meta0002.folderMillis)) {
    await pool.query(`CREATE SCHEMA IF NOT EXISTS drizzle`);
    await pool.query(`CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )`);
    await pool.query(
      `INSERT INTO drizzle.__drizzle_migrations ("hash", "created_at") VALUES ($1, $2)`,
      [meta0002.hash, meta0002.folderMillis]
    );
    console.log(
      "Inserted baseline row for 0002 (assuming 0000–0002 are already applied). Applying pending migrations…"
    );
  }

  await migrate(db, { migrationsFolder });
  await pool.end();
  console.log("Migrations complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
