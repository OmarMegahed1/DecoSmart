import { z } from "zod";

export const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(100),
  operationId: z.string().trim().min(1).optional(),
  worldId: z.string().trim().min(1).optional(),
  caption: z.string().trim().max(2000).optional(),
  spzUrls: z
    .object({
      "100k": z.string().url().optional(),
      "500k": z.string().url().optional(),
      full_res: z.string().url().optional(),
    })
    .optional(),
});

export type CreateProjectBody = z.infer<typeof createProjectSchema>;

export const projectIdParamSchema = z.object({
  id: z.string().uuid(),
});
