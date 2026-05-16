import { z } from "zod";

export const spzParamsSchema = z.object({
  worldId: z.string().min(1).max(512),
  quality: z.enum(["100k", "500k", "full_res"]),
});

export const spzQuerySchema = z.object({
  operationId: z
    .string()
    .max(512)
    .optional()
    .transform((s) => (s && s.trim() ? s.trim() : undefined)),
});
