import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../routes/auth";
import { isBanned } from "../lib/sentinel";

export interface AuthRequest extends Request {
  userId?: number;
  jti?: string;
  deviceId?: string;
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId: number; jti?: string; deviceId?: string };
    req.userId = payload.userId;
    req.jti = payload.jti;
    req.deviceId = payload.deviceId;

    const ban = isBanned(payload.userId, req.ip ?? undefined);
    if (ban) {
      const remaining = Math.ceil((ban.expiresAt - Date.now()) / 60_000);
      res.status(429).json({ error: `Your account is temporarily restricted. Try again in ${remaining} minute${remaining !== 1 ? "s" : ""}.` });
      return;
    }

    if (payload.deviceId) {
      const headerDeviceId = req.headers["x-device-id"] as string | undefined;
      if (headerDeviceId && headerDeviceId !== payload.deviceId) {
        res.status(401).json({ error: "Device mismatch. Please log in again." });
        return;
      }
    }

    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}
