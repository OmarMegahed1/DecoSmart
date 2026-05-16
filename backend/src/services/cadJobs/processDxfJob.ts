/**
 * CAD DXF job orchestration — end-to-end flow from uploaded floor plan to persisted rooms + API response.
 *
 * ## Purpose
 * Called by `POST /api/cad-jobs/process` after the controller validates auth, multipart DXF, and CAD pipeline
 * configuration. This service is the **single place** that:
 * 1. Creates a durable `cad_jobs` row (so clients can poll `GET /api/cad-jobs/:jobId/rooms` if needed).
 * 2. Sends the DXF bytes to the **external CAD pipeline** (e.g. Kaggle notebook over `CAD_PIPELINE_URL`).
 * 3. For each detected room, uploads the pipeline’s AI render PNG to **WorldLabs Marble** (prepare signed URL → PUT image).
 * 4. Inserts one `room_results` row per room and marks the job `done`.
 * 5. Returns a JSON payload the mobile app uses for the room picker (previews + `media_asset_id` for later `/api/generations`).
 *
 * ## External systems
 * - **CAD pipeline** (`convertDxfViaCadPipeline`): multipart HTTP to your notebook/service; returns structured `rooms[]`
 *   including base64 PNGs (`generated_image_b64`). See `clients/cadPipeline.ts`.
 * - **WorldLabs** (`prepareUpload`, `uploadFileToSignedUrl`): each room image becomes a Marble `media_asset_id` used as
 *   image input when the user starts a 3D world generation. Upload failures are logged and stored as `null` / empty id
 *   so the job can still complete (mobile shows “preview only” when `media_asset_id` is missing).
 *
 * ## Database
 * - `cad_jobs`: one row per process request; `status` is `pending` → `done` or `error`; `total_rooms` set on success.
 * - `room_results`: N rows linked by `cadJobId`; holds geometry, pricing, furniture JSON, optional `mediaAssetId`,
 *   and `previewPngB64` for API previews / DB-backed room listing.
 *
 * ## Error handling
 * Any failure **after** the `cad_jobs` row exists is caught, the job row is updated to `status: "error"` with
 * `errorMessage`, and the original error is rethrown so the HTTP layer can return 5xx to the client.
 */

import { eq } from "drizzle-orm";
import { db } from "../../db/client";
import { cadJobs, roomResults, type NewRoomResult } from "../../db/schema";
import { convertDxfViaCadPipeline } from "../../clients/cadPipeline";
import { prepareUpload, uploadFileToSignedUrl } from "../../clients/worldlabs";
import type { CadProcessBody } from "../../validation/cadJobs";
import {
  mapPipelineRoomsToProcessApi,
  type CadProcessJobApiResponse,
} from "../../mappers/cadJobRooms";

export type { CadProcessJobApiResponse as CadProcessResponse } from "../../mappers/cadJobRooms";

