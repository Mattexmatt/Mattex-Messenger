import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { conversationsTable, messagesTable, usersTable } from "@workspace/db/schema";
import { eq, or, and, desc } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/auth";
import { detectSpam } from "../spamDetector";

const router: IRouter = Router();

router.get("/", requireAuth, async (req: AuthRequest, res) => {
  const userId = req.userId!;

  const conversations = await db.select().from(conversationsTable)
    .where(or(eq(conversationsTable.user1Id, userId), eq(conversationsTable.user2Id, userId)))
    .orderBy(desc(conversationsTable.updatedAt));

  const result = [];
  for (const conv of conversations) {
    const otherUserId = conv.user1Id === userId ? conv.user2Id : conv.user1Id;
    const [otherUser] = await db.select().from(usersTable).where(eq(usersTable.id, otherUserId));
    const [lastMessage] = await db.select().from(messagesTable)
      .where(eq(messagesTable.conversationId, conv.id))
      .orderBy(desc(messagesTable.createdAt))
      .limit(1);

    result.push({
      id: conv.id,
      otherUser: {
        id: otherUser.id,
        username: otherUser.username,
        displayName: otherUser.displayName,
        avatarUrl: otherUser.avatarUrl,
        status: otherUser.status ?? "🟢 Available",
        statusUpdatedAt: otherUser.statusUpdatedAt,
        isOwner: otherUser.isOwner,
        createdAt: otherUser.createdAt,
      },
      lastMessage: lastMessage ? {
        id: lastMessage.id,
        conversationId: lastMessage.conversationId,
        senderId: lastMessage.senderId,
        content: lastMessage.content,
        type: lastMessage.type,
        createdAt: lastMessage.createdAt,
      } : undefined,
      updatedAt: conv.updatedAt,
    });
  }

  res.json(result);
});

router.post("/", requireAuth, async (req: AuthRequest, res) => {
  const userId = req.userId!;
  const { otherUserId } = req.body;

  if (!otherUserId) {
    res.status(400).json({ error: "otherUserId required" });
    return;
  }

  const [otherUser] = await db.select().from(usersTable).where(eq(usersTable.id, otherUserId));
  if (!otherUser) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const minId = Math.min(userId, otherUserId);
  const maxId = Math.max(userId, otherUserId);

  let [conv] = await db.select().from(conversationsTable)
    .where(and(eq(conversationsTable.user1Id, minId), eq(conversationsTable.user2Id, maxId)));

  if (!conv) {
    [conv] = await db.insert(conversationsTable).values({
      user1Id: minId,
      user2Id: maxId,
    }).returning();
  }

  const [lastMessage] = await db.select().from(messagesTable)
    .where(eq(messagesTable.conversationId, conv.id))
    .orderBy(desc(messagesTable.createdAt))
    .limit(1);

  res.json({
    id: conv.id,
    otherUser: {
      id: otherUser.id,
      username: otherUser.username,
      displayName: otherUser.displayName,
      avatarUrl: otherUser.avatarUrl,
      status: otherUser.status ?? "🟢 Available",
      statusUpdatedAt: otherUser.statusUpdatedAt,
      isOwner: otherUser.isOwner,
      createdAt: otherUser.createdAt,
    },
    lastMessage: lastMessage ? {
      id: lastMessage.id,
      conversationId: lastMessage.conversationId,
      senderId: lastMessage.senderId,
      content: lastMessage.content,
      type: lastMessage.type,
      createdAt: lastMessage.createdAt,
    } : undefined,
    updatedAt: conv.updatedAt,
  });
});

router.get("/:conversationId/messages", requireAuth, async (req: AuthRequest, res) => {
  const conversationId = parseInt(req.params.conversationId);
  const limit = parseInt((req.query.limit as string) ?? "50");
  const offset = parseInt((req.query.offset as string) ?? "0");

  const messages = await db.select({
    id: messagesTable.id,
    conversationId: messagesTable.conversationId,
    senderId: messagesTable.senderId,
    content: messagesTable.content,
    type: messagesTable.type,
    isDeleted: messagesTable.isDeleted,
    deletedForIds: messagesTable.deletedForIds,
    spamFlag: messagesTable.spamFlag,
    spamReason: messagesTable.spamReason,
    createdAt: messagesTable.createdAt,
    sender: {
      id: usersTable.id,
      username: usersTable.username,
      displayName: usersTable.displayName,
      avatarUrl: usersTable.avatarUrl,
      isOwner: usersTable.isOwner,
      createdAt: usersTable.createdAt,
    }
  }).from(messagesTable)
    .leftJoin(usersTable, eq(messagesTable.senderId, usersTable.id))
    .where(eq(messagesTable.conversationId, conversationId))
    .orderBy(desc(messagesTable.createdAt))
    .limit(limit)
    .offset(offset);

  res.json(messages);
});

// Delete a message
router.delete("/:conversationId/messages/:messageId", requireAuth, async (req: AuthRequest, res) => {
  const messageId = parseInt(req.params.messageId);
  const scope = (req.query.scope as string) ?? "me"; // "me" | "all"
  const userId = req.userId!;

  const [msg] = await db.select().from(messagesTable).where(eq(messagesTable.id, messageId));
  if (!msg) { res.status(404).json({ error: "Message not found" }); return; }

  if (scope === "all") {
    // Only the sender can delete for everyone
    if (msg.senderId !== userId) { res.status(403).json({ error: "Only the sender can delete for everyone" }); return; }
    await db.update(messagesTable).set({ isDeleted: 1, content: "" }).where(eq(messagesTable.id, messageId));
    res.json({ success: true, scope: "all" });
  } else {
    // Delete for me: add userId to deletedForIds
    const existing = (msg.deletedForIds ?? "").split(",").filter(Boolean);
    if (!existing.includes(String(userId))) existing.push(String(userId));
    await db.update(messagesTable).set({ deletedForIds: existing.join(",") }).where(eq(messagesTable.id, messageId));
    res.json({ success: true, scope: "me" });
  }
});

router.post("/:conversationId/messages", requireAuth, async (req: AuthRequest, res) => {
  const conversationId = parseInt(req.params.conversationId);
  const { content, type = "text" } = req.body;

  if (!content) {
    res.status(400).json({ error: "content required" });
    return;
  }

  // Save message first
  const [message] = await db.insert(messagesTable).values({
    conversationId,
    senderId: req.userId!,
    content,
    type,
    spamFlag: "none",
    spamReason: null,
  }).returning();

  await db.update(conversationsTable)
    .set({ updatedAt: new Date() })
    .where(eq(conversationsTable.id, conversationId));

  const [sender] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!));

  // Run spam/scam detection for text messages (non-blocking for sender, but completes before recipient fetches)
  let spamFlag = "none";
  let spamReason: string | null = null;

  if (type === "text" && content.length >= 4) {
    const detection = await detectSpam(content);
    spamFlag = detection.flag;
    spamReason = detection.reason || null;

    if (spamFlag !== "none") {
      await db.update(messagesTable)
        .set({ spamFlag: detection.flag, spamReason: detection.reason || null })
        .where(eq(messagesTable.id, message.id));
    }
  }

  res.status(201).json({
    id: message.id,
    conversationId: message.conversationId,
    senderId: message.senderId,
    content: message.content,
    type: message.type,
    spamFlag,
    spamReason,
    createdAt: message.createdAt,
    sender: {
      id: sender.id,
      username: sender.username,
      displayName: sender.displayName,
      avatarUrl: sender.avatarUrl,
      isOwner: sender.isOwner,
      createdAt: sender.createdAt,
    },
  });
});

export default router;
