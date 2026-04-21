import { Client } from "@gradio/client";
import { config } from "../db/config";

type GradioRunParams = {
  imageBase64: string;
  mimeType: string;
  prompt: string;
  negativePrompt: string;
  steps: number;
  cfgScale: number;
  controlnet?: string;
};

let clientPromise: Promise<Client> | null = null;

function getClient() {
  if (!clientPromise) {
    clientPromise = Client.connect(config.hfSpace.spaceId);
  }
  return clientPromise;
}

function normalizeApiName(controlnet?: string): "/lineart" | "/canny" | "/ip2p" {
  const c = (controlnet || "").toLowerCase();
  if (c.includes("ip2p")) return "/ip2p";
  if (c.includes("canny")) return "/canny";
  return "/lineart";
}

async function fetchImageAsBase64(url: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download Gradio output image: ${response.status} ${response.statusText}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  return {
    image_base64: buffer.toString("base64"),
    mime_type: response.headers.get("content-type") || "image/png",
  };
}

function collectImageUrls(value: unknown): string[] {
  const urls: string[] = [];

  const walk = (node: unknown) => {
    if (!node) return;
    if (typeof node === "string") {
      if (/^https?:\/\//i.test(node)) urls.push(node);
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (typeof node === "object") {
      const rec = node as Record<string, unknown>;
      if (typeof rec.url === "string") urls.push(rec.url);
      if (typeof rec.path === "string" && /^https?:\/\//i.test(rec.path)) urls.push(rec.path);
      for (const value of Object.values(rec)) walk(value);
    }
  };

  walk(value);
  return Array.from(new Set(urls));
}

export async function runControlNetViaGradio(params: GradioRunParams): Promise<{ image_base64: string; mime_type: string }> {
  const client = await getClient();

  const buffer = Buffer.from(params.imageBase64, "base64");
  const imageBlob = new Blob([buffer], { type: params.mimeType || "image/png" });
  const apiName = normalizeApiName(params.controlnet);

  const payload = {
    image: imageBlob,
    prompt: params.prompt,
    additional_prompt: "best quality, extremely detailed",
    negative_prompt: params.negativePrompt,
    num_images: 1,
    image_resolution: 768,
    preprocess_resolution: 512,
    num_steps: params.steps,
    guidance_scale: params.cfgScale,
    seed: 0,
    preprocessor_name: "Lineart",
  } as Record<string, unknown>;

  if (apiName === "/canny") {
    payload.preprocessor_name = "Canny";
    payload.low_threshold = 100;
    payload.high_threshold = 200;
  }

  if (apiName === "/ip2p") {
    delete payload.preprocessor_name;
    delete payload.preprocess_resolution;
  }

  let result: any;
  try {
    result = await client.predict(apiName, payload as any);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Gradio predict failed on ${apiName}: ${message}`);
  }

  const urls = collectImageUrls(result?.data ?? result);
  const firstUrl = urls.find((u) => /\/gradio_api\/file=|\.(png|jpg|jpeg|webp)(\?|$)/i.test(u)) || urls[0];

  if (!firstUrl) {
    throw new Error(`Gradio did not return a usable image URL for ${apiName}`);
  }

  return fetchImageAsBase64(firstUrl);
}
