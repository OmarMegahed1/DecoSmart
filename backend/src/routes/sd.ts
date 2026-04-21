import { Router, Request, Response } from "express";
import { z } from "zod";
import { InferenceClient } from "@huggingface/inference";
import { config } from "../db/config";
import { runControlNetViaGradio } from "./gradio-controlnet.client";

const router = Router();

const enhanceCadSchema = z.object({
  image_base64: z.string().min(1),
  mime_type: z.string().optional().default("image/png"),
  prompt: z.string().optional(),
  negative_prompt: z.string().optional(),
  model: z.string().optional(),
  controlnet: z.string().optional(),
  steps: z.number().int().min(1).max(100).optional(),
  cfg_scale: z.number().min(1).max(20).optional(),
  strength: z.number().min(0).max(1).optional(),
  angle_variants: z.number().int().min(1).max(6).optional(),
  angle_prompts: z.array(z.string().min(1)).max(6).optional(),
});

const DEFAULT_ANGLE_PROMPTS = [
  "camera from front-left corner at eye level",
  "camera from front-right corner at eye level",
  "slightly elevated interior perspective",
  "isometric-like overview preserving room topology",
  "camera from back-left corner at eye level",
  "camera from back-right corner at eye level",
];

type HfCandidate = {
  label: string;
  modelId: string;
};

function normalizeModelId(modelId: string): string {
  const m = modelId.trim();
  if (!m) return m;
  const lookup: Record<string, string> = {
    sdxl: "stabilityai/stable-diffusion-xl-base-1.0",
    sdxl_base: "stabilityai/stable-diffusion-xl-base-1.0",
    sd2: "stabilityai/stable-diffusion-2-1",
    sd21: "stabilityai/stable-diffusion-2-1",
    sd15: "runwayml/stable-diffusion-v1-5",
    flux: "black-forest-labs/FLUX.1-schnell",
  };
  return lookup[m.toLowerCase()] ?? m;
}

function isLikelyTextToImageOnlyModel(modelId: string): boolean {
  return /flux|qwen-image|lightning|hyper-sd|turbo/i.test(modelId);
}

function toDataUrl(base64: string, mimeType: string): string {
  return `data:${mimeType};base64,${base64}`;
}

function extractBase64FromUnknown(value: unknown): string | null {
  if (typeof value === "string") {
    const dataUrlMatch = value.match(/^data:image\/[a-zA-Z0-9.+-]+;base64,(.+)$/);
    if (dataUrlMatch?.[1]) return dataUrlMatch[1];
    if (/^[A-Za-z0-9+/=]+$/.test(value) && value.length > 64) return value;
    return null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = extractBase64FromUnknown(item);
      if (found) return found;
    }
    return null;
  }

  if (value && typeof value === "object") {
    const rec = value as Record<string, unknown>;
    if (typeof rec.image === "string") return extractBase64FromUnknown(rec.image);
    if (typeof rec.url === "string") return extractBase64FromUnknown(rec.url);
    if (typeof rec.value === "string") return extractBase64FromUnknown(rec.value);
    if (rec.data) return extractBase64FromUnknown(rec.data);
  }

  return null;
}

