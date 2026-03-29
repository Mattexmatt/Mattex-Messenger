import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable, messagesTable, conversationsTable, memesTable } from "@workspace/db/schema";
import { eq, sql, desc, and, gte } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/auth";

const router: IRouter = Router();

async function assertOwner(req: AuthRequest, res: any): Promise<boolean> {
  const [me] = await db.select({ isOwner: usersTable.isOwner }).from(usersTable).where(eq(usersTable.id, req.userId!));
  if (!me?.isOwner) {
    res.status(403).json({ error: "Owner access required" });
    return false;
  }
  return true;
}

// GET /admin/stats — system-wide statistics
router.get("/stats", requireAuth, async (req: AuthRequest, res) => {
  if (!await assertOwner(req, res)) return;

  const [userStats] = await db.select({
    total: sql<number>`COUNT(*)::int`,
    banned: sql<number>`COUNT(*) FILTER (WHERE is_banned = true)::int`,
    vip: sql<number>`COUNT(*) FILTER (WHERE role = 'vip')::int`,
    newToday: sql<number>`COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours')::int`,
  }).from(usersTable);

  const [messageStats] = await db.select({
    total: sql<number>`COUNT(*)::int`,
    today: sql<number>`COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours')::int`,
    thisWeek: sql<number>`COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::int`,
  }).from(messagesTable);

  const [convStats] = await db.select({
    total: sql<number>`COUNT(*)::int`,
  }).from(conversationsTable);

  const [memeStats] = await db.select({
    total: sql<number>`COUNT(*)::int`,
    official: sql<number>`COUNT(*) FILTER (WHERE is_official = true)::int`,
    flagged: sql<number>`COUNT(*) FILTER (WHERE status = 'flagged')::int`,
    removed: sql<number>`COUNT(*) FILTER (WHERE status = 'removed')::int`,
  }).from(memesTable);

  res.json({
    users: userStats,
    messages: messageStats,
    conversations: convStats,
    memes: memeStats,
    generatedAt: new Date().toISOString(),
  });
});

// GET /admin/users — full user roster
router.get("/users", requireAuth, async (req: AuthRequest, res) => {
  if (!await assertOwner(req, res)) return;

  const users = await db.select({
    id: usersTable.id,
    username: usersTable.username,
    displayName: usersTable.displayName,
    avatarUrl: usersTable.avatarUrl,
    isOwner: usersTable.isOwner,
    role: usersTable.role,
    warnCount: usersTable.warnCount,
    isBanned: usersTable.isBanned,
    createdAt: usersTable.createdAt,
    messageCount: sql<number>`(SELECT COUNT(*)::int FROM messages WHERE sender_id = ${usersTable.id})`,
  }).from(usersTable)
    .orderBy(desc(usersTable.isOwner), desc(sql`CASE WHEN role = 'vip' THEN 1 ELSE 0 END`), desc(usersTable.createdAt));

  res.json(users);
});

// PATCH /admin/users/:id — update user (role, ban, warn)
router.patch("/users/:id", requireAuth, async (req: AuthRequest, res) => {
  if (!await assertOwner(req, res)) return;
  const targetId = parseInt(req.params.id);
  const { role, isBanned, warnCount } = req.body as { role?: string; isBanned?: boolean; warnCount?: number };
  const updates: Record<string, any> = {};
  if (role !== undefined) updates.role = role;
  if (isBanned !== undefined) updates.isBanned = isBanned;
  if (warnCount !== undefined) updates.warnCount = warnCount;
  if (Object.keys(updates).length === 0) { res.status(400).json({ error: "Nothing to update" }); return; }
  const [updated] = await db.update(usersTable).set(updates).where(eq(usersTable.id, targetId)).returning();
  res.json(updated);
});

// POST /admin/broadcast — post an official meme/announcement
router.post("/broadcast", requireAuth, async (req: AuthRequest, res) => {
  if (!await assertOwner(req, res)) return;
  const { imageUrl, caption } = req.body as { imageUrl: string; caption?: string };
  if (!imageUrl) { res.status(400).json({ error: "imageUrl required" }); return; }
  const [meme] = await db.insert(memesTable).values({
    authorId: req.userId!,
    imageUrl,
    caption: caption ?? null,
    isOfficial: true,
  } as any).returning();
  res.status(201).json(meme);
});

export default router;
