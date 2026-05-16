import type { Response } from "express";
import { env } from "../env";
import { HttpError } from "./httpError";

/** Map DB / domain errors to HTTP responses; avoids leaking internals in production. */
export function sendControllerError(res: Response, err: unknown, logPrefix = "[api]"): void {
  if (err instanceof HttpError) {
    const body = err.expose ? err.message : fallbackMessageForStatus(err.status);
    if (err.status >= 500) {
      console.error(`${logPrefix} ${err.status}:`, err.message, err.cause ?? "");
    } else if (env.isDev) {
      console.warn(`${logPrefix} ${err.status}:`, err.message);
    }
    res.status(err.status).json({ error: body });
    return;
  }

  const code =
    err && typeof err === "object" && "code" in err ? String((err as { code: unknown }).code) : "";

  if (code === "23505") {
    res.status(409).json({ error: "Resource already exists" });
    return;
  }
  if (code === "23503") {
    res.status(400).json({ error: "Invalid reference" });
    return;
  }

  const message = err instanceof Error ? err.message : "Unknown error";
  console.error(`${logPrefix} 500:`, err);
  res.status(500).json({
    error: env.isDev ? message : "Something went wrong. Please try again.",
  });
}

function fallbackMessageForStatus(status: number): string {
  if (status === 404) return "Not found";
  if (status === 403) return "Forbidden";
  if (status === 400) return "Bad request";
  return "Something went wrong.";
}
