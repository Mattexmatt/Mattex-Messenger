import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { memesTable, memeLikesTable, usersTable } from "@workspace/db/schema";
import { eq, and, sql, desc } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/", async (req, res) => {
  const limit = parseInt((req.query.limit as string) ?? "20");
  const offset = parseInt((req.query.offset as string) ?? "0");

  const authHeader = req.headers.authorization;
  let currentUserId: number | undefined;
  if (authHeader?.startsWith("Bearer ")) {
    try {
      const { default: jwt } = await import("jsonwebtoken");
      const JWT_SECRET = process.env.JWT_SECRET ?? "mchat-secret-key-2024";
      const payload = jwt.verify(authHeader.slice(7), JWT_SECRET) as { userId: number };
      currentUserId = payload.userId;
    } catch {}
  }

  const memes = await db.select({
    id: memesTable.id,
    imageUrl: memesTable.imageUrl,
    caption: memesTable.caption,
    createdAt: memesTable.createdAt,
    authorId: memesTable.authorId,
    author: {
      id: usersTable.id,
      username: usersTable.username,
      displayName: usersTable.displayName,
      avatarUrl: usersTable.avatarUrl,
      isOwner: usersTable.isOwner,
      createdAt: usersTable.createdAt,
    },
    likesCount: sql<number>`(SELECT COUNT(*) FROM meme_likes WHERE meme_id = ${memesTable.id})::int`,
  }).from(memesTable)
    .leftJoin(usersTable, eq(memesTable.authorId, usersTable.id))
    .orderBy(desc(memesTable.createdAt))
    .limit(limit)
    .offset(offset);

  const result = await Promise.all(memes.map(async (meme) => {
    let isLiked = false;
    if (currentUserId) {
      const [like] = await db.select().from(memeLikesTable)
        .where(and(eq(memeLikesTable.memeId, meme.id), eq(memeLikesTable.userId, currentUserId)));
      isLiked = !!like;
    }
    return { ...meme, isLiked };
  }));

  res.json(result);
});

router.post("/", requireAuth, async (req: AuthRequest, res) => {
  const { imageUrl, caption } = req.body;

  if (!imageUrl) {
    res.status(400).json({ error: "imageUrl required" });
    return;
  }

  const [meme] = await db.insert(memesTable).values({
    authorId: req.userId!,
    imageUrl,
    caption: caption ?? null,
  }).returning();

  const [author] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!));

  res.status(201).json({
    ...meme,
    author: {
      id: author.id,
      username: author.username,
      displayName: author.displayName,
      avatarUrl: author.avatarUrl,
      isOwner: author.isOwner,
      createdAt: author.createdAt,
    },
    likesCount: 0,
    isLiked: false,
  });
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

export default router;
