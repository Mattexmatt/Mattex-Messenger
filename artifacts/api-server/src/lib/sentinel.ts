import { logger } from "./logger";

export type ThreatLevel = "low" | "medium" | "high" | "critical";

export interface SentinelEvent {
  ts: number;
  type: string;
  userId?: number;
  ip?: string;
  detail: string;
  threat: ThreatLevel;
}

export interface BanRecord {
  userId?: number;
  ip?: string;
  reason: string;
  bannedAt: number;
  expiresAt: number;
}

const MAX_LOG = 2000;
const events: SentinelEvent[] = [];

const msgTimestamps = new Map<number, number[]>();
const ipMsgTimestamps = new Map<string, number[]>();
const ipNewAccounts = new Map<string, number[]>();
const tempBans = new Map<string, BanRecord>();

function log(event: Omit<SentinelEvent, "ts">) {
  const entry: SentinelEvent = { ...event, ts: Date.now() };
  events.push(entry);
  if (events.length > MAX_LOG) events.shift();
  logger.warn(entry, `[Sentinel] ${event.type}: ${event.detail}`);
}

function banKey(userId?: number, ip?: string) {
  return userId ? `user:${userId}` : `ip:${ip ?? "unknown"}`;
}

export function tempBan(userId: number | undefined, ip: string | undefined, reason: string, durationMs = 5 * 60 * 1000) {
  const key = banKey(userId, ip);
  const now = Date.now();
  const record: BanRecord = { userId, ip, reason, bannedAt: now, expiresAt: now + durationMs };
  tempBans.set(key, record);
  log({ type: "TEMP_BAN", userId, ip, detail: reason, threat: "high" });
}

export function isBanned(userId?: number, ip?: string): BanRecord | null {
  const key = banKey(userId, ip);
  const record = tempBans.get(key);
  if (!record) return null;
  if (Date.now() > record.expiresAt) {
    tempBans.delete(key);
    return null;
  }
  return record;
}

function pruneOlderThan(arr: number[], windowMs: number) {
  const cutoff = Date.now() - windowMs;
  return arr.filter(t => t >= cutoff);
}

export function checkMessageVelocity(userId: number, ip: string): { blocked: boolean; reason?: string } {
  const now = Date.now();

  let userTs = pruneOlderThan(msgTimestamps.get(userId) ?? [], 30_000);
  userTs.push(now);
  msgTimestamps.set(userId, userTs);

  let ipTs = pruneOlderThan(ipMsgTimestamps.get(ip) ?? [], 60_000);
  ipTs.push(now);
  ipMsgTimestamps.set(ip, ipTs);

  if (userTs.length > 20) {
    const reason = `Flood: ${userTs.length} messages in 30s`;
    tempBan(userId, ip, reason, 5 * 60 * 1000);
    log({ type: "FLOOD_DETECTED", userId, ip, detail: reason, threat: "high" });
    return { blocked: true, reason: "You are sending messages too fast. Please wait a moment." };
  }

  if (ipTs.length > 60) {
    const reason = `IP flood: ${ipTs.length} messages in 60s`;
    tempBan(undefined, ip, reason, 10 * 60 * 1000);
    log({ type: "IP_FLOOD_DETECTED", ip, detail: reason, threat: "critical" });
    return { blocked: true, reason: "Suspicious activity detected from your network." };
  }

  return { blocked: false };
}

export function checkDuplicateContent(userId: number, content: string): boolean {
  const key = `dup:${userId}`;
  const stored = (global as any)[key] as string[] | undefined ?? [];
  const recent = [...stored, content].slice(-10);
  (global as any)[key] = recent;
  const dupes = recent.filter(m => m === content);
  if (dupes.length >= 5) {
    log({ type: "DUPLICATE_SPAM", userId, detail: `Same message repeated ${dupes.length}x`, threat: "medium" });
    return true;
  }
  return false;
}

export function recordNewAccount(ip: string) {
  const ts = pruneOlderThan(ipNewAccounts.get(ip) ?? [], 60 * 60 * 1000);
  ts.push(Date.now());
  ipNewAccounts.set(ip, ts);
  if (ts.length >= 4) {
    log({ type: "SWARM_DETECTED", ip, detail: `${ts.length} new accounts from same IP in 1hr`, threat: "critical" });
    tempBan(undefined, ip, `Swarm: ${ts.length} accounts in 1hr`, 60 * 60 * 1000);
  }
}

export function getRecentEvents(limit = 100): SentinelEvent[] {
  return events.slice(-limit).reverse();
}

export function getActiveBans(): BanRecord[] {
  const now = Date.now();
  const active: BanRecord[] = [];
  for (const [key, record] of tempBans.entries()) {
    if (now < record.expiresAt) active.push(record);
    else tempBans.delete(key);
  }
  return active;
}

export function liftBan(userId?: number, ip?: string) {
  const key = banKey(userId, ip);
  tempBans.delete(key);
  log({ type: "BAN_LIFTED", userId, ip, detail: "Manually lifted by admin", threat: "low" });
}

setInterval(() => {
  const now = Date.now();
  for (const [key, record] of tempBans.entries()) {
    if (now >= record.expiresAt) tempBans.delete(key);
  }
}, 60_000);
