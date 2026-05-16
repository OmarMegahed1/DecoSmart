import { z } from "zod";
import {
  buildWorldlabsFinalPrompt,
  WORLDLABS_TEXT_PROMPT_MAX_CHARS,
} from "../clients/worldlabs";

export const generateBodySchema = z
  .object({
    prompt: z.string().max(WORLDLABS_TEXT_PROMPT_MAX_CHARS).optional(),
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
  })
  .superRefine((data, ctx) => {
    const final = buildWorldlabsFinalPrompt({
      input_mode: data.input_mode,
      prompt: data.prompt,
      cad_options: data.cad_options,
    });
    if (final.length > WORLDLABS_TEXT_PROMPT_MAX_CHARS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Prompt exceeds WorldLabs limit of ${WORLDLABS_TEXT_PROMPT_MAX_CHARS} characters including CAD layout context.`,
        path: ["prompt"],
      });
    }
  });

export type GenerateBody = z.infer<typeof generateBodySchema>;
