import type { Request as ExpressRequest, Response } from "express";
import { env } from "../env";

/**
 * Better Auth redirects here over HTTPS after the user taps the email link.
 * Many mail clients won't open custom schemes directly; this page forwards to the app.
 */
export function resetMobileBridgeHandler(req: ExpressRequest, res: Response): void {
  const schemeRaw = env.mobileAppScheme.trim();
  const scheme = schemeRaw.replace(/:$/, "") || "decor-ai";

  const token = typeof req.query.token === "string" ? req.query.token : undefined;
  const error = typeof req.query.error === "string" ? req.query.error : undefined;

  const qs = new URLSearchParams();
  if (token) qs.set("token", token);
  if (error) qs.set("error", error);
  const q = qs.toString();
  const deepLink = q ? `${scheme}://reset-password?${q}` : `${scheme}://reset-password`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");

  const escapedForHref = deepLink.replace(/&/g, "&amp;").replace(/"/g, "&quot;");

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <meta http-equiv="refresh" content="0;url=${deepLink}"/>
  <title>Deco-Smart — continue in app</title>
  <style>
    body { font-family: system-ui, sans-serif; padding: 24px; max-width: 520px; margin: auto;
      background: #f5efe6; color: #3e2f28; line-height: 1.45; }
    a { color: #c46a4a; font-weight: 600; word-break: break-all; }
    p.sub { font-size: 14px; color: #57534e; }
  </style>
</head>
<body>
  <h1 style="font-size:1.25rem;">Opening Deco-Smart…</h1>
  <p>If the app does not open automatically, tap the link below.</p>
  <p><a href="${escapedForHref}">Open Deco-Smart to reset password</a></p>
  <p class="sub">After you set a new password in the app, you can close this browser tab.</p>
</body>
</html>`);
}
