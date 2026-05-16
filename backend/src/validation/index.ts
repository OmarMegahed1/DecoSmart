/**
 * API input validation (Zod). Keep schemas here when shared by routes + typing in controllers
 * (via `z.infer`) to avoid circular imports and copy-paste across jobs or CLI importers.
 *
 * Route files: mount `validateBody` / `validateParams` / `validateQuery` with these schemas.
 */

export { generateBodySchema, type GenerateBody } from "./generations";
export {
  createProjectSchema,
  projectIdParamSchema,
  type CreateProjectBody,
} from "./projects";
export { operationIdParamSchema } from "./operations";
export { worldIdParamSchema } from "./worlds";
export { spzParamsSchema, spzQuerySchema } from "./spz";
export { cadJobIdParamSchema, cadProcessBodySchema, type CadProcessBody } from "./cadJobs";
export { uploadBodySchema, type UploadBody } from "./uploads";
