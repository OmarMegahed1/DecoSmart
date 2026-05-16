import { z } from "zod";

/** WorldLabs operation id (opaque string, not necessarily UUID). */
export const operationIdParamSchema = z.object({
  operationId: z.string().min(1).max(512),
});
