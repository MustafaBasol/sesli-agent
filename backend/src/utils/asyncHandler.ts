import type { NextFunction, Request, Response } from "express";

// Express 4 does not catch rejected promises from async handlers/middleware —
// an unhandled rejection there crashes the process instead of reaching
// errorHandler. Wrap every async handler with this so failures (e.g. the
// database being unreachable) become a normal 500 response.
export function asyncHandler<Req extends Request = Request>(
  fn: (req: Req, res: Response, next: NextFunction) => Promise<unknown>
) {
  return (req: Req, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}
