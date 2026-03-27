import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { podcastsTable } from "@workspace/db/schema";
import { desc } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/", async (_req, res) => {
  const podcasts = await db.select().from(podcastsTable).orderBy(desc(podcastsTable.createdAt));
  res.json(podcasts);
});

router.post("/", requireAuth, async (req: AuthRequest, res) => {
  const { title, description, audioUrl, thumbnailUrl, duration } = req.body;

  if (!title || !audioUrl) {
    res.status(400).json({ error: "title and audioUrl required" });
    return;
  }

  const [podcast] = await db.insert(podcastsTable).values({
    title,
    description: description ?? null,
    audioUrl,
    thumbnailUrl: thumbnailUrl ?? null,
    duration: duration ?? null,
  }).returning();

  res.status(201).json(podcast);
});

export default router;
