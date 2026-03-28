import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq, ilike } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/auth";

const router: IRouter = Router();

function formatUser(user: typeof usersTable.$inferSelect) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    bio: user.bio ?? null,
    hobbies: user.hobbies ?? "[]",
    status: user.status ?? "🟢 Available",
    statusUpdatedAt: user.statusUpdatedAt,
    isOwner: user.isOwner,
    createdAt: user.createdAt,
  };
}

router.get("/me", requireAuth, async (req: AuthRequest, res) => {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json(formatUser(user));
});

router.put("/me", requireAuth, async (req: AuthRequest, res) => {
  const { displayName, avatarUrl, status, bio, hobbies } = req.body;
  const updates: Partial<typeof usersTable.$inferInsert> = {};

  if (displayName) updates.displayName = displayName;
  if (avatarUrl !== undefined) updates.avatarUrl = avatarUrl;
  if (bio !== undefined) updates.bio = bio;
  if (hobbies !== undefined) updates.hobbies = typeof hobbies === "string" ? hobbies : JSON.stringify(hobbies);
  if (status !== undefined) {
    updates.status = status;
    updates.statusUpdatedAt = new Date();
  }

  const [user] = await db.update(usersTable).set(updates).where(eq(usersTable.id, req.userId!)).returning();
  res.json(formatUser(user));
});

router.get("/search", requireAuth, async (req: AuthRequest, res) => {
  const q = req.query.q as string;
  const { ne } = await import("drizzle-orm");

  if (!q || !q.trim()) {
    const users = await db.select().from(usersTable)
      .where(ne(usersTable.id, req.userId!))
      .limit(100);
    res.json(users.map(formatUser));
    return;
  }

  const users = await db.select().from(usersTable)
    .where(ilike(usersTable.username, `%${q}%`))
    .limit(20);

  res.json(users.filter(u => u.id !== req.userId).map(formatUser));
});

router.get("/:id", requireAuth, async (req: AuthRequest, res) => {
  const userId = parseInt(req.params.id, 10);
  if (isNaN(userId)) { res.status(400).json({ error: "Invalid user id" }); return; }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  res.json(formatUser(user));
});

export default router;
