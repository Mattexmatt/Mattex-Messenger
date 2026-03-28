import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { userSessionsTable } from "@workspace/db/schema";
import { eq, and, desc, ne } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/", requireAuth, async (req: AuthRequest, res) => {
  const userId = req.userId!;
  const currentJti = req.jti;

  const sessions = await db
    .select()
    .from(userSessionsTable)
    .where(and(eq(userSessionsTable.userId, userId), eq(userSessionsTable.isActive, true)))
    .orderBy(desc(userSessionsTable.lastActiveAt));

  res.json(
    sessions.map((s) => ({
      id: s.id,
      deviceName: s.deviceName,
      platform: s.platform,
      ipAddress: s.ipAddress,
      lastActiveAt: s.lastActiveAt,
      createdAt: s.createdAt,
      isCurrent: s.jti === currentJti,
    }))
  );
});

router.get("/alerts", requireAuth, async (req: AuthRequest, res) => {
  const userId = req.userId!;
  const currentJti = req.jti;
  const since = req.query.since as string | undefined;

  const sinceDate = since ? new Date(since) : new Date(Date.now() - 24 * 60 * 60 * 1000);

  const allSessions = await db
    .select()
    .from(userSessionsTable)
    .where(and(eq(userSessionsTable.userId, userId), eq(userSessionsTable.isActive, true)))
    .orderBy(desc(userSessionsTable.createdAt));

  const newSessions = allSessions.filter(
    (s) => s.jti !== currentJti && new Date(s.createdAt) > sinceDate
  );

  res.json(
    newSessions.map((s) => ({
      id: s.id,
      deviceName: s.deviceName,
      platform: s.platform,
      ipAddress: s.ipAddress,
      createdAt: s.createdAt,
    }))
  );
});

router.delete("/:id", requireAuth, async (req: AuthRequest, res) => {
  const userId = req.userId!;
  const sessionId = parseInt(req.params.id);

  const [session] = await db
    .select()
    .from(userSessionsTable)
    .where(and(eq(userSessionsTable.id, sessionId), eq(userSessionsTable.userId, userId)));

  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  if (session.jti === req.jti) {
    res.status(400).json({ error: "Cannot revoke your current session" });
    return;
  }

  await db
    .update(userSessionsTable)
    .set({ isActive: false })
    .where(eq(userSessionsTable.id, sessionId));

  res.json({ ok: true });
});

router.delete("/", requireAuth, async (req: AuthRequest, res) => {
  const userId = req.userId!;
  const currentJti = req.jti;

  await db
    .update(userSessionsTable)
    .set({ isActive: false })
    .where(
      and(
        eq(userSessionsTable.userId, userId),
        eq(userSessionsTable.isActive, true),
        currentJti ? ne(userSessionsTable.jti, currentJti) : eq(userSessionsTable.isActive, true)
      )
    );

  res.json({ ok: true });
});

export default router;
