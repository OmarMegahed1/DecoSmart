import { Request, Response, NextFunction } from "express";
import { auth } from "./better-auth";

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
