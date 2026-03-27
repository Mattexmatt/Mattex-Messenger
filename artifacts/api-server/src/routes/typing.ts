import { Router, type IRouter } from "express";
import { requireAuth, type AuthRequest } from "../middlewares/auth";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

interface TypingEntry {
  userId: number;
  displayName: string;
  type: "typing" | "recording";
  timestamp: number;
}

// In-memory store: conversationId → list of typing entries
const typingStore = new Map<string, TypingEntry[]>();

const TYPING_TTL = 4000; // entries expire after 4 seconds

function cleanConvo(convId: string) {
  const now = Date.now();
  const entries = typingStore.get(convId) ?? [];
  const fresh = entries.filter(e => now - e.timestamp < TYPING_TTL);
  if (fresh.length === 0) typingStore.delete(convId);
  else typingStore.set(convId, fresh);
}

// POST /api/conversations/:id/typing
// Body: { type: "typing" | "recording" | "stopped" }
router.post("/conversations/:id/typing", requireAuth, async (req: AuthRequest, res) => {
  const convId = req.params.id;
  const type = req.body.type as "typing" | "recording" | "stopped";
  const userId = req.userId!;

  cleanConvo(convId);
  const entries = typingStore.get(convId) ?? [];

  if (type === "stopped") {
    typingStore.set(convId, entries.filter(e => e.userId !== userId));
    res.json({ ok: true });
    return;
  }

  // Fetch display name
  let displayName = "Someone";
  try {
    const [user] = await db.select({ displayName: usersTable.displayName }).from(usersTable).where(eq(usersTable.id, userId));
    if (user) displayName = user.displayName;
  } catch { /* ignore */ }

  const existing = entries.find(e => e.userId === userId);
  if (existing) {
    existing.type = type;
    existing.timestamp = Date.now();
    existing.displayName = displayName;
  } else {
    entries.push({ userId, displayName, type, timestamp: Date.now() });
    typingStore.set(convId, entries);
  }

  res.json({ ok: true });
});

// GET /api/conversations/:id/typing
// Returns who's typing/recording right now (excluding caller)
router.get("/conversations/:id/typing", requireAuth, async (req: AuthRequest, res) => {
  const convId = req.params.id;
  cleanConvo(convId);

  const entries = (typingStore.get(convId) ?? []).filter(e => e.userId !== req.userId);
  res.json(entries.map(e => ({ userId: e.userId, displayName: e.displayName, type: e.type })));
});

export default router;
