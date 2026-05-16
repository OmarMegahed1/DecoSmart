import { apiFetch, readApiErrorMessage } from "./api";

export type CadRoomFurniturePiece = { name: string; w: number; d: number; h: number };

/** Room row returned from GET /api/cad-jobs/:jobId/rooms or POST /api/cad-jobs/process */
export type CadRoom = {
  id: string;
  db_id: string;
  name: string;
  type: string;
  area: number;
  width: number;
  depth: number;
  windows: number;
  doors: number;
  furniture: CadRoomFurniturePiece[];
  price_finishing: number;
  price_per_m2: number;
  /** Present after process; omitted when loaded from DB-only GET */
  preview_data_url?: string;
  media_asset_id: string;
};

export type CadJobRoomsPayload = {
  job_id: string;
  status: string;
  error_message: string | null;
  total_rooms: number | null;
  rooms: CadRoom[];
};

function normalizeFurniture(raw: unknown): CadRoomFurniturePiece[] {
  if (!Array.isArray(raw)) return [];
  const out: CadRoomFurniturePiece[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const name = typeof o.name === "string" ? o.name : "";
    const w = typeof o.w === "number" ? o.w : Number(o.w) || 0;
    const d = typeof o.d === "number" ? o.d : Number(o.d) || 0;
    const h = typeof o.h === "number" ? o.h : Number(o.h) || 0;
    out.push({ name, w, d, h });
  }
  return out;
}

export function normalizeCadRoom(r: Partial<CadRoom> & { db_id?: string }): CadRoom {
  const furniture = normalizeFurniture(r.furniture);
  return {
    id: String(r.id ?? ""),
    db_id: String(r.db_id ?? ""),
    name: String(r.name ?? ""),
    type: String(r.type ?? ""),
    area: typeof r.area === "number" ? r.area : Number(r.area) || 0,
    width: typeof r.width === "number" ? r.width : Number(r.width) || 0,
    depth: typeof r.depth === "number" ? r.depth : Number(r.depth) || 0,
    windows: typeof r.windows === "number" ? r.windows : Number(r.windows) || 0,
    doors: typeof r.doors === "number" ? r.doors : Number(r.doors) || 0,
    furniture,
    price_finishing:
      typeof r.price_finishing === "number" ? r.price_finishing : Number(r.price_finishing) || 0,
    price_per_m2:
      typeof r.price_per_m2 === "number" ? r.price_per_m2 : Number(r.price_per_m2) || 0,
    preview_data_url:
      typeof r.preview_data_url === "string" && r.preview_data_url ? r.preview_data_url : undefined,
    media_asset_id: typeof r.media_asset_id === "string" ? r.media_asset_id : "",
  };
}

/** Merge base64 previews from a legacy navigation payload (same order / db_id as API). */
export function mergeRoomPreviewsFromLegacy(
  apiRooms: CadRoom[],
  legacy: CadRoom[] | null
): CadRoom[] {
  if (!legacy?.length) return apiRooms;
  const byDb = new Map(legacy.map((x) => [x.db_id, x]));
  return apiRooms.map((r, i) => {
    const cand = r.preview_data_url ? r : byDb.get(r.db_id) ?? legacy[i];
    const preview = r.preview_data_url ?? cand?.preview_data_url;
    return preview && !r.preview_data_url ? { ...r, preview_data_url: preview } : r;
  });
}

export async function fetchCadJobRooms(jobId: string): Promise<CadJobRoomsPayload> {
  const res = await apiFetch(`/api/cad-jobs/${encodeURIComponent(jobId)}/rooms`);
  if (!res.ok) {
    throw new Error(await readApiErrorMessage(res, "Could not load rooms for this job."));
  }
  const data = (await res.json()) as Partial<CadJobRoomsPayload>;
  const rawRooms = Array.isArray(data.rooms) ? data.rooms : [];
  return {
    job_id: String(data.job_id ?? jobId),
    status: String(data.status ?? ""),
    error_message:
      data.error_message === null || data.error_message === undefined
        ? null
        : String(data.error_message),
    total_rooms: data.total_rooms ?? null,
    rooms: rawRooms.map((row) => normalizeCadRoom(row as Partial<CadRoom>)),
  };
}
