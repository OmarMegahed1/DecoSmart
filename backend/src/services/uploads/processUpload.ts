import { env } from "../../env";
import { prepareUpload, uploadFileToSignedUrl } from "../../clients/worldlabs";
import { convertDxfViaCadPipeline, isCadPipelineConfigured } from "../../clients/cadPipeline";
import type { UploadBody } from "../../validation/uploads";
import { HttpError } from "../../lib/httpError";

/** Minimal file shape from `multer` — avoids coupling this module to Express namespace merging. */
export type UploadMulterFile = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
};

function isDxfUpload(file: UploadMulterFile): boolean {
  const name = file.originalname.toLowerCase();
  const m = (file.mimetype || "").toLowerCase();
  return (
    name.endsWith(".dxf") ||
    m === "application/dxf" ||
    m === "image/vnd.dxf" ||
    m === "application/x-dxf"
  );
}

export type UploadPreviewPayload = {
  preview_only: true;
  source_type: string;
  enhanced: boolean;
  enhancement_provider: "kaggle" | "none";
  enhanced_variant_count: number;
  cad_room_labels?: unknown[];
  preview_images: Array<{
    data_url: string;
    mime_type: string;
    file_name: string;
  }>;
};

export type UploadStoredPayload = {
  media_asset_id: string;
  media_asset_ids: string[];
  source_type: string;
  enhanced: boolean;
  enhancement_provider: "kaggle" | "none";
  enhanced_variant_count: number;
  cad_room_labels?: unknown[];
};

export type UploadServiceResult =
  | { kind: "preview"; payload: UploadPreviewPayload }
  | { kind: "stored"; payload: UploadStoredPayload };

export async function processUpload(params: {
  file: UploadMulterFile;
  body: UploadBody;
}): Promise<UploadServiceResult> {
  const { file, body } = params;
  let sourceType = body.source_type;
  const previewOnly = body.preview_only;

  let cadRoomLabels: unknown[] | undefined;

  let workBuffer = file.buffer;
  let workMime = file.mimetype || "image/jpeg";
  let workName = file.originalname;
  let cadProcessedOnKaggle = false;

  if (isDxfUpload(file)) {
    if (!isCadPipelineConfigured()) {
      throw new HttpError(
        503,
        "DXF uploads require the Kaggle CAD pipeline. Set CAD_PIPELINE_URL in .env " +
          "to your ngrok URL from the notebook, then restart the backend."
      );
    }
    const areaMq = body.area_m2 ?? 100;
    const converted = await convertDxfViaCadPipeline(file.buffer, file.originalname, {
      areaMq,
      style: body.style,
      palette: body.palette,
    });
    workBuffer = converted.pngBuffer;
    workMime = converted.mimeType;
    workName = converted.fileName;
    cadRoomLabels = converted.rooms.length ? converted.rooms : undefined;
    sourceType = "cad_dxf";
    cadProcessedOnKaggle = converted.enhancedWithDiffusers;
  }

  const processed = {
    imageBuffer: workBuffer,
    mimeType: workMime,
    fileName: workName,
    enhanced: cadProcessedOnKaggle,
    provider: (cadProcessedOnKaggle ? "kaggle" : "none") as "kaggle" | "none",
  };

  const variantCandidates = [
    {
      imageBuffer: processed.imageBuffer,
      mimeType: processed.mimeType,
      fileName: processed.fileName,
    },
  ];

  const selectedVariants = variantCandidates.slice(0, env.maxUploadVariants);

  if (previewOnly) {
    const payload: UploadPreviewPayload = {
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
    };
    return { kind: "preview", payload };
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

  const payload: UploadStoredPayload = {
    media_asset_id: uploadedMediaAssetIds[0],
    media_asset_ids: uploadedMediaAssetIds,
    source_type: sourceType,
    enhanced: processed.enhanced,
    enhancement_provider: processed.provider,
    enhanced_variant_count: uploadedMediaAssetIds.length,
    ...(cadRoomLabels ? { cad_room_labels: cadRoomLabels } : {}),
  };

  return { kind: "stored", payload };
}
