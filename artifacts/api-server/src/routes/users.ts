import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq, ilike } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/me", requireAuth, async (req: AuthRequest, res) => {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json({
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    isOwner: user.isOwner,
    createdAt: user.createdAt,
  });
});

router.put("/me", requireAuth, async (req: AuthRequest, res) => {
  const { displayName, avatarUrl } = req.body;
  const updates: { displayName?: string; avatarUrl?: string | null } = {};
  if (displayName) updates.displayName = displayName;
  if (avatarUrl !== undefined) updates.avatarUrl = avatarUrl;

  const [user] = await db.update(usersTable).set(updates).where(eq(usersTable.id, req.userId!)).returning();
  res.json({
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    isOwner: user.isOwner,
    createdAt: user.createdAt,
  });
});

router.get("/search", requireAuth, async (req: AuthRequest, res) => {
  const q = req.query.q as string;
  if (!q) {
    res.json([]);
    return;
  }
  const users = await db.select().from(usersTable)
    .where(ilike(usersTable.username, `%${q}%`))
    .limit(20);

  res.json(users.filter(u => u.id !== req.userId).map(u => ({
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    avatarUrl: u.avatarUrl,
    isOwner: u.isOwner,
    createdAt: u.createdAt,
  })));
});

export default router;
