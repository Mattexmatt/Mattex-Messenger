import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { conversationsTable, messagesTable, usersTable } from "@workspace/db/schema";
import { eq, or, and, desc, ne, isNull, count, sql } from "drizzle-orm";
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

    // Count unread: messages from the other user that have not been read yet
    const [{ value: unreadCount }] = await db.select({ value: count() }).from(messagesTable)
      .where(and(
        eq(messagesTable.conversationId, conv.id),
        eq(messagesTable.senderId, otherUserId),
        isNull(messagesTable.readAt),
      ));

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
        role: (otherUser as any).role ?? "user",
        isOnline: otherUser.isOnline ?? false,
        lastSeenAt: otherUser.lastSeenAt,
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
      unreadCount: Number(unreadCount),
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
      role: (otherUser as any).role ?? "user",
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

// ─── GET /starred — all starred messages for current user ────────────────────
router.get("/starred", requireAuth, async (req: AuthRequest, res) => {
  const userId = req.userId!;
  const userConvs = await db.select().from(conversationsTable)
    .where(or(eq(conversationsTable.user1Id, userId), eq(conversationsTable.user2Id, userId)));

  if (userConvs.length === 0) { res.json([]); return; }

  const result = [];
  for (const conv of userConvs) {
    const msgs = await db.select({
      id: messagesTable.id, conversationId: messagesTable.conversationId,
      senderId: messagesTable.senderId, content: messagesTable.content,
      type: messagesTable.type, starredBy: messagesTable.starredBy,
      createdAt: messagesTable.createdAt,
      sender: { id: usersTable.id, displayName: usersTable.displayName, avatarUrl: usersTable.avatarUrl },
    }).from(messagesTable)
      .leftJoin(usersTable, eq(messagesTable.senderId, usersTable.id))
      .where(and(eq(messagesTable.conversationId, conv.id), sql`starred_by LIKE ${'%' + userId + '%'}`));

    const otherUserId = conv.user1Id === userId ? conv.user2Id : conv.user1Id;
    const [otherUser] = await db.select({ id: usersTable.id, displayName: usersTable.displayName, username: usersTable.username, avatarUrl: usersTable.avatarUrl })
      .from(usersTable).where(eq(usersTable.id, otherUserId));

    for (const m of msgs) {
      const ids = (m.starredBy ?? "").split(",").filter(Boolean);
      if (ids.includes(String(userId))) {
        result.push({ ...m, otherUser: otherUser ?? null });
      }
    }
  }
  result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  res.json(result);
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
    readAt: messagesTable.readAt,
    starredBy: messagesTable.starredBy,
    viewOnce: messagesTable.viewOnce,
    viewedBy: messagesTable.viewedBy,
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

// Mark all messages from the other user as read (Seen)
router.post("/:conversationId/read", requireAuth, async (req: AuthRequest, res) => {
  const conversationId = parseInt(req.params.conversationId);
  const userId = req.userId!;

  await db.update(messagesTable)
    .set({ readAt: new Date() })
    .where(and(
      eq(messagesTable.conversationId, conversationId),
      ne(messagesTable.senderId, userId),
      isNull(messagesTable.readAt),
    ));

  res.json({ ok: true });
});

// Star / unstar a message
router.post("/:conversationId/messages/:messageId/star", requireAuth, async (req: AuthRequest, res) => {
  const messageId = parseInt(req.params.messageId);
  const userId = req.userId!;
  const [msg] = await db.select().from(messagesTable).where(eq(messagesTable.id, messageId));
  if (!msg) { res.status(404).json({ error: "Message not found" }); return; }
  const starred = (msg.starredBy ?? "").split(",").filter(Boolean);
  if (starred.includes(String(userId))) {
    await db.update(messagesTable).set({ starredBy: starred.filter(id => id !== String(userId)).join(",") }).where(eq(messagesTable.id, messageId));
    res.json({ starred: false });
  } else {
    starred.push(String(userId));
    await db.update(messagesTable).set({ starredBy: starred.join(",") }).where(eq(messagesTable.id, messageId));
    res.json({ starred: true });
  }
});

// Edit a message (own text messages only)
router.patch("/:conversationId/messages/:messageId", requireAuth, async (req: AuthRequest, res) => {
  const messageId = parseInt(req.params.messageId);
  const userId = req.userId!;
  const { content } = req.body;

  if (!content || typeof content !== "string") { res.status(400).json({ error: "content required" }); return; }

  const [msg] = await db.select().from(messagesTable).where(eq(messagesTable.id, messageId));
  if (!msg) { res.status(404).json({ error: "Message not found" }); return; }
  if (msg.senderId !== userId) { res.status(403).json({ error: "Cannot edit someone else's message" }); return; }
  if (msg.type !== "text") { res.status(400).json({ error: "Only text messages can be edited" }); return; }

  await db.update(messagesTable).set({ content: content.trim() }).where(eq(messagesTable.id, messageId));
  res.json({ success: true });
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

router.post("/:conversationId/messages/:messageId/view", requireAuth, async (req: AuthRequest, res) => {
  const messageId = parseInt(req.params.messageId);
  const userId = req.userId!;
  const [msg] = await db.select().from(messagesTable).where(eq(messagesTable.id, messageId));
  if (!msg) { res.status(404).json({ error: "Message not found" }); return; }
  const viewed = (msg.viewedBy ?? "").split(",").filter(Boolean);
  if (!viewed.includes(String(userId))) viewed.push(String(userId));
  await db.update(messagesTable).set({ viewedBy: viewed.join(",") }).where(eq(messagesTable.id, messageId));
  res.json({ ok: true });
});

router.post("/:conversationId/messages", requireAuth, async (req: AuthRequest, res) => {
  const conversationId = parseInt(req.params.conversationId);
  const { content, type = "text", viewOnce = 0 } = req.body;

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
    viewOnce: viewOnce ? 1 : 0,
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
      role: (sender as any).role ?? "user",
      createdAt: sender.createdAt,
    },
  });
});

export default router;
