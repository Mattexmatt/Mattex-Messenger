import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const statusesTable = pgTable("statuses", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  mediaUrl: text("media_url").notNull(),
  caption: text("caption"),
  type: text("type").notNull().default("image"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Status = typeof statusesTable.$inferSelect;
