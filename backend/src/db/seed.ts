/**
 * Seeds a dev user into the database for local development.
 * Run with: npx tsx src/db/seed.ts
 */
import * as dotenv from "dotenv";
dotenv.config();

import { db } from "./client";
import { user } from "./schema";
import { eq } from "drizzle-orm";

async function seed() {
  const DEV_ID = "dev-user-id";

  const existing = await db.select().from(user).where(eq(user.id, DEV_ID)).limit(1);

  if (existing.length > 0) {
    console.log("✅ Dev user already exists, skipping.");
    process.exit(0);
  }

  await db.insert(user).values({
    id: DEV_ID,
    name: "Dev User",
    email: "dev@localhost",
    emailVerified: false as unknown as Date,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  console.log("✅ Dev user seeded successfully.");
  process.exit(0);
}

seed().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
