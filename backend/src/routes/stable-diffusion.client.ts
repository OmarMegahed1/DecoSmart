import { config } from "../db/config";

export type EnhanceCadInput = {
  imageBuffer: Buffer;
  mimeType: string;
  fileName: string;
  prompt?: string;
  angleVariants?: number;
};

export type EnhanceCadResult = {
  imageBuffer: Buffer;
  mimeType: string;
  fileName: string;
  enhanced: boolean;
  provider: "sd-controlnet" | "none";
  variants?: Array<{
    imageBuffer: Buffer;
    mimeType: string;
    fileName: string;
    angle?: string;
    score?: number;
  }>;
};

function toBase64(buffer: Buffer): string {
  return buffer.toString("base64");
}

function fromBase64(base64: string): Buffer {
  return Buffer.from(base64, "base64");
}

export async function maybeEnhanceCadImage(input: EnhanceCadInput): Promise<EnhanceCadResult> {
  if (!config.stableDiffusion.enabled || !config.stableDiffusion.apiUrl) {
    return {
      imageBuffer: input.imageBuffer,
      mimeType: input.mimeType,
      fileName: input.fileName,
      enhanced: false,
      provider: "none",
    };
  }

  try {
    const res = await fetch(`${config.stableDiffusion.apiUrl}/enhance-cad`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(config.stableDiffusion.apiKey
          ? { Authorization: `Bearer ${config.stableDiffusion.apiKey}` }
          : {}),
      },
      body: JSON.stringify({
        image_base64: toBase64(input.imageBuffer),
        mime_type: input.mimeType,
        prompt: input.prompt || config.stableDiffusion.defaultPrompt,
        negative_prompt: config.stableDiffusion.defaultNegativePrompt,
        model: config.stableDiffusion.model,
        controlnet: config.stableDiffusion.controlnet,
        steps: config.stableDiffusion.steps,
        cfg_scale: config.stableDiffusion.cfgScale,
        strength: config.stableDiffusion.strength,
        angle_variants:
          input.angleVariants ?? Math.max(1, Math.min(6, config.stableDiffusion.angleVariantCount || 3)),
      }),
    });

    if (!res.ok) {
      throw new Error(`SD+ControlNet failed (${res.status}): ${await res.text()}`);
    }

    const data = (await res.json()) as {
      image_base64?: string;
      mime_type?: string;
      variants?: Array<{ image_base64?: string; mime_type?: string; angle?: string; score?: number }>;
    };
    if (!data.image_base64) {
      throw new Error("SD+ControlNet response missing image_base64");
    }

    const baseName = input.fileName.replace(/\.[^.]+$/, "");
    const normalizedVariants = Array.isArray(data.variants)
      ? data.variants
          .map((v, index) => {
            if (!v?.image_base64) return null;
            const angleSlug = (v.angle || `variant-${index + 1}`).replace(/[^a-z0-9]+/gi, "-").toLowerCase();
            return {
              imageBuffer: fromBase64(v.image_base64),
              mimeType: v.mime_type || "image/png",
              fileName: `${baseName}-${angleSlug || `variant-${index + 1}`}.png`,
              angle: v.angle,
              score: typeof v.score === "number" ? v.score : undefined,
            };
          })
          .filter((v): v is NonNullable<typeof v> => Boolean(v))
      : undefined;

    return {
      imageBuffer: fromBase64(data.image_base64),
      mimeType: data.mime_type || "image/png",
      fileName: input.fileName.replace(/\.[^.]+$/, ".png"),
      enhanced: true,
      provider: "sd-controlnet",
      variants: normalizedVariants,
    };
  } catch (error) {
    if (!config.stableDiffusion.failOpen) {
      throw error;
    }

    return {
      imageBuffer: input.imageBuffer,
      mimeType: input.mimeType,
      fileName: input.fileName,
      enhanced: false,
      provider: "none",
    };
  }
}
