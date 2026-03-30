import { Router, type IRouter } from "express";
import { requireAuth, type AuthRequest } from "../middlewares/auth";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { getRecentEvents, getActiveBans, liftBan } from "../lib/sentinel";

const router: IRouter = Router();

async function requireOwner(req: AuthRequest, res: any, next: any) {
  const [user] = await db.select({ isOwner: usersTable.isOwner }).from(usersTable).where(eq(usersTable.id, req.userId!));
  if (!user?.isOwner) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  next();
}

router.get("/events", requireAuth, requireOwner, (req: AuthRequest, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  res.json(getRecentEvents(limit));
});

router.get("/bans", requireAuth, requireOwner, (_req, res) => {
  res.json(getActiveBans());
});

router.delete("/bans", requireAuth, requireOwner, (req: AuthRequest, res) => {
  const { userId, ip } = req.body as { userId?: number; ip?: string };
  liftBan(userId, ip);
  res.json({ ok: true });
});

export default router;
