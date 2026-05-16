/**
 * Structured HTTP error for controllers/middleware.
 * The global `errorHandler` maps this to a response; `expose === false` yields a generic client message for 5xx.
 */
export class HttpError extends Error {
  readonly name = "HttpError";

  constructor(
    readonly status: number,
    message: string,
    /** When false, clients see a generic body for this status (still logged server). */
    readonly expose = true,
    readonly cause?: unknown
  ) {
    super(message);
    if (cause !== undefined && (this as any).cause === undefined) {
      (this as any).cause = cause;
    }
  }
}
