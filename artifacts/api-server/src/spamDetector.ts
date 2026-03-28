export type SpamFlag = "none" | "spam" | "scam";

interface DetectionResult {
  flag: SpamFlag;
  reason: string;
}

const SYSTEM_PROMPT = `You are Mattex AI — a privacy-first spam and scam detector built into the M Chat messaging app by Allan Matt Tech.

Your ONLY job is to classify an incoming chat message as:
- "spam"  → unsolicited promotions, bulk ads, irrelevant commercial content, phishing links, crypto pumps, fake giveaways, chain messages
- "scam"  → attempts to deceive or defraud: impersonation, urgent money requests, fake prizes, romance scams, investment fraud, fake emergencies asking for money, requests for passwords/OTPs/banking details
- "none"  → normal personal conversation, greetings, questions, opinions, news sharing, memes, jokes — even if the topic is sensitive

IMPORTANT RULES:
1. Normal human conversation is NEVER spam or scam, even if it mentions money casually.
2. Only flag messages that have CLEAR deceptive or bulk-promotional intent.
3. Judge only the text content.
4. Be conservative — when unsure, return "none".
5. Keep your reason SHORT (max 12 words).

Respond ONLY with valid JSON in this exact shape (no markdown):
{"flag":"none","reason":""}`;

export async function detectSpam(content: string): Promise<DetectionResult> {
  const baseUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;
  const apiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY;

  if (!baseUrl || !apiKey || content.trim().length < 4) {
    return { flag: "none", reason: "" };
  }

  const MAX_LEN = 500;
  const excerpt = content.length > MAX_LEN ? content.slice(0, MAX_LEN) : content;

  const url = `${baseUrl}/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

  const body = {
    system_instruction: {
      parts: [{ text: SYSTEM_PROMPT }],
    },
    contents: [
      {
        role: "user",
        parts: [{ text: excerpt }],
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
      maxOutputTokens: 128,
      temperature: 0.1,
    },
  };

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);

    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!resp.ok) return { flag: "none", reason: "" };

    const data = (await resp.json()) as any;
    const raw: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    if (!raw.trim()) return { flag: "none", reason: "" };

    const parsed = JSON.parse(raw.trim()) as { flag: string; reason: string };
    const flag = (["spam", "scam", "none"].includes(parsed.flag) ? parsed.flag : "none") as SpamFlag;
    return { flag, reason: parsed.reason ?? "" };
  } catch {
    return { flag: "none", reason: "" };
  }
}
