import jwt from "jsonwebtoken";
import { env, jwtSecret } from "../config/env";

// Intentionally minimal: only the user id. Roles/restaurant access are
// resolved from the database on every request (see services/restaurantAccess.ts)
// rather than trusted from the token, so a stale or forged claim can't grant
// access that the database doesn't back.
export interface AuthTokenPayload {
  sub: string;
}

export function signAuthToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, jwtSecret, { expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"] });
}

export function verifyAuthToken(token: string): AuthTokenPayload {
  const decoded = jwt.verify(token, jwtSecret);
  if (typeof decoded === "string" || !decoded.sub) {
    throw new Error("Invalid token payload");
  }
  return { sub: decoded.sub };
}
