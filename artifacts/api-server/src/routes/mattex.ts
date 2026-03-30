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

IMAGE GENERATION INSTRUCTIONS:
- If the user asks you to generate, draw, create, design, or illustrate an image/picture/photo/art, respond ONLY with this exact format on its own line:
  [GENERATE_IMAGE: <concise, detailed visual description for image generation>]
- Do NOT add any other text when generating an image — just that one line.
- Example: user says "draw a sunset over the ocean" → respond: [GENERATE_IMAGE: a vibrant sunset over calm ocean waves, golden and pink sky, cinematic photography style]

About the person you're talking to:
${personalizationLines.join("\n")}

If someone asks who made you: "I'm Mattex AI, built by Allan Matt Tech and integrated into M Chat."`;
}

type Role = "user" | "model";

async function callGemini(baseUrl: string, apiKey: string, model: string, body: object): Promise<any> {
  const url = `${baseUrl}/models/${model}:generateContent?key=${apiKey}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!resp.ok) throw new Error(`Gemini ${resp.status}`);
    return await resp.json();
  } finally {
    clearTimeout(timer);
  }
}

// GET /mattex/history
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

// DELETE /mattex/history
router.delete("/history", requireAuth, async (req: AuthRequest, res) => {
  const userId = req.userId!;
  await db.delete(aiChatsTable).where(eq(aiChatsTable.userId, userId));
  res.json({ ok: true });
});

// POST /mattex/translate — one-shot translation, no history saved
router.post("/translate", requireAuth, async (req: AuthRequest, res) => {
  const { text, targetLanguage } = req.body as { text?: string; targetLanguage?: string };
  if (!text || !targetLanguage) {
    res.status(400).json({ error: "text and targetLanguage are required" });
    return;
  }
  const baseUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;
  const apiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
  if (!baseUrl || !apiKey) { res.status(503).json({ error: "Translation service not configured" }); return; }
  try {
    const data = await callGemini(baseUrl, apiKey, "gemini-2.5-flash", {
      contents: [{
        role: "user",
        parts: [{ text: `Translate the following message to ${targetLanguage}. Return ONLY the translated text — no quotes, no explanations, no notes:\n\n${text.trim()}` }],
      }],
      generationConfig: { maxOutputTokens: 512, temperature: 0.1 },
    });
    const translation: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    res.json({ translation: translation.trim() });
  } catch {
    res.status(500).json({ error: "Translation failed" });
  }
});

