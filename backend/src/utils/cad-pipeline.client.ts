import { config } from "../db/config";

export type CadFurnitureItem = {
  name: string;
  w: number;
  d: number;
  h: number;
};

export type CadRoom = {
  id: string;
  name: string;
  type: string;
  width: number;
  depth: number;
  area: number;
  windows: number;
  doors: number;
  furniture: CadFurnitureItem[];
  price_finishing: number;
  price_per_m2: number;
  crop_image_b64: string;
  canny_image_b64: string;
  generated_image_b64: string;
};

export type CadPipelineResult = {
  rooms: CadRoom[];
  pngBuffer: Buffer;
  mimeType: string;
  fileName: string;
  enhancedWithDiffusers: boolean;
};

export function isCadPipelineConfigured(): boolean {
  return !!config.cadPipeline.url;
}

export async function convertDxfViaCadPipeline(
  dxfBuffer: Buffer,
  fileName: string,
  opts: {
    areaMq?: number;
    style?: string;
    palette?: string;
  } = {}
): Promise<CadPipelineResult> {
  const baseUrl = config.cadPipeline.url.replace(/\/$/, "");
  const timeoutMs = config.cadPipeline.timeoutMs;

  const form = new FormData();
  form.append(
    "dxf_file",
    new Blob([dxfBuffer], { type: "application/octet-stream" }),
    fileName
  );
  form.append("area_m2", String(opts.areaMq ?? 100));
  form.append("style", opts.style ?? "modern");
  form.append("palette", opts.palette ?? "neutral");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(`${baseUrl}/process`, {
      method: "POST",
      body: form,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`CAD pipeline returned ${res.status}: ${text}`);
  }

  const data = (await res.json()) as { rooms?: CadRoom[]; error?: string };

  if (data.error) {
    throw new Error(`CAD pipeline error: ${data.error}`);
  }

  const rooms: CadRoom[] = data.rooms ?? [];

  const firstCrop = rooms[0]?.crop_image_b64 ?? "";
  const pngBuffer = firstCrop ? Buffer.from(firstCrop, "base64") : Buffer.alloc(0);

  return {
    rooms,
    pngBuffer,
    mimeType: "image/png",
    fileName: fileName.replace(/\.dxf$/i, ".png"),
    enhancedWithDiffusers: rooms.length > 0,
  };
}
