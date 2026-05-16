import { db } from "../../db/client";
import { generations, uploadedAssets } from "../../db/schema";
import {
  generateWorld,
  buildWorldlabsFinalPrompt,
  isWorldlabsPromptTooLong,
  WORLDLABS_TEXT_PROMPT_MAX_CHARS,
  type GenerateWorldRequest,
  type WorldImagePrompt,
  type WorldMultiImagePrompt,
  type WorldTextPrompt,
} from "../../clients/worldlabs";
import type { GenerateBody } from "../../validation/generations";
import { HttpError } from "../../lib/httpError";

export type CreateGenerationResult = {
  operation_id: string;
  generation_id: string;
};

/**
 * Validates prompt/media rules and WorldLabs length, then starts a generation and persists DB rows.
 * Caller should return 400 for validation failures via {@link HttpError} status.
 */
export async function createWorldGeneration(params: {
  userId: string;
  body: GenerateBody;
}): Promise<CreateGenerationResult> {
  const { userId, body } = params; // destructure the parameters
  const {
    prompt, // prompt is the prompt from the request body
    media_asset_ids, // media_asset_ids is the media asset ids from the request body
    quality, // quality is the quality from the request body
    display_name, // display_name is the display name from the request body
    input_mode, // input_mode is the input mode from the request body
    cad_options, // cad_options is the cad options from the request body
  } = body; // destructure the parameters

  if ((!media_asset_ids || media_asset_ids.length === 0) && !prompt?.trim()) { // if the media asset ids are not provided and the prompt is not provided, throw an error
    throw new HttpError(400, "Provide at least a prompt or one image."); // throw an error if the media asset ids are not provided and the prompt is not provided
  }

  const model = quality === "draft" ? "Marble 0.1-mini" : "Marble 0.1-plus"; // model is the model to use for the generation based on the quality
  const isCadInput = input_mode === "cad_dxf"; // isCadInput is true if the input mode is cad_dxf

  const finalPrompt = buildWorldlabsFinalPrompt({ // build the final prompt for the generation
    input_mode, // input_mode is the input mode from the request body
    prompt, // prompt is the prompt from the request body
    cad_options, // cad_options is the cad options from the request body
  });

  if (isWorldlabsPromptTooLong(finalPrompt)) { 
    throw new HttpError( // throw an error if the final prompt is too long
      400,
      `Combined prompt exceeds WorldLabs limit of ${WORLDLABS_TEXT_PROMPT_MAX_CHARS} characters (layout context + your text).`
    );
  }

  const effectiveMediaAssetIds =
    isCadInput && media_asset_ids?.length ? [media_asset_ids[0]] : media_asset_ids; // if the input mode is cad_dxf and the media asset ids are provided, use the first media asset id otherwise use the media asset ids could be undefined

  // Marble `world_prompt` must be exactly one JSON shape: `{ type: "text", ... }`, `{ type: "image", ... }`,
  // or `{ type: "multi-image", ... }`. TypeScript models that as a union; at runtime only one branch below runs.
  let world_prompt: WorldTextPrompt | WorldImagePrompt | WorldMultiImagePrompt;
  // if the effective media asset ids are not provided or there are no media asset ids, use the text prompt
  if (!effectiveMediaAssetIds || effectiveMediaAssetIds.length === 0) { 
    world_prompt = {
      type: "text", // type is the type of the prompt
      text_prompt: finalPrompt, // text_prompt is the text prompt for the generation
      // For CAD, skip Marble “recaption” so auto-generated descriptions do not override our layout/topology instructions.
      ...(isCadInput ? { disable_recaption: true } : {}),
    };
  } 
  // if the effective media asset ids are provided and there is only one media asset id, use the image prompt
  else if (effectiveMediaAssetIds.length === 1) {
    world_prompt = {
      type: "image", // type is the type of the prompt
      image_prompt: { source: "media_asset", media_asset_id: effectiveMediaAssetIds[0] }, // image_prompt is the image prompt for the generation
      ...(finalPrompt ? { text_prompt: finalPrompt } : {}), // text_prompt is the text prompt for the generation if the final prompt is provided
      ...(isCadInput ? { disable_recaption: true } : {}), // same: avoid replacing CAD/layout instructions with auto captions
    };
  } 
  // if the effective media asset ids are provided and there are multiple media asset ids, use the multi-image prompt
  else {
    world_prompt = {
      type: "multi-image", // type is the type of the prompt
      multi_image_prompt: effectiveMediaAssetIds.map((id) => ({ // multi_image_prompt is the multi-image prompt for the generation
        content: { // content is the content of the multi-image prompt
          source: "media_asset" as const, // source is the source of the media asset
          media_asset_id: id, // media_asset_id is the media asset id
        },
      })), // multi_image_prompt is the multi-image prompt for the generation
      ...(finalPrompt ? { text_prompt: finalPrompt } : {}), // text_prompt is the text prompt for the generation if the final prompt is provided
      ...(isCadInput ? { disable_recaption: true } : {}), // same for rare multi-image + cad_dxf
    };
  }

  const payload: GenerateWorldRequest = {
    world_prompt, // world_prompt is the world prompt for the generation
    model, // model is the model to use for the generation
    ...(display_name ? { display_name } : {}), // display_name is the display name for the generation if the display name is provided
  };

  const operation = await generateWorld(payload); // generate the world for the generation
  // transaction is the transaction for the generation
  const generation = await db.transaction(async (tx) => {
    const [row] = await tx // insert the generation into the database
      .insert(generations) // insert the generation into the database
      .values({ // values are the values for the generation
        userId, // userId is the authenticated user from router.use(requireAuth) in generationsRoutes.ts
        operationId: operation.operation_id, // operationId is the id of the operation
        prompt: finalPrompt || null, // prompt is the prompt for the generation if the final prompt is provided
        quality, // quality is the quality for the generation
        status: "pending", // status is the status for the generation
        imageCount: effectiveMediaAssetIds?.length ?? 0, // imageCount is the number of images for the generation
      })
      .returning(); // return the row
    // if the effective media asset ids are provided and there are multiple media asset ids, insert the uploaded assets into the database
    if (effectiveMediaAssetIds && effectiveMediaAssetIds.length > 0) {
      await tx.insert(uploadedAssets).values( // insert the uploaded assets into the database
        effectiveMediaAssetIds.map((id) => ({
          generationId: row.id, // generationId is the id of the generation
          mediaAssetId: id, // mediaAssetId is the media asset id
          originalName: id, // originalName is the original name of the media asset
          mimeType: "image/jpeg", // mimeType is the mime type of the media asset
        }))
      );
    }

    return row; // row is the row for the generation
  });
  // the outer return is the operation_id and generation_id from the row generated by the transaction
  return {
    operation_id: operation.operation_id, // operation_id is the id of the operation
    generation_id: generation.id, // generation_id is the id of the generation
  };
}
