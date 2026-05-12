import { Request as ExpressRequest, Response } from "express";
import { z } from "zod";
import { generateWorld } from "../utils/worldlabs.client";
import { db } from "../db/client";
import { generations, uploadedAssets } from "../db/schema";
import type {
  GenerateWorldRequest,
  WorldImagePrompt,
  WorldMultiImagePrompt,
  WorldTextPrompt,
} from "../utils/worldlabs.types";
import type { AuthenticatedRequest } from "../middleware/auth";

export const generateBodySchema = z.object({
  prompt: z.string().max(1000).optional(),
  media_asset_ids: z.array(z.string()).max(4).optional().default([]),
  quality: z.enum(["draft", "full"]).default("full"),
  display_name: z.string().max(100).optional(),
  input_mode: z.enum(["photo", "cad_dxf"]).default("photo"),
  cad_options: z
    .object({
      preserve_layout: z.boolean().optional().default(true),
      style_hint: z.string().max(120).optional(),
      room_height_m: z.number().min(2).max(6).optional(),
    })
    .optional(),
});

export async function postGenerate(req: ExpressRequest, res: Response): Promise<void> {
  try {
    const authReq = req as unknown as AuthenticatedRequest;
    const { prompt, media_asset_ids, quality, display_name, input_mode, cad_options } =
      req.body as z.infer<typeof generateBodySchema>;

    if ((!media_asset_ids || media_asset_ids.length === 0) && !prompt?.trim()) {
      res.status(400).json({ error: "Provide at least a prompt or one image." });
      return;
    }

    const model = quality === "draft" ? "Marble 0.1-mini" : "Marble 0.1-plus";

    const isCadInput = input_mode === "cad_dxf";

    const cadContextText = isCadInput
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

    const effectiveMediaAssetIds =
      isCadInput && media_asset_ids?.length ? [media_asset_ids[0]] : media_asset_ids;

    let world_prompt: WorldTextPrompt | WorldImagePrompt | WorldMultiImagePrompt;

    if (!effectiveMediaAssetIds || effectiveMediaAssetIds.length === 0) {
      world_prompt = {
        type: "text",
        text_prompt: finalPrompt,
        ...(isCadInput ? { disable_recaption: true } : {}),
      };
    } else if (effectiveMediaAssetIds.length === 1) {
      world_prompt = {
        type: "image",
        image_prompt: { source: "media_asset", media_asset_id: effectiveMediaAssetIds[0] },
        ...(finalPrompt ? { text_prompt: finalPrompt } : {}),
        ...(isCadInput ? { disable_recaption: true } : {}),
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
        ...(isCadInput ? { disable_recaption: true } : {}),
      };
    }

    const payload: GenerateWorldRequest = {
      world_prompt,
      model,
      ...(display_name ? { display_name } : {}),
    };

    const operation = await generateWorld(payload);

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
