import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { validateBody } from "../middleware/validation";
import {
  createProjectSchema,
  deleteProject,
  getProjects,
  postProject,
} from "../controllers/projects.controller";

const router = Router();

router.get("/", requireAuth, getProjects);

router.post("/", requireAuth, validateBody(createProjectSchema), postProject);

router.delete("/:id", requireAuth, deleteProject);

export default router;