export async function processCadDxfJob(params: {
  userId: string; // userId is the authenticated user from router.use(requireAuth) in cadJobsRoutes.ts
  file: { buffer: Buffer; originalname: string }; // file is the uploaded DXF file
  body: Pick<CadProcessBody, "area_m2" | "style" | "palette">; // body is the request body from cadProcessBodySchema in validation/cadJobs.ts
}): Promise<CadProcessJobApiResponse> {
  const { userId, file, body } = params; // destructure the parameters
  const areaMq = body.area_m2; // area_m2 is the area in square meters
  const { style, palette } = body; // style and palette are the style and palette from the request body

  // --- 1) Persist job stub immediately so we always have a `cadJobId` for error updates and follow-up reads.
  const [row] = await db // insert the job stub into the database
    .insert(cadJobs) // insert the job stub into the cad_jobs table
    .values({
      userId, // userId is the authenticated user from router.use(requireAuth) in cadJobsRoutes.ts
      status: "pending", // status is set to pending
      originalFileName: file.originalname, // originalFileName is the name of the uploaded file
      areaMqInput: Math.round(areaMq), // area_m2 is rounded to the nearest integer
    })
    .returning(); // return the inserted row

  if (!row) { 
    throw new Error("Failed to create CAD job"); // throw an error if the job stub is not inserted
  }

  const cadJobId = row.id; // cadJobId is the id of the inserted job stub

  try {
    // --- 2) Run DXF through remote pipeline (long-running; bounded by `CAD_PIPELINE_TIMEOUT_MS` in the client).
    // Returns room metadata + base64 images; does not touch WorldLabs or our DB beyond this service’s next steps.
    const pipelineResult = await convertDxfViaCadPipeline(file.buffer, file.originalname, {
      areaMq, // area_m2 is the area in square meters
      style, // style is the style from the request body
      palette, // palette is the palette from the request body
    });

    const rooms = pipelineResult.rooms; // rooms is the rooms from the response
    const valueRows: NewRoomResult[] = []; // valueRows is the value rows for the rooms
    /** Parallel to `rooms` / `valueRows`: WorldLabs id per room (empty string if upload failed). */
    const mediaIds: string[] = []; // mediaIds is the media ids for the rooms

    // --- 3) Per room: decode PNG → Marble prepare_upload → PUT to signed URL → capture `media_asset_id`.
    // Failures are non-fatal for the row: we still store the room and preview base64; missing `media_asset_id` blocks
    // downstream world generation until the user re-processes or fixes WorldLabs.
    for (let i = 0; i < rooms.length; i++) {
      const room = rooms[i]; // room is the room from the response
      let mediaAssetId = ""; // mediaAssetId is the media asset id for the room
      try {
        const imgBuffer = Buffer.from(room.generated_image_b64, "base64"); // imgBuffer is the buffer of the generated image
        const fileName = `${room.id}_generated.png`; // fileName is the name of the generated image
        const { media_asset, upload_info } = await prepareUpload(fileName, "png"); // prepareUpload is the prepare upload for the image
        await uploadFileToSignedUrl(
          upload_info.upload_url, // upload_info.upload_url is the upload url for the image
          upload_info.required_headers, // upload_info.required_headers is the required headers for the image
          imgBuffer, // imgBuffer is the buffer of the generated image
          "image/png" // mimeType is the mime type of the image
        );
        mediaAssetId = media_asset.media_asset_id; // mediaAssetId is the media asset id for the room
      } catch (uploadErr) {
        console.error(`WorldLabs upload failed for room ${room.id}:`, uploadErr); // console error if the upload fails
      }
      mediaIds.push(mediaAssetId); // push the media asset id to the mediaIds array if the upload is successful

      valueRows.push({
        cadJobId, // cadJobId is the id of the inserted job stub
        roomIndex: i, // roomIndex is the index of the room 
        name: room.name, // name is the name of the room
        type: room.type, // type is the type of the room
        widthM: String(room.width), // widthM is the width of the room
        depthM: String(room.depth), // depthM is the depth of the room
        areaMq: String(room.area), // areaMq is the area of the room
        windows: room.windows, // windows is the number of windows in the room
        doors: room.doors, // doors is the number of doors in the room
        priceFinishing: room.price_finishing, // priceFinishing is the price of the finishing for the room
        furnitureJson: room.furniture, // furnitureJson is the furniture for the room
        mediaAssetId: mediaAssetId || null, // mediaAssetId is the media asset id for the room
        previewPngB64: room.generated_image_b64, // previewPngB64 is the preview png base64 for the room
      }); // push the value row to the valueRows array
    }

    // --- 4) Atomically insert all room rows and flip job to `done` (avoids clients seeing `done` with zero rooms).
    const inserted = await db.transaction(async (tx) => {
      let insertRows: (typeof roomResults.$inferSelect)[] = []; // insertRows is the insert rows for the rooms
      if (valueRows.length > 0) { // if the valueRows are not empty, insert the valueRows into the roomResults table
        insertRows = await tx.insert(roomResults).values(valueRows).returning(); // insert the valueRows into the roomResults table
      }
      await tx
        .update(cadJobs)
        .set({ status: "done", totalRooms: rooms.length }) // set the status to done and the total rooms to the number of rooms
        .where(eq(cadJobs.id, cadJobId)); // where the cadJobId is the id of the inserted job stub
      return insertRows; // return the insert rows
    }); // transaction is the transaction for the insert rows

    // --- 5) Shape response for HTTP 201: stable `job_id`, client-friendly room list (data URLs + db ids + Marble ids).
    const roomRows = mapPipelineRoomsToProcessApi(rooms, inserted, mediaIds); // roomRows is the room rows for the process api

    return {
      job_id: row.id, // job_id is the id of the inserted job stub
      total_rooms: rooms.length, // total_rooms is the number of rooms
      rooms: roomRows, // rooms is the room rows for the process api
    };
  } catch (err) {
    // --- 6) Best-effort: mark job failed so `GET .../rooms` can surface `error_message` without a mystery pending job.
    const message = err instanceof Error ? err.message : String(err);
    try {
      await db
        .update(cadJobs) 
        .set({ status: "error", errorMessage: message }) // set the status to error and the error message to the message
        .where(eq(cadJobs.id, cadJobId)); // where the cadJobId is the id of the inserted job stub
    } catch (dbErr) {
      console.error("Failed to persist CAD job error status:", dbErr); // console error if the error status is not persisted
    }
    throw err; // throw the error if the error status is not persisted
  }
}
