/**
 * Single source of truth for configuration: load `.env`, validate with Zod, export `env` + helpers.
 * Do not read `process.env` elsewhere except drizzle.config.ts (CLI) and ad-hoc scripts.
 *
 * Production (`NODE_ENV=production`): stricter rules via `productionEnvRefinement` (secret length,
 * public `BETTER_AUTH_URL`, Resend, https). Development/test keep permissive defaults.
 */
import * as dotenv from "dotenv";
import path from "path";
import { z } from "zod";

/** Load `.env` from disk when present. In production, platforms usually inject env vars; a missing file is fine. */
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
if (!process.env.DATABASE_URL) {
  dotenv.config({ path: path.resolve(process.cwd(), "backend", ".env") });
}

/** Treat empty string as unset (common in `.env` files). */
function emptyToUndefined(val: unknown): unknown {
  if (val === undefined || val === null) return undefined;
  if (typeof val === "string" && val.trim() === "") return undefined;
  return val;
}

const optionalNonEmptyString = z.preprocess(emptyToUndefined, z.string().min(1).optional());

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

  PORT: z.coerce.number().int().positive().default(4000),

  DATABASE_URL: z
    .string()
    .min(1)
    .refine((u) => /^postgres(ql)?:\/\//i.test(u), {
      message: "DATABASE_URL must be a postgres:// or postgresql:// connection string",
    }),

  DATABASE_SSL: optionalNonEmptyString,
  DATABASE_POOL_CONNECTION_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),

  CORS_ORIGINS: z
    .string()
    .min(1, "Set CORS_ORIGINS to a comma-separated list of allowed browser origins (see .env.example)"),

  AUTH_TRUSTED_ORIGINS: z.string().optional().default(""),

  WORLDLABS_API_KEY: z.string().min(1, "WORLDLABS_API_KEY is required"),
  WORLDLABS_BASE_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),

  CAD_PIPELINE_URL: z.string().optional().default(""),
  CAD_PIPELINE_TIMEOUT_MS: z.coerce.number().int().positive().default(180_000),

  UPLOAD_MAX_VARIANTS: z.coerce.number().int().min(1).max(4).default(4),

  BETTER_AUTH_SECRET: z
    .string()
    .min(1, "BETTER_AUTH_SECRET is required (e.g. openssl rand -base64 32)"),

  BETTER_AUTH_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),

  RESEND_API_KEY: optionalNonEmptyString,
  RESEND_FROM: z.preprocess(emptyToUndefined, z.string().min(1).optional()),

  MOBILE_APP_SCHEME: z.string().optional().default("decor-ai"),
});

function truthyEnv(val: string | undefined): boolean {
  if (val == null) return false;
  const v = val.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function productionEnvRefinement(data: z.infer<typeof envSchema>, ctx: z.RefinementCtx): void {
  if (truthyEnv(process.env.REQUIRE_PRODUCTION_ENV) && data.NODE_ENV !== "production") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message:
        "REQUIRE_PRODUCTION_ENV is set: NODE_ENV must be production (set NODE_ENV=production on the host).",
      path: ["NODE_ENV"],
    });
  }

  if (data.NODE_ENV !== "production") {
    return;
  }

  if (data.BETTER_AUTH_SECRET.length < 32) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message:
        "BETTER_AUTH_SECRET must be at least 32 characters in production (e.g. openssl rand -base64 32).",
      path: ["BETTER_AUTH_SECRET"],
    });
  }

  if (data.BETTER_AUTH_URL === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message:
        "BETTER_AUTH_URL is required in production (public API URL, no trailing slash; use https on the public internet).",
      path: ["BETTER_AUTH_URL"],
    });
    return;
  }

  let hostname = "";
  try {
    hostname = new URL(data.BETTER_AUTH_URL).hostname;
  } catch {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "BETTER_AUTH_URL must be a valid URL.",
      path: ["BETTER_AUTH_URL"],
    });
    return;
  }

  const isLocalhost =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]";

  if (data.BETTER_AUTH_URL.startsWith("http:") && !isLocalhost) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message:
        "BETTER_AUTH_URL must use https in production unless the host is localhost (for local smoke tests).",
      path: ["BETTER_AUTH_URL"],
    });
  }

  if (data.RESEND_API_KEY === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message:
        "RESEND_API_KEY is required in production so password-reset emails can be delivered.",
      path: ["RESEND_API_KEY"],
    });
  }
}

