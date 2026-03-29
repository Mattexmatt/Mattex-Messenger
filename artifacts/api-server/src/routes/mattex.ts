import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { aiChatsTable, usersTable } from "@workspace/db/schema";
import { eq, asc, desc, count } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/auth";

const router: IRouter = Router();

const HISTORY_LIMIT = 60;

function buildSystemPrompt(user: { displayName: string; bio?: string | null; hobbies?: string | null }): string {
  const hobbies = (() => {
    try { return JSON.parse(user.hobbies ?? "[]") as string[]; } catch { return []; }
  })();

  const personalizationLines: string[] = [
    `The user's name is ${user.displayName}.`,
  ];
  if (user.bio?.trim()) {
    personalizationLines.push(`Their bio: "${user.bio.trim()}"`);
  }
  if (hobbies.length > 0) {
    personalizationLines.push(`Their interests/hobbies: ${hobbies.join(", ")}.`);
  }
  personalizationLines.push("Use this context subtly to make your replies feel personal and relevant — mention their interests when helpful, greet them by name occasionally, but don't be repetitive about it.");

  return `You are Mattex AI — the intelligent assistant built into M Chat by Allan Matt Tech.

Your personality:
- Friendly, helpful, warm, and a little witty
- You know you are embedded inside M Chat, a private messaging app
- You are NOT ChatGPT or any other AI — you are Mattex AI, built by Allan Matt Tech
- Keep responses conversational and concise (2–4 sentences by default, unless the user needs detail)
- You can help with: answering questions, writing, brainstorming, explanations, advice, coding, math, or just chatting
- You remember the conversation history and refer back to earlier messages when relevant
- You proactively offer help if the user seems stuck
- Never reveal your underlying model or that you use Gemini

About the person you're talking to:
${personalizationLines.join("\n")}

If someone asks who made you: "I'm Mattex AI, built by Allan Matt Tech and integrated into M Chat."`;
}

type Role = "user" | "model";

// GET /mattex/history — fetch this user's saved AI chat history
router.get("/history", requireAuth, async (req: AuthRequest, res) => {
  const userId = req.userId!;

  const rows = await db
    .select()
    .from(aiChatsTable)
    .where(eq(aiChatsTable.userId, userId))
    .orderBy(asc(aiChatsTable.createdAt))
    .limit(HISTORY_LIMIT);

  res.json(rows.map(r => ({ id: r.id, role: r.role, content: r.content, createdAt: r.createdAt })));
});

// DELETE /mattex/history — clear this user's AI chat history
router.delete("/history", requireAuth, async (req: AuthRequest, res) => {
  const userId = req.userId!;
  await db.delete(aiChatsTable).where(eq(aiChatsTable.userId, userId));
  res.json({ ok: true });
});

// POST /mattex/chat — send a message to Mattex AI
router.post("/chat", requireAuth, async (req: AuthRequest, res) => {
  const { message } = req.body as { message: string };

  if (!message || typeof message !== "string" || message.trim().length === 0) {
    res.status(400).json({ error: "message is required" });
    return;
  }

  const baseUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;
  const apiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY;

  if (!baseUrl || !apiKey) {
    res.status(503).json({ error: "Mattex AI is not configured" });
    return;
  }

  const userId = req.userId!;

  // Fetch user profile for personalization
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  // Load recent history from DB
  const historyRows = await db
    .select()
    .from(aiChatsTable)
    .where(eq(aiChatsTable.userId, userId))
    .orderBy(desc(aiChatsTable.createdAt))
    .limit(40);

  // Reverse so oldest is first (Gemini needs chronological order)
  historyRows.reverse();

  // Build Gemini contents array: history + new user message
  const contents = [
    ...historyRows.map(h => ({
      role: (h.role === "assistant" ? "model" : "user") as Role,
      parts: [{ text: h.content }],
    })),
    { role: "user" as Role, parts: [{ text: message.trim() }] },
  ];

  const systemPrompt = buildSystemPrompt(user);

  const url = `${baseUrl}/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  const body = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents,
    generationConfig: {
      maxOutputTokens: 1024,
      temperature: 0.8,
    },
  };

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);

    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!resp.ok) {
      res.status(502).json({ error: "Mattex AI request failed" });
      return;
    }

    const data = (await resp.json()) as any;
    const reply: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "Sorry, I couldn't come up with a response. Try again!";

    // Persist both sides to DB
    await db.insert(aiChatsTable).values([
      { userId, role: "user", content: message.trim() },
      { userId, role: "assistant", content: reply },
    ]);

    // Trim history if it grows beyond HISTORY_LIMIT (keep newest)
    const [{ total }] = await db
      .select({ total: count() })
      .from(aiChatsTable)
      .where(eq(aiChatsTable.userId, userId));

    if (Number(total) > HISTORY_LIMIT) {
      const oldest = await db
        .select({ id: aiChatsTable.id })
        .from(aiChatsTable)
        .where(eq(aiChatsTable.userId, userId))
        .orderBy(asc(aiChatsTable.createdAt))
        .limit(Number(total) - HISTORY_LIMIT);
      for (const row of oldest) {
        await db.delete(aiChatsTable).where(eq(aiChatsTable.id, row.id));
      }
    }

    res.json({ reply });
  } catch (err: any) {
    if (err?.name === "AbortError") {
      res.status(504).json({ error: "Mattex AI took too long to respond" });
    } else {
      res.status(500).json({ error: "Mattex AI error" });
    }
  }
});

export default router;
