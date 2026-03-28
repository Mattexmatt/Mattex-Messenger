import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { statusesTable, usersTable, conversationsTable, statusViewsTable } from "@workspace/db/schema";
import { eq, or, and, gt, desc, inArray, sql } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/auth";

const router: IRouter = Router();

function formatStatus(s: typeof statusesTable.$inferSelect, user: typeof usersTable.$inferSelect) {
  return {
    id: s.id,
    userId: s.userId,
    mediaUrl: s.mediaUrl,
    caption: s.caption,
    type: s.type,
    expiresAt: s.expiresAt,
    createdAt: s.createdAt,
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
    },
  };
}

router.get("/", requireAuth, async (req: AuthRequest, res) => {
  const userId = req.userId!;
  const now = new Date();

  const convs = await db.select().from(conversationsTable)
    .where(or(eq(conversationsTable.user1Id, userId), eq(conversationsTable.user2Id, userId)));

  const contactIds = convs.map(c => c.user1Id === userId ? c.user2Id : c.user1Id);
  const allUserIds = [userId, ...contactIds];

  const statuses = await db.select().from(statusesTable)
    .where(and(inArray(statusesTable.userId, allUserIds), gt(statusesTable.expiresAt, now)))
    .orderBy(desc(statusesTable.createdAt));

  const users = await db.select().from(usersTable)
    .where(inArray(usersTable.id, allUserIds));
  const userMap = Object.fromEntries(users.map(u => [u.id, u]));

  res.json(statuses.map(s => formatStatus(s, userMap[s.userId])));
});

router.get("/mine", requireAuth, async (req: AuthRequest, res) => {
  const userId = req.userId!;
  const now = new Date();

  const statuses = await db.select().from(statusesTable)
    .where(and(eq(statusesTable.userId, userId), gt(statusesTable.expiresAt, now)))
    .orderBy(desc(statusesTable.createdAt));

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  res.json(statuses.map(s => formatStatus(s, user)));
});

router.post("/", requireAuth, async (req: AuthRequest, res) => {
  const { mediaUrl, caption, type = "image" } = req.body;

  if (!mediaUrl) {
    res.status(400).json({ error: "mediaUrl required" });
    return;
  }

  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const [status] = await db.insert(statusesTable).values({
    userId: req.userId!,
    mediaUrl,
    caption: caption || null,
    type,
    expiresAt,
  }).returning();

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!));
  res.status(201).json(formatStatus(status, user));
});

// Mark a status as viewed (idempotent — ignores own views)
router.post("/:id/view", requireAuth, async (req: AuthRequest, res) => {
  const statusId = parseInt(req.params.id, 10);
  const viewerId = req.userId!;

  const [status] = await db.select().from(statusesTable).where(eq(statusesTable.id, statusId));
  if (!status) { res.status(404).json({ error: "Status not found" }); return; }
  // Don't count owner's own view
  if (status.userId === viewerId) { res.json({ ok: true }); return; }

  await db.insert(statusViewsTable)
    .values({ statusId, viewerId })
    .onConflictDoNothing();

  res.json({ ok: true });
});

// Get viewers for a status (only accessible by the status owner)
router.get("/:id/views", requireAuth, async (req: AuthRequest, res) => {
  const statusId = parseInt(req.params.id, 10);
  const userId = req.userId!;

  const [status] = await db.select().from(statusesTable).where(eq(statusesTable.id, statusId));
  if (!status) { res.status(404).json({ error: "Status not found" }); return; }
  if (status.userId !== userId) { res.status(403).json({ error: "Forbidden" }); return; }

  const views = await db
    .select({ viewer: usersTable, viewedAt: statusViewsTable.createdAt })
    .from(statusViewsTable)
    .innerJoin(usersTable, eq(statusViewsTable.viewerId, usersTable.id))
    .where(eq(statusViewsTable.statusId, statusId))
    .orderBy(desc(statusViewsTable.createdAt));

  res.json(views.map(v => ({
    user: {
      id: v.viewer.id,
      username: v.viewer.username,
      displayName: v.viewer.displayName,
      avatarUrl: v.viewer.avatarUrl,
    },
    viewedAt: v.viewedAt,
  })));
});

router.delete("/:id", requireAuth, async (req: AuthRequest, res) => {
  const id = parseInt(req.params.id);
  await db.delete(statusesTable)
    .where(and(eq(statusesTable.id, id), eq(statusesTable.userId, req.userId!)));
  res.json({ success: true });
});

export default router;
