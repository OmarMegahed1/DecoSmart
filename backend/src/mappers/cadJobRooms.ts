import type { CadJob, RoomResult } from "../db/schema";
import type { CadRoom } from "../clients/cadPipeline";

/** Single room in `POST /api/cad-jobs/process` process response (pipeline → API). */
export type CadProcessRoomResponse = {
  id: string;
  db_id: string;
  name: string;
  type: string;
  area: number;
  width: number;
  depth: number;
  windows: number;
  doors: number;
  furniture: unknown;
  price_finishing: number;
  price_per_m2: number;
  preview_data_url: string;
  media_asset_id: string;
};

export type CadProcessJobApiResponse = {
  job_id: string;
  total_rooms: number;
  rooms: CadProcessRoomResponse[];
};

/** Single room in `GET /api/cad-jobs/:jobId/rooms` list (DB row → API). */
export type CadJobRoomListItem = {
  id: string;
  db_id: string;
  name: string;
  type: string;
  area: number;
  width: number;
  depth: number;
  windows: number;
  doors: number;
  furniture: unknown;
  price_finishing: number;
  price_per_m2: number;
  preview_data_url?: string;
  media_asset_id: string;
};

export type CadJobRoomsApiResponse = {
  job_id: string;
  status: string;
  error_message: string | null;
  total_rooms: number | null;
  rooms: CadJobRoomListItem[];
};

export function mapPipelineRoomsToProcessApi(
  rooms: CadRoom[], // rooms is the rooms from the response
  inserted: RoomResult[], // inserted is the inserted rows for the rooms
  mediaIds: string[] // mediaIds is the media ids for the rooms
): CadProcessRoomResponse[] { // return the mapped pipeline rooms to process api
  return rooms.map((room, i) => { // map the rooms to the process api
    const mediaAssetId = mediaIds[i] ?? ""; // mediaAssetId is the media asset id for the room
    return {
      id: room.id, // id is the id of the room
      db_id: inserted[i]?.id ?? "", // db_id is the id of the inserted row for the room
      name: room.name, // name is the name of the room
      type: room.type, // type is the type of the room
      area: room.area, // area is the area of the room
      width: room.width, // width is the width of the room
      depth: room.depth, // depth is the depth of the room
      windows: room.windows, // windows is the number of windows in the room
      doors: room.doors, // doors is the number of doors in the room
      furniture: room.furniture, // furniture is the furniture for the room
      price_finishing: room.price_finishing, // price_finishing is the price of the finishing for the room
      price_per_m2: room.price_per_m2, // price_per_m2 is the price per square meter for the room
      preview_data_url: `data:image/png;base64,${room.generated_image_b64}`, // preview_data_url is the preview data url for the room
      media_asset_id: mediaAssetId, // media_asset_id is the media asset id for the room
    };
  }); // return the mapped pipeline rooms to process api
}

export function mapRoomResultToListItem(row: RoomResult): CadJobRoomListItem {
  const area = row.areaMq ? parseFloat(row.areaMq) : 0;
  const priceFinishing = row.priceFinishing ?? 0;
  const pricePerM2 = area > 0 ? Math.round(priceFinishing / area) : 0;
  const previewDataUrl = row.previewPngB64 ? `data:image/png;base64,${row.previewPngB64}` : undefined;
  return {
    id: `${row.type}_${row.roomIndex}`,
    db_id: row.id,
    name: row.name,
    type: row.type,
    area,
    width: row.widthM ? parseFloat(row.widthM) : 0,
    depth: row.depthM ? parseFloat(row.depthM) : 0,
    windows: row.windows ?? 0,
    doors: row.doors ?? 0,
    furniture: row.furnitureJson ?? [],
    price_finishing: priceFinishing,
    price_per_m2: pricePerM2,
    ...(previewDataUrl ? { preview_data_url: previewDataUrl } : {}),
    media_asset_id: row.mediaAssetId ?? "",
  };
}

export function toCadJobRoomsApiResponse(job: CadJob, roomRows: RoomResult[]): CadJobRoomsApiResponse {
  return {
    job_id: job.id,
    status: job.status,
    error_message: job.errorMessage ?? null,
    total_rooms: job.totalRooms,
    rooms: roomRows.map(mapRoomResultToListItem),
  };
}
