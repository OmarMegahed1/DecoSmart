/**
 * Idempotent: adds room_results.preview_png_b64 when missing.
 * Use when Neon (or any DB) was created before migration 0002_room_preview_png.sql.
 */
require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const { Client } = require("pg");

function sslForUrl(url) {
  if (!url) return false;
  const lower = url.toLowerCase();
  if (process.env.DATABASE_SSL === "false") return false;
  if (lower.includes("sslmode=disable")) return false;
  if (lower.includes("@localhost") || lower.includes("@127.0.0.1")) return false;
  return { rejectUnauthorized: false };
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL required");

  const client = new Client({ connectionString: url, ssl: sslForUrl(url) });
  await client.connect();
  try {
    await client.query(
      'ALTER TABLE "room_results" ADD COLUMN IF NOT EXISTS "preview_png_b64" text'
    );
    console.log("OK: room_results.preview_png_b64 column ensured");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("ensure-room-results-preview-png failed:", err);
  process.exit(1);
});
