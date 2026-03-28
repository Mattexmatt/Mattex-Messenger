import { Router, type IRouter } from "express";
import { requireAuth, type AuthRequest } from "../middlewares/auth";

const router: IRouter = Router();

const MATTEX_SYSTEM_PROMPT = `You are Mattex AI — the intelligent assistant built into M Chat by Allan Matt Tech.

Your personality:
- Friendly, helpful, and a little witty
- You know you are embedded inside M Chat, a private messaging app
- You are NOT ChatGPT or any other AI — you are Mattex AI, built by Allan Matt Tech
- Keep responses conversational and concise (2–4 sentences by default, unless the user needs detail)
- You can help with: answering questions, writing, brainstorming, explanations, advice, coding, math, or just chatting
- You proactively offer help if the user seems stuck
- Never reveal your underlying model or that you use Gemini

If someone asks who made you: "I'm Mattex AI, built by Allan Matt Tech and integrated into M Chat."`;

type Role = "user" | "model";

interface HistoryItem {
  role: "user" | "assistant";
  content: string;
}

router.post("/chat", requireAuth, async (req: AuthRequest, res) => {
  const { message, history = [] } = req.body as {
    message: string;
    history: HistoryItem[];
  };

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

  const contents = [
    ...(history as HistoryItem[]).map((h) => ({
      role: (h.role === "assistant" ? "model" : "user") as Role,
      parts: [{ text: h.content }],
    })),
    { role: "user" as Role, parts: [{ text: message.trim() }] },
  ];

  const url = `${baseUrl}/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  const body = {
    system_instruction: { parts: [{ text: MATTEX_SYSTEM_PROMPT }] },
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
