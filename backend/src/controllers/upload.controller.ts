import { Request as ExpressRequest, Response } from "express";
import { prepareUpload, uploadFileToSignedUrl } from "../utils/worldlabs.client";
import { convertDxfViaCadPipeline, isCadPipelineConfigured } from "../utils/cad-pipeline.client";
import { config } from "../db/config";

function isDxfUpload(file: Express.Multer.File): boolean {
  const name = file.originalname.toLowerCase();
  const m = (file.mimetype || "").toLowerCase();
  return (
    name.endsWith(".dxf") ||
    m === "application/dxf" ||
    m === "image/vnd.dxf" ||
    m === "application/x-dxf"
  );
}

function parseBoolean(value: unknown): boolean {
  if (typeof value !== "string") return false;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

export async function postUpload(req: ExpressRequest, res: Response): Promise<void> {
  try {
    const file = (req as ExpressRequest & { file?: Express.Multer.File }).file;
    if (!file) {
      res.status(400).json({ error: "No file provided" });
      return;
    }

    let sourceType = String((req.body?.source_type as string | undefined) ?? "photo");
    const previewOnly = parseBoolean(req.body?.preview_only);

    let cadRoomLabels: unknown[] | undefined;

    let workBuffer = file.buffer;
    let workMime = file.mimetype || "image/jpeg";
    let workName = file.originalname;
    let cadProcessedOnKaggle = false;

    if (isDxfUpload(file)) {
      if (!isCadPipelineConfigured()) {
        res.status(503).json({
          error:
            "DXF uploads require the Kaggle CAD pipeline. Set CAD_PIPELINE_URL in .env " +
            "to your ngrok URL from the notebook, then restart the backend.",
        });
        return;
      }
      const areaMq = parseFloat(String(req.body?.area_m2 ?? "100")) || 100;
      const converted = await convertDxfViaCadPipeline(file.buffer, file.originalname, {
        areaMq,
        style: typeof req.body?.style === "string" ? req.body.style : undefined,
        palette: typeof req.body?.palette === "string" ? req.body.palette : undefined,
      });
      workBuffer = converted.pngBuffer;
      workMime = converted.mimeType;
      workName = converted.fileName;
      cadRoomLabels = converted.rooms.length ? converted.rooms : undefined;
      sourceType = "cad_dxf";
      cadProcessedOnKaggle = converted.enhancedWithDiffusers;
    }

    const processed: {
      imageBuffer: Buffer;
      mimeType: string;
      fileName: string;
      enhanced: boolean;
      provider: "kaggle" | "none";
    } = {
      imageBuffer: workBuffer,
      mimeType: workMime,
      fileName: workName,
      enhanced: cadProcessedOnKaggle,
      provider: cadProcessedOnKaggle ? "kaggle" : "none",
    };

    const variantCandidates = [
      {
        imageBuffer: processed.imageBuffer,
        mimeType: processed.mimeType,
        fileName: processed.fileName,
      },
    ];

    const selectedVariants = variantCandidates.slice(0, config.maxUploadVariants);

    if (previewOnly) {
      res.json({
        preview_only: true,
        source_type: sourceType,
        enhanced: processed.enhanced,
        enhancement_provider: processed.provider,
        enhanced_variant_count: selectedVariants.length,
        ...(cadRoomLabels ? { cad_room_labels: cadRoomLabels } : {}),
        preview_images: selectedVariants.map((variant) => ({
          data_url: `data:${variant.mimeType};base64,${variant.imageBuffer.toString("base64")}`,
          mime_type: variant.mimeType,
          file_name: variant.fileName,
        })),
      });
      return;
    }

    const uploadedMediaAssetIds: string[] = [];

    for (const variant of selectedVariants) {
      const extension = variant.fileName.split(".").pop()?.toLowerCase() ?? "png";
      const mimeType = variant.mimeType;

      const { media_asset, upload_info } = await prepareUpload(variant.fileName, extension);

      await uploadFileToSignedUrl(
        upload_info.upload_url,
        upload_info.required_headers,
        variant.imageBuffer,
        mimeType
      );

      uploadedMediaAssetIds.push(media_asset.media_asset_id);
    }

    res.json({
      media_asset_id: uploadedMediaAssetIds[0],
      media_asset_ids: uploadedMediaAssetIds,
      source_type: sourceType,
      enhanced: processed.enhanced,
      enhancement_provider: processed.provider,
      enhanced_variant_count: uploadedMediaAssetIds.length,
      ...(cadRoomLabels ? { cad_room_labels: cadRoomLabels } : {}),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
}
