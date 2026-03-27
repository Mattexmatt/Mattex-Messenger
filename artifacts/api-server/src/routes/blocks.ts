import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { userBlocksTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/auth";

const router: IRouter = Router();

// GET /api/users/:userId/block — check if I blocked this user
router.get("/users/:userId/block", requireAuth, async (req: AuthRequest, res) => {
  const blockedId = parseInt(req.params.userId);
  const blockerId = req.userId!;
  const [block] = await db.select().from(userBlocksTable)
    .where(and(eq(userBlocksTable.blockerId, blockerId), eq(userBlocksTable.blockedId, blockedId)));
  res.json({ isBlocked: !!block });
});

// POST /api/users/:userId/block — block a user
router.post("/users/:userId/block", requireAuth, async (req: AuthRequest, res) => {
  const blockedId = parseInt(req.params.userId);
  const blockerId = req.userId!;
  if (blockerId === blockedId) { res.status(400).json({ error: "Cannot block yourself" }); return; }
  // Upsert: only insert if not already blocked
  const [existing] = await db.select().from(userBlocksTable)
    .where(and(eq(userBlocksTable.blockerId, blockerId), eq(userBlocksTable.blockedId, blockedId)));
  if (!existing) {
    await db.insert(userBlocksTable).values({ blockerId, blockedId });
  }
  res.json({ success: true, isBlocked: true });
});

// DELETE /api/users/:userId/block — unblock a user
router.delete("/users/:userId/block", requireAuth, async (req: AuthRequest, res) => {
  const blockedId = parseInt(req.params.userId);
  const blockerId = req.userId!;
  await db.delete(userBlocksTable)
    .where(and(eq(userBlocksTable.blockerId, blockerId), eq(userBlocksTable.blockedId, blockedId)));
  res.json({ success: true, isBlocked: false });
});

export default router;
