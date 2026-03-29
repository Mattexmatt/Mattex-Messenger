import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { callLogsTable, usersTable } from "@workspace/db/schema";
import { eq, or, desc, and } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/", requireAuth, async (req: AuthRequest, res) => {
  const userId = req.userId!;

  const logs = await db
    .select({
      id: callLogsTable.id,
      callerId: callLogsTable.callerId,
      calleeId: callLogsTable.calleeId,
      type: callLogsTable.type,
      status: callLogsTable.status,
      duration: callLogsTable.duration,
      createdAt: callLogsTable.createdAt,
      caller: {
        id: usersTable.id,
        displayName: usersTable.displayName,
        username: usersTable.username,
        avatarUrl: usersTable.avatarUrl,
      },
    })
    .from(callLogsTable)
    .leftJoin(usersTable, eq(callLogsTable.callerId, usersTable.id))
    .where(or(eq(callLogsTable.callerId, userId), eq(callLogsTable.calleeId, userId)))
    .orderBy(desc(callLogsTable.createdAt))
    .limit(100);

  const result = [];
  for (const log of logs) {
    const otherId = log.callerId === userId ? log.calleeId : log.callerId;
    const [otherUser] = await db
      .select({ id: usersTable.id, displayName: usersTable.displayName, username: usersTable.username, avatarUrl: usersTable.avatarUrl })
      .from(usersTable)
      .where(eq(usersTable.id, otherId));
    result.push({ ...log, otherUser: otherUser ?? null });
  }

  res.json(result);
});

router.post("/", requireAuth, async (req: AuthRequest, res) => {
  const userId = req.userId!;
  const { calleeId, type = "audio", status = "missed", duration = 0 } = req.body;

  if (!calleeId) { res.status(400).json({ error: "calleeId required" }); return; }

  const [log] = await db.insert(callLogsTable).values({
    callerId: userId,
    calleeId: parseInt(calleeId),
    type,
    status,
    duration,
  }).returning();

  res.json(log);
});

router.patch("/:id", requireAuth, async (req: AuthRequest, res) => {
  const logId = parseInt(req.params.id);
  const { status, duration } = req.body;

  const updates: Record<string, unknown> = {};
  if (status) updates.status = status;
  if (duration !== undefined) updates.duration = duration;

  await db.update(callLogsTable).set(updates).where(eq(callLogsTable.id, logId));
  res.json({ ok: true });
});

export default router;
