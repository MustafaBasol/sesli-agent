import type { NextFunction, Request, Response } from "express";
import { logger } from "../utils/logger";

export class AppError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
  }
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: {
      message: "Not found",
      requestId: req.requestId,
    },
  });
}

// Express identifies error-handling middleware by arity, so all four
// parameters must stay declared even though `next` is unused.
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
): void {
  const statusCode = err instanceof AppError ? err.statusCode : 500;
  const message = err instanceof Error ? err.message : "Internal server error";

  logger.error({ err, requestId: req.requestId, statusCode }, "Request failed");

  res.status(statusCode).json({
    error: {
      message: statusCode >= 500 ? "Internal server error" : message,
      requestId: req.requestId,
    },
  });
}
