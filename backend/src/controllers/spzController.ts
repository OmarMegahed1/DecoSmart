import type { Request as ExpressRequest, Response } from "express";
import { requireUser } from "../middleware/auth";
import { proxyWorldSpzAsset } from "../services/spz/proxyWorldSpz";
import { sendControllerError } from "../lib/sendControllerError";

export async function getWorldSpz(req: ExpressRequest, res: Response): Promise<void> {
  try {
    const { user } = requireUser(req);
    const { worldId, quality } = req.params as { worldId: string; quality: string };
    const operationId =
      req.query && typeof req.query === "object" && "operationId" in req.query
        ? (req.query["operationId"] as string | undefined)
        : undefined;

    const result = await proxyWorldSpzAsset({
      userId: user.id,
      worldId,
      quality,
      operationId,
    });

    if (result.kind === "error") {
      res.status(result.status).json(result.json);
      return;
    }

    res.setHeader("Content-Type", result.contentType);
    if (result.contentLength) {
      res.setHeader("Content-Length", result.contentLength);
    }
    if (result.selectedQuality) {
      res.setHeader("X-SPZ-Quality", result.selectedQuality);
    }
    res.setHeader("Cache-Control", "private, max-age=60");

    res.status(200).send(result.buffer);
  } catch (err) {
    if (!res.headersSent) {
      sendControllerError(res, err, "[spz]");
    }
  }
}
