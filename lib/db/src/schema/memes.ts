import { pgTable, serial, integer, text, timestamp, unique } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const memesTable = pgTable("memes", {
  id: serial("id").primaryKey(),
  authorId: integer("author_id").notNull().references(() => usersTable.id),
  imageUrl: text("image_url").notNull(),
  caption: text("caption"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const memeLikesTable = pgTable("meme_likes", {
  id: serial("id").primaryKey(),
  memeId: integer("meme_id").notNull().references(() => memesTable.id),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [
  unique("unique_meme_like").on(t.memeId, t.userId),
]);

export type Meme = typeof memesTable.$inferSelect;
export type MemeLike = typeof memeLikesTable.$inferSelect;
