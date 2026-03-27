import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq, lt, and } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/auth";

const router: IRouter = Router();

// ─── Cleanup: mark offline anyone with lastSeenAt > 90s ago ──────────────────
async function runCleanup() {
  try {
    const cutoff = new Date(Date.now() - 90_000);
    await db
      .update(usersTable)
      .set({ isOnline: false })
      .where(and(eq(usersTable.isOnline, true), lt(usersTable.lastSeenAt!, cutoff)));
  } catch { /* silent */ }
}
setInterval(runCleanup, 30_000);

// ─── POST /api/presence/heartbeat ────────────────────────────────────────────
router.post("/presence/heartbeat", requireAuth, async (req: AuthRequest, res) => {
  try {
    await db
      .update(usersTable)
      .set({ isOnline: true, lastSeenAt: new Date() })
      .where(eq(usersTable.id, req.userId!));
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to update presence" });
  }
});

// ─── GET /api/presence/:userId ────────────────────────────────────────────────
router.get("/presence/:userId", requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    if (isNaN(userId)) {
      res.status(400).json({ error: "Invalid userId" });
      return;
    }

    const [user] = await db
      .select({ isOnline: usersTable.isOnline, lastSeenAt: usersTable.lastSeenAt })
      .from(usersTable)
      .where(eq(usersTable.id, userId));

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json({ userId, isOnline: user.isOnline, lastSeenAt: user.lastSeenAt });
  } catch {
    res.status(500).json({ error: "Failed to get presence" });
  }
});

export default router;
