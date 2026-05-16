import { z } from "zod";

const boolish = z.preprocess((v) => {
  if (v === true || v === "true" || v === "1" || v === "yes" || v === "on") return true;
  return false;
}, z.boolean());

export const uploadBodySchema = z.object({
  source_type: z.string().max(64).optional().default("photo"),
  preview_only: boolish.optional().default(false),
  area_m2: z.coerce.number().positive().max(1_000_000).optional(),
  style: z.string().max(120).optional(),
  palette: z.string().max(120).optional(),
});

export type UploadBody = z.infer<typeof uploadBodySchema>;
