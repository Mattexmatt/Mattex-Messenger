import http from "http";
import app from "./app";
import { setupWS, pushForceLogout } from "./ws";
import { logger } from "./lib/logger";
import { deliverDueMessages } from "./routes/scheduled";
import { db } from "@workspace/db";
import { userSessionsTable } from "@workspace/db/schema";
import { and, eq, lt } from "drizzle-orm";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = http.createServer(app);
setupWS(server);

server.listen(port, (err?: Error) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }
  logger.info({ port }, "Server listening");
});

// ── Time-capsule delivery — every 30 seconds ──────────────────────────────────
setInterval(deliverDueMessages, 30_000);
deliverDueMessages();

// ── Session auto-timeout — expire sessions idle for 30+ minutes ───────────────
async function expireIdleSessions() {
  const cutoff = new Date(Date.now() - 30 * 60 * 1000);
  try {
    const expired = await db
      .select({ jti: userSessionsTable.jti })
      .from(userSessionsTable)
      .where(and(eq(userSessionsTable.isActive, true), lt(userSessionsTable.lastActiveAt, cutoff)));

    for (const { jti } of expired) {
      pushForceLogout(jti);
    }

    if (expired.length > 0) {
      await db
        .update(userSessionsTable)
        .set({ isActive: false })
        .where(and(eq(userSessionsTable.isActive, true), lt(userSessionsTable.lastActiveAt, cutoff)));
      logger.info({ count: expired.length }, "Auto-expired idle sessions");
    }
  } catch (err) {
    logger.error({ err }, "Session auto-timeout error");
  }
}

setInterval(expireIdleSessions, 5 * 60 * 1000);
expireIdleSessions();
