import type { Request, Response, NextFunction } from "express";
import { config } from "../db/config";

export interface CustomError extends Error {
  status?: number;
  /** @deprecated Prefer `status`; kept for callers that still set `statusCode`. */
  statusCode?: number;
  /** PostgreSQL error code when thrown by `pg` / Drizzle. */
  code?: string;
}

export const errorHandler = (
  err: CustomError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  console.error(err.stack ?? err);

  let status = err.status ?? err.statusCode ?? 500;
  let message = err.message || "Internal Server Error";

  if (err.name === "ValidationError") {
    status = 400;
    message = "Validation Error";
  }

  if (err.name === "UnauthorizedError") {
    status = 401;
    message = "Unauthorized";
  }

  if (err.code === "23505") {
    status = 409;
    message = "Resource already exists";
  }

  if (err.code === "23503") {
    status = 400;
    message = "Invalid reference";
  }

  if (res.headersSent) {
    next(err);
    return;
  }

  res.status(status).json({
    error: message,
    ...(config.isDev && {
      stack: err.stack,
      details: err.message,
      path: req.originalUrl,
    }),
  });
};

export const notFound = (req: Request, res: Response, next: NextFunction): void => {
  const error = new Error(`Not found - ${req.originalUrl}`) as CustomError;
  error.status = 404;
  next(error);
};
