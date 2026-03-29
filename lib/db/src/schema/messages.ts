import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { conversationsTable } from "./conversations";
import { usersTable } from "./users";

export const messagesTable = pgTable("messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull().references(() => conversationsTable.id),
  senderId: integer("sender_id").notNull().references(() => usersTable.id),
  content: text("content").notNull(),
  type: text("type", { enum: ["text", "audio", "image"] }).notNull().default("text"),
  isDeleted: integer("is_deleted").notNull().default(0),
  deletedForIds: text("deleted_for_ids").default(""),
  spamFlag: text("spam_flag").default("none"), // "none" | "spam" | "scam"
  spamReason: text("spam_reason").default(null),
  readAt: timestamp("read_at"),
  starredBy: text("starred_by").default(""),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Message = typeof messagesTable.$inferSelect;
