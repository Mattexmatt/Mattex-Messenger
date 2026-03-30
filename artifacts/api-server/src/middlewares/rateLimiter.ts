import { rateLimit } from "express-rate-limit";
import type { Request } from "express";
import type { AuthRequest } from "./auth";

const keyByUser = (req: Request) => {
  const userId = (req as AuthRequest).userId;
  return userId ? `user:${userId}` : (req.ip ?? "unknown");
};

const sharedValidate = { validate: { keyGeneratorIpFallback: false } };

export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please slow down." },
  ...sharedValidate,
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 12,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts. Try again in 15 minutes." },
  keyGenerator: (req) => req.ip ?? "unknown",
  ...sharedValidate,
});

export const messageLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Sending messages too fast. Slow down." },
  keyGenerator: keyByUser,
  ...sharedValidate,
});

export const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many AI requests per minute." },
  keyGenerator: keyByUser,
  ...sharedValidate,
});

export const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 12,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many file uploads per minute." },
  keyGenerator: keyByUser,
  ...sharedValidate,
});

export const registrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many accounts created from this IP. Try again in 1 hour." },
  keyGenerator: (req) => req.ip ?? "unknown",
  ...sharedValidate,
});