function extractFileUrlFromText(value: string): string | null {
  const match = value.match(/(?:https?:\/\/[^\s"']+)?\/gradio_api\/file=[^\s"']+/i);
  return match?.[0] ?? null;
}

function toAbsoluteUrl(baseUrl: string, maybeRelativeUrl: string): string {
  if (/^https?:\/\//i.test(maybeRelativeUrl)) return maybeRelativeUrl;
  if (maybeRelativeUrl.startsWith("/")) return `${baseUrl}${maybeRelativeUrl}`;
  return `${baseUrl}/${maybeRelativeUrl}`;
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  retries = 2,
  timeoutMs = 20000
): Promise<globalThis.Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(timeout);
      return res;
    } catch (err) {
      clearTimeout(timeout);
      lastErr = err;
      if (attempt === retries) break;
      await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

function extractImageFromResponseText(resultText: string): { base64?: string; fileUrl?: string } | null {
  // 1) direct base64/data-url scan
  const directBase64 = extractBase64FromUnknown(resultText);
  if (directBase64) return { base64: directBase64 };

  // 2) raw file URL scan
  const directFileUrl = extractFileUrlFromText(resultText);
  if (directFileUrl) return { fileUrl: directFileUrl };

  // 3) try JSON payload
  try {
    const parsed = JSON.parse(resultText);
    const parsedBase64 = extractBase64FromUnknown(parsed);
    if (parsedBase64) return { base64: parsedBase64 };

    const parsedFileUrl = extractFileUrlFromText(JSON.stringify(parsed));
    if (parsedFileUrl) return { fileUrl: parsedFileUrl };
  } catch {
    // ignore
  }

  // 4) SSE lines: event: ...\ndata: ...
  const lines = resultText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    if (!line.toLowerCase().startsWith("data:")) continue;
    const raw = line.slice(5).trim();
    if (!raw || raw === "null") continue;

    const lineBase64 = extractBase64FromUnknown(raw);
    if (lineBase64) return { base64: lineBase64 };

    const lineFileUrl = extractFileUrlFromText(raw);
    if (lineFileUrl) return { fileUrl: lineFileUrl };

    try {
      const parsedLine = JSON.parse(raw);
      const parsedLineBase64 = extractBase64FromUnknown(parsedLine);
      if (parsedLineBase64) return { base64: parsedLineBase64 };

      const parsedLineFileUrl = extractFileUrlFromText(JSON.stringify(parsedLine));
      if (parsedLineFileUrl) return { fileUrl: parsedLineFileUrl };
    } catch {
      // ignore non-json line
    }
  }

  return null;
}

function buildPayloadsForApi(params: {
  apiName: string;
  imageDataUrl: string;
  prompt: string;
  negativePrompt: string;
  steps: number;
  cfgScale: number;
}) {
  const additionalPrompt = "best quality, extremely detailed";
  const commonSeed = 0;
  const commonImageCount = 1;
  const commonResolution = 768;

  if (params.apiName === "ip2p") {
    return [
      {
        data: [
          params.imageDataUrl,
          params.prompt,
          additionalPrompt,
          params.negativePrompt,
          commonImageCount,
          commonResolution,
          params.steps,
          params.cfgScale,
          commonSeed,
        ],
      },
      {
        data: [
          { url: params.imageDataUrl },
          params.prompt,
          additionalPrompt,
          params.negativePrompt,
          commonImageCount,
          commonResolution,
          params.steps,
          params.cfgScale,
          commonSeed,
        ],
      },
    ];
  }

  if (params.apiName === "depth") {
    return [
      {
        data: [
          params.imageDataUrl,
          params.prompt,
          additionalPrompt,
          params.negativePrompt,
          commonImageCount,
          commonResolution,
          384,
          params.steps,
          params.cfgScale,
          commonSeed,
          "DPT",
        ],
      },
    ];
  }

  if (params.apiName === "lineart") {
    return [
      {
        data: [
          params.imageDataUrl,
          params.prompt,
          additionalPrompt,
          params.negativePrompt,
          commonImageCount,
          commonResolution,
          512,
          params.steps,
          params.cfgScale,
          commonSeed,
          "Lineart",
        ],
      },
    ];
  }

  // canny and default fallback
  return [
    {
      data: [
        params.imageDataUrl,
        params.prompt,
        additionalPrompt,
        params.negativePrompt,
        commonImageCount,
        commonResolution,
        params.steps,
        params.cfgScale,
        commonSeed,
        50,
        150,
      ],
    },
    {
      data: [
        { url: params.imageDataUrl },
        params.prompt,
        additionalPrompt,
        params.negativePrompt,
        commonImageCount,
        commonResolution,
        params.steps,
        params.cfgScale,
        commonSeed,
        50,
        150,
      ],
    },
    {
      data: [
        { image: { url: params.imageDataUrl } },
        params.prompt,
        additionalPrompt,
        params.negativePrompt,
        commonImageCount,
        commonResolution,
        params.steps,
        params.cfgScale,
        commonSeed,
        50,
        150,
      ],
    },
    {
      data: [params.imageDataUrl, params.prompt, params.negativePrompt, params.steps, params.cfgScale],
    },
  ];
}

async function callHfSpacePredict(params: {
  imageBase64: string;
  mimeType: string;
  prompt: string;
  negativePrompt: string;
  steps: number;
  cfgScale: number;
  strength: number;
  controlnet: string;
}) {
  return runControlNetViaGradio({
    imageBase64: params.imageBase64,
    mimeType: params.mimeType,
    prompt: params.prompt,
    negativePrompt: params.negativePrompt,
    steps: params.steps,
    cfgScale: params.cfgScale,
    controlnet: params.controlnet,
  });
}

router.post("/enhance-cad", async (req: Request, res: Response) => {
  const parsed = enhanceCadSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "Validation failed",
      issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
    return;
  }

  const body = parsed.data;

  if (config.stableDiffusion.provider === "hf_space") {
    try {
      const variantCount =
        body.angle_variants ??
        Math.max(1, Math.min(6, config.stableDiffusion.angleVariantCount || 3));
      const angles = (body.angle_prompts?.length ? body.angle_prompts : DEFAULT_ANGLE_PROMPTS).slice(
        0,
        variantCount
      );

      const variants: Array<{ image_base64: string; mime_type: string; angle: string; score: number }> = [];
      for (const angle of angles) {
        const combinedPrompt = [
          body.prompt || config.stableDiffusion.defaultPrompt,
          angle,
          "high quality architectural interior render, preserve CAD spatial topology",
        ]
          .filter(Boolean)
          .join(", ");

        const result = await callHfSpacePredict({
          imageBase64: body.image_base64,
          mimeType: body.mime_type || "image/png",
          prompt: combinedPrompt,
          negativePrompt: body.negative_prompt || config.stableDiffusion.defaultNegativePrompt,
          steps: body.steps ?? config.stableDiffusion.steps,
          cfgScale: body.cfg_scale ?? config.stableDiffusion.cfgScale,
          strength: body.strength ?? config.stableDiffusion.strength,
          controlnet: body.controlnet || config.stableDiffusion.controlnet,
        });

        variants.push({
          image_base64: result.image_base64,
          mime_type: result.mime_type,
          angle,
          score: Math.max(0.5, 1 - angles.indexOf(angle) * 0.05),
        });
      }

      variants.sort((a, b) => b.score - a.score);
      const top = variants[0];
      res.json({
        image_base64: top.image_base64,
        mime_type: top.mime_type,
        provider: "hf_space",
        model_id: "space:controlnet",
        variants,
      });
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: `SD proxy failed: HF Space error: ${message}` });
      return;
    }
  }

  if (!config.huggingFace.apiKey) {
    res.status(500).json({ error: "HF_API_KEY is not configured" });
    return;
  }

  const requestedModelId = normalizeModelId(body.model || config.huggingFace.modelId);
  const rawModelIds = Array.from(
    new Set([
      requestedModelId,
      ...config.huggingFace.modelCandidates.map(normalizeModelId),
      normalizeModelId(config.huggingFace.fallbackModelId),
      "lllyasviel/sd-controlnet-depth",
      "stabilityai/stable-diffusion-2-1",
      "stabilityai/stable-diffusion-xl-base-1.0",
    ])
  );

  const modelIds = config.huggingFace.allowTextToImageFallback
    ? rawModelIds
    : rawModelIds.filter((m) => !isLikelyTextToImageOnlyModel(m));

  const candidates: HfCandidate[] = [];
  for (const [modelIndex, modelId] of modelIds.entries()) {
    candidates.push({
      label: modelIndex === 0 ? "primary" : `fallback-${modelIndex}`,
      modelId,
    });
  }

  try {
    const hf = new InferenceClient(config.huggingFace.apiKey);
    const variantCount =
      body.angle_variants ??
      Math.max(1, Math.min(6, config.stableDiffusion.angleVariantCount || 3));
    const angles = (body.angle_prompts?.length ? body.angle_prompts : DEFAULT_ANGLE_PROMPTS).slice(
      0,
      variantCount
    );

    const variants: Array<{ image_base64: string; mime_type: string; angle: string; score: number }> = [];
    let selectedCandidate: HfCandidate | null = null;

    const sourceBuffer = Buffer.from(body.image_base64, "base64");
    const sourceBlob = new Blob([sourceBuffer], { type: body.mime_type || "image/png" });

    for (const angle of angles) {
      const combinedPrompt = [
        body.prompt || config.stableDiffusion.defaultPrompt,
        angle,
        "high quality architectural interior render, preserve CAD spatial topology",
      ]
        .filter(Boolean)
        .join(", ");

      let lastError = "";
      let success = false;

      for (const candidate of candidates) {
        try {
          let providerSuccess = false;
          for (const provider of config.huggingFace.providerCandidates) {
            try {
              const imageBlob = await hf.imageToImage({
                model: candidate.modelId,
                inputs: sourceBlob,
                parameters: {
                  prompt: combinedPrompt,
                  negative_prompt: body.negative_prompt || config.stableDiffusion.defaultNegativePrompt,
                  num_inference_steps: body.steps ?? config.stableDiffusion.steps,
                  guidance_scale: body.cfg_scale ?? config.stableDiffusion.cfgScale,
                  strength: body.strength ?? config.stableDiffusion.strength,
                },
              }, { provider } as any);

              const ab = await imageBlob.arrayBuffer();
              const outBuffer = Buffer.from(ab);
              const score = Math.max(0.5, 1 - angles.indexOf(angle) * 0.05);
              variants.push({
                image_base64: outBuffer.toString("base64"),
                mime_type: imageBlob.type || "image/png",
                angle,
                score,
              });
              selectedCandidate = candidate;
              success = true;
              providerSuccess = true;
              break;
            } catch (providerErr) {
              const providerMsg = providerErr instanceof Error ? providerErr.message : String(providerErr);
              lastError = `[${candidate.label}:${candidate.modelId}:${provider}] ${providerMsg}`;
              if (/invalid username or password|unauthorized|forbidden|401|403/i.test(providerMsg)) {
                throw new Error(
                  `Hugging Face authentication failed while using provider '${provider}'. ` +
                    `Please verify HF_API_KEY has Inference Providers permission and provider access.`
                );
              }
              continue;
            }
          }

          if (providerSuccess) {
            break;
          }

          const imageBlob = await hf.imageToImage({
            inputs: sourceBlob,
            parameters: {
              prompt: combinedPrompt,
              negative_prompt: body.negative_prompt || config.stableDiffusion.defaultNegativePrompt,
              num_inference_steps: body.steps ?? config.stableDiffusion.steps,
              guidance_scale: body.cfg_scale ?? config.stableDiffusion.cfgScale,
              strength: body.strength ?? config.stableDiffusion.strength,
            },
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          lastError = `[${candidate.label}:${candidate.modelId}] ${msg}`;
          if (/invalid username or password|unauthorized|forbidden|401|403/i.test(msg)) {
            throw new Error(
              "Hugging Face authentication failed. " +
                "Please verify HF_API_KEY has Inference Providers permission and provider access, then restart backend."
            );
          }
          continue;
        }
      }

      if (!success) {
  const tried = candidates.map((c) => `${c.modelId}`).join(" | ");
        throw new Error(
          `No compatible Hugging Face model/provider for '${angle}'. Last error: ${lastError}. ` +
            `Tried models: ${tried}. Tried providers: ${config.huggingFace.providerCandidates.join(", ")}.`
        );
      }
    }

    variants.sort((a, b) => b.score - a.score);
    const top = variants[0];

    res.json({
      image_base64: top.image_base64,
      mime_type: top.mime_type,
      provider: "huggingface",
      model_id: selectedCandidate?.modelId || requestedModelId,
      variants,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: `SD proxy failed: ${message}` });
  }
});

export default router;
