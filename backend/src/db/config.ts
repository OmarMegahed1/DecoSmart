import * as dotenv from "dotenv";
dotenv.config();

function required(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
}

export const config = {
  port: parseInt(process.env.PORT ?? "4000", 10),
  nodeEnv: process.env.NODE_ENV ?? "development",
  isDev: (process.env.NODE_ENV ?? "development") === "development",

  corsOrigins: (
    process.env.CORS_ORIGINS ??
    "http://localhost:3000,http://localhost:3001,http://localhost:8081,http://localhost:8082"
  )
    .split(",")
    .map((s) => s.trim()),

  database: {
    url: required("DATABASE_URL"),
  },

  worldlabs: {
    apiKey: required("WORLDLABS_API_KEY"),
    baseUrl: "https://api.worldlabs.ai/marble/v1",
  },

  stableDiffusion: {
    provider: process.env.SD_PROVIDER ?? "huggingface",
    enabled: (process.env.SD_CONTROLNET_ENABLED ?? "false").toLowerCase() === "true",
    apiUrl: process.env.SD_CONTROLNET_API_URL ?? "",
    apiKey: process.env.SD_CONTROLNET_API_KEY ?? "",
    model: process.env.SD_CONTROLNET_MODEL ?? "sdxl",
    controlnet: process.env.SD_CONTROLNET_TYPE ?? "lineart",
    defaultPrompt:
      process.env.SD_CONTROLNET_DEFAULT_PROMPT ??
      "Architectural interior render from CAD floor plan, realistic perspective, clean walls and openings, balanced daylight, high detail",
    defaultNegativePrompt:
      process.env.SD_CONTROLNET_DEFAULT_NEGATIVE_PROMPT ??
      "distorted geometry, warped walls, upside down view, blurry, noisy text overlays, watermark",
    steps: parseInt(process.env.SD_CONTROLNET_STEPS ?? "28", 10),
    cfgScale: parseFloat(process.env.SD_CONTROLNET_CFG_SCALE ?? "6.5"),
    strength: parseFloat(process.env.SD_CONTROLNET_STRENGTH ?? "0.6"),
    angleVariantCount: parseInt(process.env.SD_CONTROLNET_ANGLE_VARIANTS ?? "3", 10),
    maxUploadVariants: parseInt(process.env.SD_CONTROLNET_MAX_UPLOAD_VARIANTS ?? "3", 10),
    failOpen: (process.env.SD_CONTROLNET_FAIL_OPEN ?? "true").toLowerCase() === "true",
    requireForCad: (process.env.SD_CONTROLNET_REQUIRE_FOR_CAD ?? "true").toLowerCase() === "true",
  },

  hfSpace: {
    apiUrl: process.env.HF_SPACE_API_URL ?? "https://hysts-controlnet-v1-1.hf.space",
    spaceId: process.env.HF_SPACE_ID ?? "hysts/ControlNet-v1-1",
    timeoutMs: parseInt(process.env.HF_SPACE_TIMEOUT_MS ?? "90000", 10),
    bearerToken: process.env.HF_SPACE_BEARER_TOKEN ?? "",
  },

  huggingFace: {
    apiKey: process.env.HF_API_KEY ?? "",
    modelId: process.env.HF_MODEL_ID ?? "stabilityai/stable-diffusion-xl-base-1.0",
    modelCandidates: (process.env.HF_MODEL_CANDIDATES ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    providerCandidates: (process.env.HF_PROVIDER_CANDIDATES ?? "hf-inference")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    baseUrl: process.env.HF_BASE_URL ?? "https://router.huggingface.co/hf-inference/models",
    fallbackModelId: process.env.HF_FALLBACK_MODEL_ID ?? "runwayml/stable-diffusion-v1-5",
    fallbackBaseUrl:
      process.env.HF_FALLBACK_BASE_URL ?? "https://router.huggingface.co/hf-inference/models",
    allowTextToImageFallback:
      (process.env.HF_ALLOW_TEXT_TO_IMAGE_FALLBACK ?? "false").toLowerCase() === "true",
  },

  auth: {
    secret: required("BETTER_AUTH_SECRET"),
    url: process.env.BETTER_AUTH_URL ?? "http://localhost:4000",
  },
};