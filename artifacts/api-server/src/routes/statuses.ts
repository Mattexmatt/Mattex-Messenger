import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { statusesTable, usersTable, conversationsTable } from "@workspace/db/schema";
import { eq, or, and, gt, desc, inArray } from "drizzle-orm";
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

router.delete("/:id", requireAuth, async (req: AuthRequest, res) => {
  const id = parseInt(req.params.id);
  await db.delete(statusesTable)
    .where(and(eq(statusesTable.id, id), eq(statusesTable.userId, req.userId!)));
  res.json({ success: true });
});

export default router;
