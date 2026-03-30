import type { Request, Response, NextFunction } from "express";
import { logger } from "../lib/logger";

const DANGEROUS_PATTERNS = [
  /<script[\s\S]*?>[\s\S]*?<\/script>/gi,
  /javascript\s*:/gi,
  /on\w+\s*=/gi,
  /\x00/g,
  /\u0000/g,
];

const INJECTION_SIGNATURES = [
  /'\s*(or|and)\s*'?\d/i,
  /;\s*(drop|delete|truncate|alter)\s+/i,
  /union\s+(all\s+)?select/i,
  /<\s*script/i,
  /eval\s*\(/i,
  /expression\s*\(/i,
];

const MAX_FIELD_LENGTHS: Record<string, number> = {
  username: 40,
  displayName: 80,
  password: 200,
  email: 200,
  status: 160,
  bio: 500,
};

function sanitizeString(value: string, fieldName?: string): string {
  let s = value;
  for (const pattern of DANGEROUS_PATTERNS) {
    s = s.replace(pattern, "");
  }
  if (fieldName && MAX_FIELD_LENGTHS[fieldName] !== undefined) {
    s = s.slice(0, MAX_FIELD_LENGTHS[fieldName]);
  }
  return s;
}

function walkAndSanitize(obj: unknown, path = ""): unknown {
  if (typeof obj === "string") {
    return sanitizeString(obj, path.split(".").pop());
  }
  if (Array.isArray(obj)) {
    return obj.map((item, i) => walkAndSanitize(item, `${path}[${i}]`));
  }
  if (obj !== null && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
      result[key] = walkAndSanitize(val, path ? `${path}.${key}` : key);
    }
    return result;
  }
  return obj;
}

function detectInjection(body: unknown, ip: string): boolean {
  const flat = JSON.stringify(body);
  for (const pattern of INJECTION_SIGNATURES) {
    if (pattern.test(flat)) {
      logger.warn({ ip, body: flat.slice(0, 300), pattern: pattern.toString() }, "Injection attempt detected");
      return true;
    }
  }
  return false;
}

export function sanitizeBody(req: Request, _res: Response, next: NextFunction) {
  if (req.body && typeof req.body === "object") {
    const ip = req.ip ?? "unknown";
    const isInjection = detectInjection(req.body, ip);
    if (isInjection) {
      logger.warn({ ip, url: req.url, method: req.method }, "[Sentinel] Injection attempt — sanitizing and logging");
    }
    req.body = walkAndSanitize(req.body);
  }
  next();
}
