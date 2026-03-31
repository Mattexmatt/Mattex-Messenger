import { db } from "@workspace/db";
import { userSessionsTable } from "@workspace/db/schema";
import { eq, and, ne } from "drizzle-orm";

interface PushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, string>;
  sound?: "default" | null;
  priority?: "default" | "normal" | "high";
  channelId?: string;
  categoryIdentifier?: string;
  mutableContent?: boolean;
}

async function dispatchBatch(messages: PushMessage[]) {
  if (messages.length === 0) return;
  try {
    await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Accept-Encoding": "gzip, deflate",
      },
      body: JSON.stringify(messages.length === 1 ? messages[0] : messages),
    });
  } catch {}
}

async function getActiveTokens(userId: number): Promise<string[]> {
  const sessions = await db
    .select({ expoPushToken: userSessionsTable.expoPushToken })
    .from(userSessionsTable)
    .where(and(eq(userSessionsTable.userId, userId), eq(userSessionsTable.isActive, true)));
  return sessions.map(s => s.expoPushToken).filter((t): t is string => !!t);
}

// ── Private message notification ─────────────────────────────────────────────
// High-priority stream with inline Quick Reply and Mark as Read actions
export async function sendMessageNotification(
  recipientUserId: number,
  senderDisplayName: string,
  preview: string,
  conversationId: number
) {
  const tokens = await getActiveTokens(recipientUserId);
  if (tokens.length === 0) return;

  const truncatedPreview = preview.length > 120 ? preview.slice(0, 120) + "…" : preview;

  const messages: PushMessage[] = tokens.map(to => ({
    to,
    title: senderDisplayName,
    body: truncatedPreview,
    sound: "default",
    priority: "high",
    channelId: "messages",
    categoryIdentifier: "message",
    mutableContent: true,
    data: {
      type: "message",
      conversationId: String(conversationId),
      senderName: senderDisplayName,
    },
  }));

  dispatchBatch(messages).catch(() => {});
}

// ── Public meme feed notification ─────────────────────────────────────────────
// Rich media broadcast to all users except the author, default priority
export async function sendMemeNotification(
  authorUsername: string,
  authorDisplayName: string,
  caption: string | null,
  memeId: number,
  imageUrl: string,
  excludeUserId: number
) {
  const sessions = await db
    .select({
      expoPushToken: userSessionsTable.expoPushToken,
      userId: userSessionsTable.userId,
    })
    .from(userSessionsTable)
    .where(and(
      eq(userSessionsTable.isActive, true),
      ne(userSessionsTable.userId, excludeUserId)
    ));

  // One token per user (first active session wins)
  const seen = new Set<number>();
  const tokens: string[] = [];
  for (const s of sessions) {
    if (!s.expoPushToken || seen.has(s.userId)) continue;
    seen.add(s.userId);
    tokens.push(s.expoPushToken);
  }
  if (tokens.length === 0) return;

  const title = `${authorDisplayName} (@${authorUsername}) posted a meme`;
  const body = caption
    ? (caption.length > 80 ? caption.slice(0, 80) + "…" : caption)
    : "Check it out in the Community Feed";

  const BATCH = 100;
  for (let i = 0; i < tokens.length; i += BATCH) {
    const slice = tokens.slice(i, i + BATCH);
    const messages: PushMessage[] = slice.map(to => ({
      to,
      title,
      body,
      sound: null,
      priority: "default",
      channelId: "memes",
      categoryIdentifier: "meme",
      mutableContent: true,
      data: {
        type: "meme",
        memeId: String(memeId),
        imageUrl,
        authorUsername,
      },
    }));
    dispatchBatch(messages).catch(() => {});
  }
}
