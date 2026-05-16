import type { Request, Response, NextFunction } from "express";
import { env } from "../env";
import { HttpError } from "../lib/httpError";

export interface CustomError extends Error {
  status?: number;
  /** @deprecated Prefer `status`; kept for callers that still set `statusCode`. */
  statusCode?: number;
  /** PostgreSQL error code when thrown by `pg` / Drizzle. */
  code?: string;
}

export const errorHandler = (
  err: CustomError | HttpError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (err instanceof HttpError) {
    const status = err.status;
    const message =
      err.expose && err.message
        ? err.message
        : status === 404
          ? "Not found"
          : status >= 500
            ? "Something went wrong."
            : "Request could not be completed.";
    if (status >= 500) {
      console.error("[http]", status, err.message, err.cause ?? "");
    } else if (env.isDev) {
      console.warn("[http]", status, err.message);
    }
    if (res.headersSent) {
      next(err);
      return;
    }
    res.status(status).json({
      error: message,
      ...(env.isDev && {
        details: err.message,
        path: req.originalUrl,
      }),
    });
    return;
  }

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

  const clientMessage =
    status >= 500 && !env.isDev ? "Something went wrong. Please try again." : message;

  res.status(status).json({
    error: clientMessage,
    ...(env.isDev && {
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
