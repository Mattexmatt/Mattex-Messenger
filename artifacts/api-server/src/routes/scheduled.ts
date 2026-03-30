import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  scheduledMessagesTable,
  messagesTable,
  conversationsTable,
} from "@workspace/db/schema";
import { eq, and, or, isNull, lte } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/auth";

const router: IRouter = Router();

// GET /scheduled/:convId — list pending scheduled messages (own, undelivered)
router.get("/:convId", requireAuth, async (req: AuthRequest, res) => {
  const userId = req.userId!;
  const convId = parseInt(req.params.convId, 10);
  const rows = await db
    .select()
    .from(scheduledMessagesTable)
    .where(
      and(
        eq(scheduledMessagesTable.conversationId, convId),
        eq(scheduledMessagesTable.senderId, userId),
        isNull(scheduledMessagesTable.deliveredAt),
      ),
    );
  res.json(rows);
});

// POST /scheduled — create a scheduled message
router.post("/", requireAuth, async (req: AuthRequest, res) => {
  const userId = req.userId!;
  const { conversationId, content, type = "text", scheduledAt } = req.body as {
    conversationId?: number;
    content?: string;
    type?: string;
    scheduledAt?: string;
  };

  if (!conversationId || !content || !scheduledAt) {
    res.status(400).json({ error: "conversationId, content, and scheduledAt are required" });
    return;
  }

  const [conv] = await db
    .select()
    .from(conversationsTable)
    .where(
      and(
        eq(conversationsTable.id, conversationId),
        or(eq(conversationsTable.user1Id, userId), eq(conversationsTable.user2Id, userId)),
      ),
    );

  if (!conv) {
    res.status(403).json({ error: "Conversation not found or access denied" });
    return;
  }

  const scheduledDate = new Date(scheduledAt);
  if (isNaN(scheduledDate.getTime()) || scheduledDate <= new Date()) {
    res.status(400).json({ error: "scheduledAt must be a future date" });
    return;
  }

  const [row] = await db
    .insert(scheduledMessagesTable)
    .values({ senderId: userId, conversationId, content, type, scheduledAt: scheduledDate })
    .returning();

  res.json(row);
});

// DELETE /scheduled/:id — cancel a scheduled message
router.delete("/:id", requireAuth, async (req: AuthRequest, res) => {
  const userId = req.userId!;
  const msgId = parseInt(req.params.id, 10);

  const [row] = await db
    .select()
    .from(scheduledMessagesTable)
    .where(
      and(
        eq(scheduledMessagesTable.id, msgId),
        eq(scheduledMessagesTable.senderId, userId),
        isNull(scheduledMessagesTable.deliveredAt),
      ),
    );

  if (!row) {
    res.status(404).json({ error: "Scheduled message not found or already delivered" });
    return;
  }

  await db.delete(scheduledMessagesTable).where(eq(scheduledMessagesTable.id, msgId));
  res.json({ ok: true });
});

export default router;

// ─── Delivery worker ───────────────────────────────────────────────────────────
export async function deliverDueMessages() {
  try {
    const due = await db
      .select()
      .from(scheduledMessagesTable)
      .where(
        and(
          lte(scheduledMessagesTable.scheduledAt, new Date()),
          isNull(scheduledMessagesTable.deliveredAt),
        ),
      );

    for (const msg of due) {
      await db.insert(messagesTable).values({
        conversationId: msg.conversationId,
        senderId: msg.senderId,
        content: msg.content,
        type: msg.type as any,
      });

      await db
        .update(scheduledMessagesTable)
        .set({ deliveredAt: new Date() })
        .where(eq(scheduledMessagesTable.id, msg.id));

      // Bump conversation updatedAt
      await db
        .update(conversationsTable)
        .set({ updatedAt: new Date() })
        .where(eq(conversationsTable.id, msg.conversationId));
    }
  } catch {
    // worker errors are non-fatal
  }
}
