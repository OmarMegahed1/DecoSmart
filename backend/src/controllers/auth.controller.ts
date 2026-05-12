import { Request as ExpressRequest, Response } from "express";
import { auth } from "../middleware/better-auth";
import { config } from "../db/config";

export async function handleAuthRequest(req: ExpressRequest, res: Response): Promise<void> {
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
  /**
   * Better Auth sets several `Set-Cookie` headers (e.g. session token + cookie cache).
   * `res.setHeader("Set-Cookie", …)` overwrites on each call — use `append` so the client
   * (and Expo’s manual cookie jar) receives every cookie.
   */
  webResponse.headers.forEach((value: string, key: string) => {
    if (key.toLowerCase() === "set-cookie") {
      res.append("Set-Cookie", value);
    } else {
      res.setHeader(key, value);
    }
  });
  res.send(text);
}
