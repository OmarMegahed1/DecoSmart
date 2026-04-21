import { Router, Request as ExpressRequest, Response } from "express";
import multer from "multer";
import { requireAuth } from "../middleware/auth";
import { prepareUpload, uploadFileToSignedUrl } from "./worldlabs.client";
import { maybeEnhanceCadImage } from "./stable-diffusion.client";
import { config } from "../db/config";

const router = Router();

function parseBoolean(value: unknown): boolean {
  if (typeof value !== "string") return false;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

// Store file in memory (buffer) — we forward it straight to WorldLabs
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB max
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      cb(new Error("Only image files are allowed"));
      return;
    }
    cb(null, true);
  },
});

/**
 * POST /api/upload
 *
 * Accepts multipart/form-data with a single "file" image field.
 * Uploads to WorldLabs via signed URL.
 *
 * Returns: { media_asset_id: string }
 */
router.post(
  "/",
  requireAuth,
  upload.single("file"),
  async (req: ExpressRequest, res: Response): Promise<void> => {
    try {
      const file = (req as ExpressRequest & { file?: Express.Multer.File }).file;
      if (!file) {
        res.status(400).json({ error: "No file provided" });
        return;
      }

      const sourceType = String((req.body?.source_type as string | undefined) ?? "photo");
      const requestEnhance = parseBoolean(req.body?.enhance_cad);
      const shouldEnhance =
        config.stableDiffusion.enabled && (sourceType === "cad_png" || requestEnhance);
  const previewOnly = parseBoolean(req.body?.preview_only);

      const processed = shouldEnhance
        ? await maybeEnhanceCadImage({
            imageBuffer: file.buffer,
            mimeType: file.mimetype || "image/png",
            fileName: file.originalname,
            prompt: typeof req.body?.enhance_prompt === "string" ? req.body.enhance_prompt : undefined,
          })
        : {
            imageBuffer: file.buffer,
            mimeType: file.mimetype || "image/jpeg",
            fileName: file.originalname,
            enhanced: false,
            provider: "none" as const,
          };

      if (
        sourceType === "cad_png" &&
        config.stableDiffusion.enabled &&
        config.stableDiffusion.requireForCad &&
        !processed.enhanced
      ) {
        res.status(502).json({
          error:
            "CAD enhancement failed. Stable Diffusion/ControlNet output is required before WorldLabs upload. Check SD/HF configuration and server logs.",
        });
        return;
      }

      const variantCandidates =
        processed.enhanced && processed.variants?.length
          ? processed.variants
          : [
              {
                imageBuffer: processed.imageBuffer,
                mimeType: processed.mimeType,
                fileName: processed.fileName,
              },
            ];

      const maxVariants = Math.max(1, config.stableDiffusion.maxUploadVariants || 3);
      const selectedVariants = variantCandidates.slice(0, maxVariants);

      if (previewOnly) {
        res.json({
          preview_only: true,
          source_type: sourceType,
          enhanced: processed.enhanced,
          enhancement_provider: processed.provider,
          enhanced_variant_count: selectedVariants.length,
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

        // Step 1 — get signed URL from WorldLabs
        const { media_asset, upload_info } = await prepareUpload(variant.fileName, extension);

        // Step 2 — upload directly to the signed URL
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
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  }
);

export default router;
