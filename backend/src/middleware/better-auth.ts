import { betterAuth } from "better-auth";
import { expo } from "@better-auth/expo";
import { pool } from "../db/client";
import { env } from "../env";
import { sendPasswordResetEmail } from "../integrations/resend/passwordResetEmail";
import { sendAuthVerificationEmail } from "../integrations/resend/authVerificationEmail";

// Better Auth manages its own tables (user, session, account, verification)
// using its built-in pg adapter — same pool as Drizzle (`db/client.ts`).

export const auth = betterAuth({
  database: pool,

  baseURL: env.auth.url,
  basePath: "/auth",
  secret: env.auth.secret,

  /** Map user fields to snake_case columns (see `backend/src/db/schema.ts` `user` table). */
  user: {
    fields: {
      emailVerified: "email_verified",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
    changeEmail: {
      enabled: true,
    },
  },

  emailVerification: {
    sendVerificationEmail: async ({ user, url }) => {
      void sendAuthVerificationEmail(user.email, url).catch((err) => {
        console.error("[sendVerificationEmail] failed:", err);
      });
    },
  },

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

  trustedOrigins: env.authTrustedOrigins,

  plugins: [expo()],
});

export type Auth = typeof auth;
