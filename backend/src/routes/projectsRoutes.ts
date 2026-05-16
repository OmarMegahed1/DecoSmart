import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { validateBody, validateParams } from "../middleware/validation";
import {
  createProjectSchema,
  projectIdParamSchema,
} from "../validation/projects";
import {
  deleteProject,
  getProjects,
  postProject,
} from "../controllers/projectsController";

/**
 * Route order: `GET /` and `POST /` before `DELETE /:id` so `/` is not treated as an id.
 */
const router = Router();

router.use(requireAuth);

router.get("/", getProjects);

router.post("/", validateBody(createProjectSchema), postProject);

router.delete("/:id", validateParams(projectIdParamSchema), deleteProject);

export default router;
