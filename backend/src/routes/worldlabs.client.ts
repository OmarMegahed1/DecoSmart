import { config } from "../db/config";
import type {
  GenerateWorldRequest,
  Operation,
  PrepareUploadResponse,
  World,
} from "../types/worldlabs";

function getHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "WLT-Api-Key": config.worldlabs.apiKey,
  };
}

const BASE = config.worldlabs.baseUrl;

export async function prepareUpload(
  fileName: string,
  extension: string
): Promise<PrepareUploadResponse> {
  const res = await fetch(`${BASE}/media-assets:prepare_upload`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({ file_name: fileName, kind: "image", extension }),
  });
  if (!res.ok) throw new Error(`WorldLabs prepareUpload ${res.status}: ${await res.text()}`);
  return res.json() as Promise<PrepareUploadResponse>;
}

export async function uploadFileToSignedUrl(
  uploadUrl: string,
  requiredHeaders: Record<string, string>,
  fileBuffer: Buffer,
  mimeType: string
): Promise<void> {
  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": mimeType, ...requiredHeaders },
    body: fileBuffer,
  });
  if (!res.ok) throw new Error(`Signed URL upload ${res.status}: ${await res.text()}`);
}

export async function generateWorld(payload: GenerateWorldRequest): Promise<Operation> {
  const res = await fetch(`${BASE}/worlds:generate`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`WorldLabs generate ${res.status}: ${await res.text()}`);
  return res.json() as Promise<Operation>;
}

export async function getOperation(operationId: string): Promise<Operation> {
  const res = await fetch(`${BASE}/operations/${operationId}`, {
    headers: getHeaders(),
  });
  if (!res.ok) throw new Error(`WorldLabs getOperation ${res.status}: ${await res.text()}`);
  return res.json() as Promise<Operation>;
}

export async function getWorld(worldId: string): Promise<World> {
  const res = await fetch(`${BASE}/worlds/${worldId}`, {
    headers: getHeaders(),
  });
  if (!res.ok) throw new Error(`WorldLabs getWorld ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { world: World };
  return data.world;
}
