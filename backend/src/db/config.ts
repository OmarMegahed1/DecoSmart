import * as dotenv from "dotenv";
import path from "path";

// Load .env from backend root whether the process is started from repo root or backend/
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
if (!process.env.DATABASE_URL) {
  dotenv.config({ path: path.resolve(process.cwd(), "backend", ".env") });
}

function required(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
}

const defaultCorsOrigins =
  "http://localhost:3000,http://localhost:3001,http://localhost:8081,http://localhost:8082";

const corsOrigins = (process.env.CORS_ORIGINS ?? defaultCorsOrigins)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const isDev = (process.env.NODE_ENV ?? "development") === "development";

function tryOrigin(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/** Same host as `BETTER_AUTH_URL` so password-reset `redirectTo` to `/reset-mobile-bridge` is allowed. */
const authPublicOrigin = tryOrigin(process.env.BETTER_AUTH_URL ?? "http://localhost:4000");

/** HTTP origins (CORS) plus Expo deep-link schemes for Better Auth `trustedOrigins`. */
const authTrustedOrigins = [
  ...corsOrigins,
  ...(authPublicOrigin && !corsOrigins.includes(authPublicOrigin) ? [authPublicOrigin] : []),
  // App scheme (see mobile app.json `expo.scheme`)
  "decor-ai://",
  "decor-ai://*",
  // Expo Go / dev client — use only in development (Better Auth docs)
  ...(isDev ? (["exp://", "exp://**"] as const) : []),
  // Optional extra origins (comma-separated), e.g. staging schemes
  ...(process.env.AUTH_TRUSTED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
];

export const config = {
  port: parseInt(process.env.PORT ?? "4000", 10),
  nodeEnv: process.env.NODE_ENV ?? "development",
  isDev,

  corsOrigins,
  authTrustedOrigins,

  database: {
    url: required("DATABASE_URL"),
  },

  worldlabs: {
    apiKey: required("WORLDLABS_API_KEY"),
    baseUrl: "https://api.worldlabs.ai/marble/v1",
  },

  /** Kaggle notebook (Flask + ngrok) — DXF processing; AI runs on GPU there. */
  cadPipeline: {
    url: process.env.CAD_PIPELINE_URL ?? "",
    timeoutMs: parseInt(process.env.CAD_PIPELINE_TIMEOUT_MS ?? "180000", 10),
  },

  /** Max images to upload to WorldLabs from a single /api/upload (matches generate cap). */
  maxUploadVariants: Math.min(
    4,
    Math.max(1, parseInt(process.env.UPLOAD_MAX_VARIANTS ?? "4", 10))
  ),

  auth: {
    secret: required("BETTER_AUTH_SECRET"),
    url: process.env.BETTER_AUTH_URL ?? "http://localhost:4000",
  },
};
