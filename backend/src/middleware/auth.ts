import { Request, Response, NextFunction } from "express";
import { auth } from "./better-auth";
import { HttpError } from "../lib/httpError";

export interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    email: string;
    name: string;
  };
  authSession: {
    id: string;
    token: string;
  };
}

/**
 * Express middleware that validates the Better Auth session (Cookie header from web or native).
 * Attaches req.user and req.authSession on success.
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const session = await auth.api.getSession({
      headers: new Headers(req.headers as Record<string, string>),
    });

    if (!session?.user || !session?.session) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    (req as AuthenticatedRequest).user = {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
    };
    (req as AuthenticatedRequest).authSession = {
      id: session.session.id,
      token: session.session.token,
    };

    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired session" });
  }
}

/**
 * Call at the start of handlers guarded by `router.use(requireAuth)`.
 * If auth was omitted, throws {@link HttpError} so mis-ordered routes fail visibly instead of `req.user` being undefined.
 */
export function requireUser(req: Request): AuthenticatedRequest {
  const r = req as AuthenticatedRequest;
  if (
    !r.user ||
    typeof r.user.id !== "string" ||
    !r.authSession ||
    typeof r.authSession.token !== "string"
  ) {
    throw new HttpError(
      500,
      "Internal: route missing requireAuth before requireUser()",
      false
    );
  }
  return r;
}
