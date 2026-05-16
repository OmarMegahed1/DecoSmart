import { z } from "zod";

export const cadJobIdParamSchema = z.object({
  jobId: z.string().uuid(),
});

export const cadProcessBodySchema = z.object({
  area_m2: z.coerce.number().positive().max(1_000_000).optional().default(100),
  style: z.string().max(120).optional().default("modern"),
  palette: z.string().max(120).optional().default("neutral"),
});

export type CadProcessBody = z.infer<typeof cadProcessBodySchema>;
