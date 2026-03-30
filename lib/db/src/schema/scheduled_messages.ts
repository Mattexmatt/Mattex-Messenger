import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { conversationsTable } from "./conversations";
import { usersTable } from "./users";

export const scheduledMessagesTable = pgTable("scheduled_messages", {
  id: serial("id").primaryKey(),
  senderId: integer("sender_id").notNull().references(() => usersTable.id),
  conversationId: integer("conversation_id").notNull().references(() => conversationsTable.id),
  content: text("content").notNull(),
  type: text("type").notNull().default("text"),
  scheduledAt: timestamp("scheduled_at").notNull(),
  deliveredAt: timestamp("delivered_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type ScheduledMessage = typeof scheduledMessagesTable.$inferSelect;
