import { Request as ExpressRequest, Response } from "express";
import { eq, asc, sql } from "drizzle-orm";
import { db } from "../db/client";
import { cadJobs, roomResults } from "../db/schema";
import { convertDxfViaCadPipeline, isCadPipelineConfigured } from "../utils/cad-pipeline.client";
import { prepareUpload, uploadFileToSignedUrl } from "../utils/worldlabs.client";
import type { AuthenticatedRequest } from "../middleware/auth";

export async function postCadProcess(req: ExpressRequest, res: Response): Promise<void> {
  const authReq = req as unknown as AuthenticatedRequest;
  const file = (req as ExpressRequest & { file?: Express.Multer.File }).file;

  if (!file) {
    res.status(400).json({ error: "dxf_file is required" });
    return;
  }

  if (!isCadPipelineConfigured()) {
    res.status(503).json({
      error:
        "CAD pipeline is not configured. Start the Kaggle notebook (Cell C) and " +
        "set CAD_PIPELINE_URL in backend/.env, then restart the backend.",
    });
    return;
  }

  const areaMq = parseFloat(String(req.body?.area_m2 ?? "100")) || 100;
  const style = String(req.body?.style ?? "modern");
  const palette = String(req.body?.palette ?? "neutral");

  let job: (typeof cadJobs.$inferSelect) | undefined;

  try {
    const [row] = await db
      .insert(cadJobs)
      .values({
        userId: authReq.user.id,
        status: "pending",
        originalFileName: file.originalname,
        areaMqInput: Math.round(areaMq),
      })
      .returning();
    job = row;

    const pipelineResult = await convertDxfViaCadPipeline(file.buffer, file.originalname, {
      areaMq,
      style,
      palette,
    });

    // After a long upstream run, serverless DB pools often have stale connections.
    await db.execute(sql`SELECT 1`);

    const rooms = pipelineResult.rooms;

    const roomRows: Array<{
      id: string;
      db_id: string;
      name: string;
      type: string;
      area: number;
      width: number;
      depth: number;
      windows: number;
      doors: number;
      furniture: unknown[];
      price_finishing: number;
      price_per_m2: number;
      preview_data_url: string;
      media_asset_id: string;
    }> = [];

    for (let i = 0; i < rooms.length; i++) {
      const room = rooms[i];

      let mediaAssetId = "";
      try {
        const imgBuffer = Buffer.from(room.generated_image_b64, "base64");
        const fileName = `${room.id}_generated.png`;
        const { media_asset, upload_info } = await prepareUpload(fileName, "png");
        await uploadFileToSignedUrl(
          upload_info.upload_url,
          upload_info.required_headers,
          imgBuffer,
          "image/png"
        );
        mediaAssetId = media_asset.media_asset_id;
      } catch (uploadErr) {
        console.error(`WorldLabs upload failed for room ${room.id}:`, uploadErr);
      }

      const [roomRow] = await db
        .insert(roomResults)
        .values({
          cadJobId: job.id,
          roomIndex: i,
          name: room.name,
          type: room.type,
          widthM: String(room.width),
          depthM: String(room.depth),
          areaMq: String(room.area),
          windows: room.windows,
          doors: room.doors,
          priceFinishing: room.price_finishing,
          furnitureJson: room.furniture as any,
          mediaAssetId: mediaAssetId || null,
          previewPngB64: room.generated_image_b64,
        })
        .returning();

      roomRows.push({
        id: room.id,
        db_id: roomRow.id,
        name: room.name,
        type: room.type,
        area: room.area,
        width: room.width,
        depth: room.depth,
        windows: room.windows,
        doors: room.doors,
        furniture: room.furniture,
        price_finishing: room.price_finishing,
        price_per_m2: room.price_per_m2,
        preview_data_url: `data:image/png;base64,${room.generated_image_b64}`,
        media_asset_id: mediaAssetId,
      });
    }

    await db
      .update(cadJobs)
      .set({ status: "done", totalRooms: rooms.length })
      .where(eq(cadJobs.id, job.id));

    res.status(201).json({
      job_id: job.id,
      total_rooms: rooms.length,
      rooms: roomRows,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (job?.id) {
      try {
        await db
          .update(cadJobs)
          .set({ status: "error", errorMessage: message })
          .where(eq(cadJobs.id, job.id));
      } catch (dbErr) {
        console.error("Failed to persist CAD job error status:", dbErr);
      }
    }
    if (!res.headersSent) {
      res.status(500).json({ error: message });
    }
  }
}

export async function getCadRooms(req: ExpressRequest, res: Response): Promise<void> {
  const { jobId } = req.params;
  const authReq = req as unknown as AuthenticatedRequest;

  try {
    const [job] = await db
      .select()
      .from(cadJobs)
      .where(eq(cadJobs.id, String(jobId)))
      .limit(1);

    if (!job) {
      res.status(404).json({ error: "CAD job not found" });
      return;
    }

    if (job.userId !== authReq.user.id) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const rows = await db
      .select()
      .from(roomResults)
      .where(eq(roomResults.cadJobId, String(jobId)))
      .orderBy(asc(roomResults.roomIndex));

    res.json({
      job_id: job.id,
      status: job.status,
      error_message: job.errorMessage ?? null,
      total_rooms: job.totalRooms,
      rooms: rows.map((r) => {
        const area = r.areaMq ? parseFloat(r.areaMq) : 0;
        const priceFinishing = r.priceFinishing ?? 0;
        const pricePerM2 = area > 0 ? Math.round(priceFinishing / area) : 0;
        const previewDataUrl = r.previewPngB64 ? `data:image/png;base64,${r.previewPngB64}` : undefined;
        return {
          id: `${r.type}_${r.roomIndex}`,
          db_id: r.id,
          name: r.name,
          type: r.type,
          area,
          width: r.widthM ? parseFloat(r.widthM) : 0,
          depth: r.depthM ? parseFloat(r.depthM) : 0,
          windows: r.windows ?? 0,
          doors: r.doors ?? 0,
          furniture: r.furnitureJson ?? [],
          price_finishing: priceFinishing,
          price_per_m2: pricePerM2,
          ...(previewDataUrl ? { preview_data_url: previewDataUrl } : {}),
          media_asset_id: r.mediaAssetId ?? "",
        };
      }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
}
