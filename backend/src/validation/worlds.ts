import { z } from "zod";

/** WorldLabs world id (opaque string). */
export const worldIdParamSchema = z.object({
  worldId: z.string().min(1).max(512),
});
