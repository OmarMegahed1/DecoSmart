import type { Request as ExpressRequest, Response } from "express";
import { requireUser } from "../middleware/auth";
import type { CreateProjectBody } from "../validation/projects";
import {
  createProjectForUser,
  deleteProjectForUser,
  listProjectsForUser,
} from "../services/projects/projectService";
import { sendControllerError } from "../lib/sendControllerError";

export async function getProjects(req: ExpressRequest, res: Response): Promise<void> {
  try {
    const { user } = requireUser(req);
    const payload = await listProjectsForUser(user.id);
    res.json(payload);
  } catch (err) {
    if (!res.headersSent) {
      sendControllerError(res, err, "[projects]");
    }
  }
}

export async function postProject(req: ExpressRequest, res: Response): Promise<void> {
  try {
    const { user } = requireUser(req);
    const project = await createProjectForUser(user.id, req.body as CreateProjectBody);
    res.status(201).json(project);
  } catch (err) {
    if (!res.headersSent) {
      sendControllerError(res, err, "[projects]");
    }
  }
}

export async function deleteProject(req: ExpressRequest, res: Response): Promise<void> {
  try {
    const { user } = requireUser(req);
    const { id } = req.params as { id: string };
    await deleteProjectForUser(user.id, id);
    res.status(204).end();
  } catch (err) {
    if (!res.headersSent) {
      sendControllerError(res, err, "[projects]");
    }
  }
}
