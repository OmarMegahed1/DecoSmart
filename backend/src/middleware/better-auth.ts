import { betterAuth } from "better-auth";
import { expo } from "@better-auth/expo";
import { Pool } from "pg";
import { config } from "../db/config";
import { sendPasswordResetEmail } from "../utils/passwordResetEmail";

// Better Auth manages its own tables (user, session, account, verification)
// using its built-in pg adapter — no Drizzle schema mapping needed for auth tables.
const pool = new Pool({ connectionString: config.database.url });

export const auth = betterAuth({
  database: pool,

  baseURL: config.auth.url,
  basePath: "/auth",
  secret: config.auth.secret,

  /** When "remember me" is checked, sliding session up to 30 days; when unchecked, ~1 day (Better Auth default). */
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
  },

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    /** Invalidate other sessions after a successful reset (recommended). */
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      void sendPasswordResetEmail(user.email, url).catch((err) => {
        console.error("[sendResetPassword] failed:", err);
      });
    },
  },

  trustedOrigins: config.authTrustedOrigins,

  plugins: [expo()],
});

export type Auth = typeof auth;