const envSchemaWithProd = envSchema.superRefine(productionEnvRefinement);

type RawEnv = z.infer<typeof envSchemaWithProd>;

function buildEnv(raw: RawEnv) {
  const corsOrigins = raw.CORS_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean);
  const betterAuthUrl = raw.BETTER_AUTH_URL ?? `http://localhost:${raw.PORT}`;
  const authTrustedOriginsExtra = raw.AUTH_TRUSTED_ORIGINS.split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const isDev = raw.NODE_ENV === "development";

  /** Same host as `BETTER_AUTH_URL` so password-reset / verify-email `callbackURL` bridge paths are allowed. */
  function tryOrigin(url: string): string | null {
    try {
      return new URL(url).origin;
    } catch {
      return null;
    }
  }

  const authPublicOrigin = tryOrigin(betterAuthUrl);

  const authTrustedOrigins = [
    ...corsOrigins,
    ...(authPublicOrigin && !corsOrigins.includes(authPublicOrigin) ? [authPublicOrigin] : []),
    "decor-ai://",
    "decor-ai://*",
    ...(isDev ? (["exp://", "exp://**"] as const) : []),
    ...authTrustedOriginsExtra,
  ];

  return {
    nodeEnv: raw.NODE_ENV,
    isDev,
    isProd: raw.NODE_ENV === "production",
    isTest: raw.NODE_ENV === "test",

    port: raw.PORT,

    database: {
      url: raw.DATABASE_URL,
      sslRaw: raw.DATABASE_SSL,
      poolConnectionTimeoutMs: raw.DATABASE_POOL_CONNECTION_TIMEOUT_MS,
      poolMax: raw.DATABASE_POOL_MAX,
    },

    corsOrigins,
    authTrustedOrigins,

    worldlabs: {
      apiKey: raw.WORLDLABS_API_KEY,
      baseUrl: raw.WORLDLABS_BASE_URL ?? "https://api.worldlabs.ai/marble/v1",
    },

    cadPipeline: {
      url: raw.CAD_PIPELINE_URL.trim(),
      timeoutMs: raw.CAD_PIPELINE_TIMEOUT_MS,
    },

    maxUploadVariants: Math.min(4, Math.max(1, raw.UPLOAD_MAX_VARIANTS)),

    auth: {
      secret: raw.BETTER_AUTH_SECRET,
      url: betterAuthUrl,
    },

    resend: {
      apiKey: raw.RESEND_API_KEY,
      from: raw.RESEND_FROM ?? "Decor AI <onboarding@resend.dev>",
    },

    mobileAppScheme: raw.MOBILE_APP_SCHEME.trim() || "decor-ai",
  };
}

let env: ReturnType<typeof buildEnv>;

try {
  env = buildEnv(envSchemaWithProd.parse(process.env));
} catch (error) {
  if (error instanceof z.ZodError) {
    console.error("❌ Invalid environment variables:");
    console.error(JSON.stringify(error.flatten().fieldErrors, null, 2));
    error.issues.forEach((err) => {
      const p = err.path.join(".") || "(root)";
      console.error(`  ${p}: ${err.message}`);
    });
    process.exit(1);
  }
  throw error;
}

export type Env = typeof env;

export { env };

export const isProd = (): boolean => env.isProd;
export const isDev = (): boolean => env.isDev;
export const isTestEnv = (): boolean => env.isTest;

export default env;
