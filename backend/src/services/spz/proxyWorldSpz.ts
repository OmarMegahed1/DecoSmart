import { getOperation, getWorld } from "../../clients/worldlabs";
import { resolveGenerationForWorld } from "../generations/resolveGenerationForWorld";

const qualityPreference: Array<"full_res" | "500k" | "100k"> = ["full_res", "500k", "100k"];

type SpzUrlMap = Partial<Record<"100k" | "500k" | "full_res", string>> | null | undefined;

// type ProxyWorldSpzErrorBody is the error body for the proxy world spz
export type ProxyWorldSpzErrorBody = {
  error: string; // error is the error message
  requestedQuality?: string; // requestedQuality is the requested quality
  availableWorldQualities: string[]; // availableWorldQualities is the available world qualities
  availableDbQualities: string[]; // availableDbQualities is the available db qualities
};

// type ProxyWorldSpzResult is the result for the proxy world spz
export type ProxyWorldSpzResult =
  | {
      kind: "binary"; // kind is the kind of the result
      contentType: string; // contentType is the content type of the result
      contentLength: string | null; // contentLength is the content length of the result
      selectedQuality?: string; // selectedQuality is the selected quality of the result
      buffer: Buffer; // buffer is the buffer of the result
    }
  | { kind: "error"; status: number; json: { error: string } | ProxyWorldSpzErrorBody }; // kind is the kind of the result, status is the status of the result, json is the json of the result

// function pickFromMap is the function to pick the from the map
function pickFromMap( // pick the from the map
  map: SpzUrlMap, // map is the map of the spz urls
  requested?: string // requested is the requested quality
): { url?: string; quality?: string } { // url is the url of the spz url, quality is the quality of the spz url
  if (!map) return {}; // if the map is not found, return an empty object

  const requestedKey = requested as "100k" | "500k" | "full_res"; // requestedKey is the requested quality
  if (requestedKey && map[requestedKey]) { // if the requested key is found in the map, return the url and quality
    return { url: map[requestedKey], quality: requestedKey }; // return the url and quality
  }

  for (const q of qualityPreference) { // for each quality in the quality preference, if the quality is found in the map, return the url and quality
    if (map[q]) return { url: map[q], quality: q }; // return the url and quality
  }
  return {}; // return an empty object
}

export async function proxyWorldSpzAsset(params: {
  userId: string;
  worldId: string;
  quality: string;
  operationId?: string;
}): Promise<ProxyWorldSpzResult> {
  const { userId, worldId, quality, operationId } = params;

  const generation = await resolveGenerationForWorld(userId, worldId, { operationId });

  if (!generation) {
    return { kind: "error", status: 404, json: { error: "World not found" } };
  }

  if (generation.userId !== userId) {
    return { kind: "error", status: 403, json: { error: "Forbidden" } };
  }

  let resolvedWorldId = generation.worldId ?? worldId;
  let operationWorld: unknown = null;

  if (!generation.worldId && operationId) {
    try {
      const operation = await getOperation(operationId);
      operationWorld = operation.response;
      const opWorldId =
        operation.metadata?.world_id ||
        (operation.response as { id?: string } | null)?.id ||
        (operation.response as { world_id?: string } | null)?.world_id;
      if (opWorldId) {
        resolvedWorldId = opWorldId;
      }
    } catch {
      // Keep fallback world id; downstream getWorld will validate existence.
    }
  }

  let worldSpz: SpzUrlMap;
  try {
    const world = await getWorld(resolvedWorldId);
    worldSpz = world.assets?.splats?.spz_urls;
  } catch {
    if (!operationWorld && operationId) {
      try {
        const operation = await getOperation(operationId);
        operationWorld = operation.response;
      } catch {
        // no-op
      }
    }
    worldSpz = (operationWorld as { assets?: { splats?: { spz_urls?: SpzUrlMap } } } | null)
      ?.assets?.splats?.spz_urls;
  }

  const dbSpz = generation.spzUrls ?? undefined;

  const fromWorld = pickFromMap(worldSpz ?? undefined, quality);
  const fromDb = pickFromMap(dbSpz as SpzUrlMap, quality);
  const spzUrl = fromWorld.url ?? fromDb.url;
  const selectedQuality = fromWorld.quality ?? fromDb.quality;

  if (!spzUrl) {
    return {
      kind: "error",
      status: 404,
      json: {
        error: "SPZ URL unavailable for requested world",
        requestedQuality: quality,
        availableWorldQualities: worldSpz ? Object.keys(worldSpz) : [],
        availableDbQualities: dbSpz ? Object.keys(dbSpz as Record<string, unknown>) : [],
      },
    };
  }

  const upstream = await fetch(spzUrl);
  if (!upstream.ok) {
    return {
      kind: "error",
      status: 502,
      json: { error: `Failed to fetch SPZ asset (${upstream.status})` },
    };
  }

  const contentType = upstream.headers.get("content-type") || "application/octet-stream";
  const contentLength = upstream.headers.get("content-length");

  const buffer = Buffer.from(await upstream.arrayBuffer());

  return {
    kind: "binary",
    contentType,
    contentLength,
    ...(selectedQuality ? { selectedQuality } : {}),
    buffer,
  };
}
