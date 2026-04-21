import { Router, Request as ExpressRequest, Response } from "express";
import { auth } from "../middleware/better-auth";
import { config } from "../db/config";

const router = Router();

router.all("/*", async (req: ExpressRequest, res: Response) => {
  const fullPath = `/auth${req.url}`;
  const url = new URL(fullPath, config.auth.url);

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value) {
      headers.set(key, Array.isArray(value) ? value.join(", ") : String(value));
    }
  }

  let body: string | undefined;
  if (req.method !== "GET" && req.method !== "HEAD") {
    body = JSON.stringify(req.body);
    headers.set("Content-Type", "application/json");
  }

  // Use globalThis.Request to avoid clashing with Express's Request import
  const webRequest = new globalThis.Request(url.toString(), {
    method: req.method,
    headers,
    body,
  });

  const webResponse = await auth.handler(webRequest);

  const text = await webResponse.text();
  if (webResponse.status >= 400) {
    console.error(`[auth] ${req.method} ${fullPath} → ${webResponse.status}:`, text);
  }

  res.status(webResponse.status);
  webResponse.headers.forEach((value: string, key: string) => res.setHeader(key, value));
  res.send(text);
});

export default router;
