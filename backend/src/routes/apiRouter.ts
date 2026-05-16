import { Router } from "express";
import uploadsRoutes from "./uploadsRoutes";
import generationsRoutes from "./generationsRoutes";
import operationsRoutes from "./operationsRoutes";
import worldsRoutes from "./worldsRoutes";
import projectsRoutes from "./projectsRoutes";
import cadJobsRoutes from "./cadJobsRoutes";

/**
 * All JSON/multipart API routes under `/api/*` (resource-oriented).
 * Auth remains at `/auth`; bridges at server root.
 */
export function createApiRouter(): Router {
  const api = Router();

  api.use("/uploads", uploadsRoutes);
  api.use("/generations", generationsRoutes);
  api.use("/operations", operationsRoutes);
  api.use("/worlds", worldsRoutes);
  api.use("/projects", projectsRoutes);
  api.use("/cad-jobs", cadJobsRoutes);

  return api;
}
