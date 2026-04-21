import { Router, Request as ExpressRequest, Response } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { generateWorld } from "./worldlabs.client";
import { db } from "../db/client";
import { generations, uploadedAssets } from "../db/schema";
import type {
  GenerateWorldRequest,
  WorldImagePrompt,
  WorldMultiImagePrompt,
  WorldTextPrompt,
} from "../types/worldlabs";
import type { AuthenticatedRequest } from "../middleware/auth";

const router = Router();

const generateSchema = z.object({
  prompt: z.string().max(1000).optional(),
  media_asset_ids: z.array(z.string()).max(4).optional().default([]),
  quality: z.enum(["draft", "full"]).default("full"),
  display_name: z.string().max(100).optional(),
  input_mode: z.enum(["photo", "cad_png"]).default("photo"),
  cad_options: z
    .object({
      preserve_layout: z.boolean().optional().default(true),
      style_hint: z.string().max(120).optional(),
      room_height_m: z.number().min(2).max(6).optional(),
    })
    .optional(),
});

/**
 * POST /api/generate
 *
 * Body: { prompt?, media_asset_ids?, quality?, display_name? }
 * Returns: { operation_id, generation_id }
 */
router.post(
  "/",
  requireAuth,
  validate(generateSchema),
  async (req: ExpressRequest, res: Response): Promise<void> => {
    try {
      const authReq = req as unknown as AuthenticatedRequest;
      const { prompt, media_asset_ids, quality, display_name, input_mode, cad_options } = req.body as z.infer<
        typeof generateSchema
      >;

      if ((!media_asset_ids || media_asset_ids.length === 0) && !prompt?.trim()) {
        res.status(400).json({ error: "Provide at least a prompt or one image." });
        return;
      }

      const model = quality === "draft" ? "Marble 0.1-mini" : "Marble 0.1-plus";

      const cadContextText =
        input_mode === "cad_png"
          ? [
              "Input source is AutoCAD/floor-plan line art.",
              cad_options?.preserve_layout !== false
                ? "Strictly preserve wall topology, room boundaries, and openings."
                : "Preserve primary spatial layout.",
              "Do not add, remove, merge, or reposition rooms, walls, doors, windows, or corridors.",
              "Keep camera framing and scale consistent with the provided plan-derived image.",
              "Generate one coherent navigable interior 3D space from this single structural reference.",
              cad_options?.style_hint ? `Style hint: ${cad_options.style_hint}.` : "",
              cad_options?.room_height_m ? `Assume room height ${cad_options.room_height_m}m.` : "",
            ]
              .filter(Boolean)
              .join(" ")
          : "";

      const finalPrompt = [cadContextText, prompt || ""].filter(Boolean).join(" ").trim();

      // CAD mode should produce one coherent 3D world from a single structural input.
      // If upload returned multiple variants/assets, keep only the top one for WorldLabs generation.
      const effectiveMediaAssetIds =
        input_mode === "cad_png" && media_asset_ids?.length
          ? [media_asset_ids[0]]
          : media_asset_ids;

      let world_prompt: WorldTextPrompt | WorldImagePrompt | WorldMultiImagePrompt;

      if (!effectiveMediaAssetIds || effectiveMediaAssetIds.length === 0) {
        world_prompt = {
          type: "text",
          text_prompt: finalPrompt,
          ...(input_mode === "cad_png" ? { disable_recaption: true } : {}),
        };
      } else if (effectiveMediaAssetIds.length === 1) {
        world_prompt = {
          type: "image",
          image_prompt: { source: "media_asset", media_asset_id: effectiveMediaAssetIds[0] },
          ...(finalPrompt ? { text_prompt: finalPrompt } : {}),
          ...(input_mode === "cad_png" ? { disable_recaption: true } : {}),
        };
      } else {
        world_prompt = {
          type: "multi-image",
          multi_image_prompt: effectiveMediaAssetIds.map((id) => ({
            content: {
              source: "media_asset" as const,
              media_asset_id: id,
            },
          })),
          ...(finalPrompt ? { text_prompt: finalPrompt } : {}),
          ...(input_mode === "cad_png" ? { disable_recaption: true } : {}),
        };
      }

      const payload: GenerateWorldRequest = {
        world_prompt,
        model,
        ...(display_name ? { display_name } : {}),
      };

      // Submit to WorldLabs
      const operation = await generateWorld(payload);

      // Persist generation record in DB
      const [generation] = await db
        .insert(generations)
        .values({
          userId: authReq.user.id,
          operationId: operation.operation_id,
          prompt: finalPrompt || null,
          quality,
          status: "pending",
          imageCount: effectiveMediaAssetIds?.length ?? 0,
        })
        .returning();

      // Persist uploaded asset references if any
      if (effectiveMediaAssetIds && effectiveMediaAssetIds.length > 0) {
        await db.insert(uploadedAssets).values(
          effectiveMediaAssetIds.map((id) => ({
            generationId: generation.id,
            mediaAssetId: id,
            originalName: id,
            mimeType: "image/jpeg",
          }))
        );
      }

      res.status(201).json({
        operation_id: operation.operation_id,
        generation_id: generation.id,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  }
);

export default router;
