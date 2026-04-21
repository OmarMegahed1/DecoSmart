import { betterAuth } from "better-auth";
import { Pool } from "pg";
import { config } from "../db/config";

// Better Auth manages its own tables (user, session, account, verification)
// using its built-in pg adapter — no Drizzle schema mapping needed for auth tables.
const pool = new Pool({ connectionString: config.database.url });

export const auth = betterAuth({
  database: pool,

  baseURL: config.auth.url,
  basePath: "/auth",
  secret: config.auth.secret,

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
  },

  trustedOrigins: config.corsOrigins,
});

export type Auth = typeof auth;