// POST /mattex/chat — text (+ optional vision image)
router.post("/chat", requireAuth, async (req: AuthRequest, res) => {
  const { message, imageBase64, imageMimeType } = req.body as {
    message: string;
    imageBase64?: string;
    imageMimeType?: string;
  };

  if (!message || typeof message !== "string" || message.trim().length === 0) {
    res.status(400).json({ error: "message is required" });
    return;
  }

  const baseUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;
  const apiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
  if (!baseUrl || !apiKey) { res.status(503).json({ error: "Mattex AI is not configured" }); return; }

  const userId = req.userId!;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const historyRows = await db
    .select()
    .from(aiChatsTable)
    .where(eq(aiChatsTable.userId, userId))
    .orderBy(desc(aiChatsTable.createdAt))
    .limit(40);
  historyRows.reverse();

  // Build the user parts for this turn (may include an image)
  const userParts: any[] = [];
  if (imageBase64 && imageMimeType) {
    userParts.push({ inlineData: { mimeType: imageMimeType, data: imageBase64 } });
  }
  userParts.push({ text: message.trim() });

  const contents = [
    ...historyRows.map(h => ({
      role: (h.role === "assistant" ? "model" : "user") as Role,
      parts: [{ text: h.content }],
    })),
    { role: "user" as Role, parts: userParts },
  ];

  const systemPrompt = buildSystemPrompt(user);

  try {
    const data = await callGemini(baseUrl, apiKey, "gemini-2.5-flash", {
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents,
      generationConfig: { maxOutputTokens: 1024, temperature: 0.8 },
    });

    let reply: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "Sorry, I couldn't come up with a response. Try again!";

    // Check if the AI wants to generate an image
    const imgMatch = reply.match(/\[GENERATE_IMAGE:\s*(.+?)\]/i);
    if (imgMatch) {
      const imagePrompt = imgMatch[1].trim();
      try {
        const imgData = await callGemini(baseUrl, apiKey, "gemini-2.0-flash-preview-image-generation", {
          contents: [{ role: "user", parts: [{ text: imagePrompt }] }],
          generationConfig: { responseModalities: ["IMAGE"], numberOfImages: 1 },
        });

        const imgParts = imgData?.candidates?.[0]?.content?.parts ?? [];
        const imgPart = imgParts.find((p: any) => p.inlineData?.mimeType?.startsWith("image/"));

        if (imgPart?.inlineData) {
          await db.insert(aiChatsTable).values([
            { userId, role: "user", content: message.trim() },
            { userId, role: "assistant", content: `[Generated image: ${imagePrompt}]` },
          ]);
          await trimHistory(userId);
          res.json({
            reply: `Here's the image I generated for "${imagePrompt}":`,
            generatedImage: { data: imgPart.inlineData.data, mimeType: imgPart.inlineData.mimeType },
          });
          return;
        }
      } catch {
        reply = `I tried to generate an image of "${imagePrompt}" but ran into an issue. Please try again!`;
      }
    }

    await db.insert(aiChatsTable).values([
      { userId, role: "user", content: message.trim() },
      { userId, role: "assistant", content: reply },
    ]);
    await trimHistory(userId);
    res.json({ reply });
  } catch (err: any) {
    if (err?.name === "AbortError") {
      res.status(504).json({ error: "Mattex AI took too long to respond" });
    } else {
      res.status(500).json({ error: "Mattex AI error" });
    }
  }
});

// POST /mattex/transcribe — voice audio → transcript + AI reply
router.post("/transcribe", requireAuth, async (req: AuthRequest, res) => {
  const { audioBase64, mimeType } = req.body as { audioBase64: string; mimeType: string };
  if (!audioBase64 || !mimeType) { res.status(400).json({ error: "audioBase64 and mimeType are required" }); return; }

  const baseUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;
  const apiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
  if (!baseUrl || !apiKey) { res.status(503).json({ error: "Mattex AI is not configured" }); return; }

  const userId = req.userId!;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  try {
    const data = await callGemini(baseUrl, apiKey, "gemini-2.5-flash", {
      contents: [{
        role: "user",
        parts: [
          { inlineData: { mimeType, data: audioBase64 } },
          { text: "First, transcribe exactly what was said in this audio. Then on a new line starting with 'REPLY:', write a helpful response to what was said. Format: TRANSCRIPT: <what was said>\nREPLY: <your response>" },
        ],
      }],
      generationConfig: { maxOutputTokens: 1024, temperature: 0.7 },
    });

    const raw: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const transcriptMatch = raw.match(/TRANSCRIPT:\s*(.+?)(?:\n|REPLY:)/is);
    const replyMatch = raw.match(/REPLY:\s*(.+)/is);

    const transcript = transcriptMatch?.[1]?.trim() ?? raw.split("\n")[0]?.trim() ?? "(couldn't transcribe)";
    const reply = replyMatch?.[1]?.trim() ?? "I heard your message but couldn't process it. Please try again!";

    await db.insert(aiChatsTable).values([
      { userId, role: "user", content: transcript },
      { userId, role: "assistant", content: reply },
    ]);
    await trimHistory(userId);

    res.json({ transcript, reply });
  } catch (err: any) {
    if (err?.name === "AbortError") {
      res.status(504).json({ error: "Transcription timed out" });
    } else {
      res.status(500).json({ error: "Transcription failed" });
    }
  }
});

async function trimHistory(userId: number) {
  const [{ total }] = await db.select({ total: count() }).from(aiChatsTable).where(eq(aiChatsTable.userId, userId));
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
}

export default router;
