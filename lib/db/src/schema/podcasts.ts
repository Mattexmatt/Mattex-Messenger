import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";

export const podcastsTable = pgTable("podcasts", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  audioUrl: text("audio_url").notNull(),
  thumbnailUrl: text("thumbnail_url"),
  duration: integer("duration"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Podcast = typeof podcastsTable.$inferSelect;
