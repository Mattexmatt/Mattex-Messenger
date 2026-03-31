import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { memesTable, memeLikesTable, usersTable } from "@workspace/db/schema";
import { eq, and, sql, desc, ne } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/auth";
import { sendMemeNotification } from "../lib/pushNotifications";

const router: IRouter = Router();

function formatMeme(meme: any, isLiked: boolean) {
  return {
    id: meme.id,
    imageUrl: meme.imageUrl,
    caption: meme.caption,
    status: meme.status ?? "active",
    isOfficial: meme.isOfficial ?? false,
    createdAt: meme.createdAt,
    authorId: meme.authorId,
    author: meme.author
      ? {
          id: meme.author.id,
          username: meme.author.username,
          displayName: meme.author.displayName,
          avatarUrl: meme.author.avatarUrl,
          isOwner: meme.author.isOwner,
          role: (meme.author as any).role ?? "user",
          warnCount: (meme.author as any).warnCount ?? 0,
          isBanned: (meme.author as any).isBanned ?? false,
          createdAt: meme.author.createdAt,
        }
      : null,
    likesCount: meme.likesCount,
    isLiked,
  };
}

router.get("/", async (req, res) => {
  const limit = parseInt((req.query.limit as string) ?? "30");
  const offset = parseInt((req.query.offset as string) ?? "0");

  const authHeader = req.headers.authorization;
  let currentUserId: number | undefined;
  let isOwner = false;
  if (authHeader?.startsWith("Bearer ")) {
    try {
      const { default: jwt } = await import("jsonwebtoken");
      const JWT_SECRET = process.env.JWT_SECRET ?? "mchat-secret-key-2024";
      const payload = jwt.verify(authHeader.slice(7), JWT_SECRET) as { userId: number };
      currentUserId = payload.userId;
      const [me] = await db.select({ isOwner: usersTable.isOwner }).from(usersTable).where(eq(usersTable.id, currentUserId));
      isOwner = me?.isOwner ?? false;
    } catch {}
  }

  const memes = await db.select({
    id: memesTable.id,
    imageUrl: memesTable.imageUrl,
    caption: memesTable.caption,
    status: memesTable.status,
    isOfficial: memesTable.isOfficial,
    createdAt: memesTable.createdAt,
    authorId: memesTable.authorId,
    author: {
      id: usersTable.id,
      username: usersTable.username,
      displayName: usersTable.displayName,
      avatarUrl: usersTable.avatarUrl,
      isOwner: usersTable.isOwner,
      role: usersTable.role,
      warnCount: (usersTable as any).warnCount,
      isBanned: (usersTable as any).isBanned,
      createdAt: usersTable.createdAt,
    },
    likesCount: sql<number>`(SELECT COUNT(*) FROM meme_likes WHERE meme_id = ${memesTable.id})::int`,
  }).from(memesTable)
    .leftJoin(usersTable, eq(memesTable.authorId, usersTable.id))
    .where(ne(memesTable.status, "removed"))
    .orderBy(desc(memesTable.isOfficial), desc(memesTable.createdAt))
    .limit(limit)
    .offset(offset);

  const result = await Promise.all(memes.map(async (meme) => {
    let isLiked = false;
    if (currentUserId) {
      const [like] = await db.select().from(memeLikesTable)
        .where(and(eq(memeLikesTable.memeId, meme.id), eq(memeLikesTable.userId, currentUserId)));
      isLiked = !!like;
    }
    return formatMeme(meme, isLiked);
  }));

  res.json(result);
});

router.post("/", requireAuth, async (req: AuthRequest, res) => {
  const { imageUrl, caption, isOfficial } = req.body;

  if (!imageUrl) {
    res.status(400).json({ error: "imageUrl required" });
    return;
  }

  const [me] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!));
  if (!me) { res.status(404).json({ error: "User not found" }); return; }
  if ((me as any).isBanned) {
    res.status(403).json({ error: "Your account has been banned for violating community guidelines." });
    return;
  }

  const official = !!(isOfficial && me.isOwner);

  const [meme] = await db.insert(memesTable).values({
    authorId: req.userId!,
    imageUrl,
    caption: caption ?? null,
    isOfficial: official,
  } as any).returning();

  res.status(201).json(formatMeme({ ...meme, author: { ...me, role: (me as any).role, warnCount: (me as any).warnCount, isBanned: (me as any).isBanned }, likesCount: 0 }, false));

  // Broadcast rich media notification to all other users — non-blocking
  sendMemeNotification(me.username, me.displayName, caption ?? null, meme.id, imageUrl, req.userId!).catch(() => {});
});

router.post("/:memeId/like", requireAuth, async (req: AuthRequest, res) => {
  const memeId = parseInt(req.params.memeId);
  const userId = req.userId!;

  const [existing] = await db.select().from(memeLikesTable)
    .where(and(eq(memeLikesTable.memeId, memeId), eq(memeLikesTable.userId, userId)));

  if (existing) {
    await db.delete(memeLikesTable)
      .where(and(eq(memeLikesTable.memeId, memeId), eq(memeLikesTable.userId, userId)));
  } else {
    await db.insert(memeLikesTable).values({ memeId, userId });
  }

  const [{ count }] = await db.select({
    count: sql<number>`COUNT(*)::int`,
  }).from(memeLikesTable).where(eq(memeLikesTable.memeId, memeId));

  res.json({ liked: !existing, likesCount: count });
});

// Owner: remove a meme
router.delete("/:memeId", requireAuth, async (req: AuthRequest, res) => {
  const [me] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!));
  if (!me?.isOwner) { res.status(403).json({ error: "Owner only" }); return; }
  const memeId = parseInt(req.params.memeId);
  await db.update(memesTable).set({ status: "removed" }).where(eq(memesTable.id, memeId));
  res.json({ ok: true });
});

// Owner: flag a meme as inappropriate
router.patch("/:memeId/flag", requireAuth, async (req: AuthRequest, res) => {
  const [me] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!));
  if (!me?.isOwner) { res.status(403).json({ error: "Owner only" }); return; }
  const memeId = parseInt(req.params.memeId);
  const { status } = req.body as { status?: "flagged" | "active" };
  await db.update(memesTable).set({ status: status ?? "flagged" }).where(eq(memesTable.id, memeId));
  res.json({ ok: true });
});

// Owner: warn a user (auto-ban at 3 warnings)
router.post("/:userId/warn", requireAuth, async (req: AuthRequest, res) => {
  const [me] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!));
  if (!me?.isOwner) { res.status(403).json({ error: "Owner only" }); return; }
  const targetId = parseInt(req.params.userId);
  const [target] = await db.select().from(usersTable).where(eq(usersTable.id, targetId));
  if (!target) { res.status(404).json({ error: "User not found" }); return; }
  const newWarnCount = (target.warnCount ?? 0) + 1;
  const autoBan = newWarnCount >= 3;
  await db.update(usersTable)
    .set({ warnCount: newWarnCount, ...(autoBan ? { isBanned: true } : {}) })
    .where(eq(usersTable.id, targetId));
  res.json({ warnCount: newWarnCount, isBanned: autoBan });
});

// Owner: ban or unban a user
router.patch("/:userId/ban", requireAuth, async (req: AuthRequest, res) => {
  const [me] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!));
  if (!me?.isOwner) { res.status(403).json({ error: "Owner only" }); return; }
  const targetId = parseInt(req.params.userId);
  const { banned } = req.body as { banned: boolean };
  await db.update(usersTable).set({ isBanned: !!banned }).where(eq(usersTable.id, targetId));
  res.json({ ok: true, isBanned: !!banned });
});

export default router;
