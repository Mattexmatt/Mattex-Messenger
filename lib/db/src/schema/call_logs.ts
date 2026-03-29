import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const callLogsTable = pgTable("call_logs", {
  id: serial("id").primaryKey(),
  callerId: integer("caller_id").notNull().references(() => usersTable.id),
  calleeId: integer("callee_id").notNull().references(() => usersTable.id),
  type: text("type", { enum: ["audio", "video"] }).notNull().default("audio"),
  status: text("status", { enum: ["missed", "completed", "rejected", "cancelled"] }).notNull().default("missed"),
  duration: integer("duration").default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type CallLog = typeof callLogsTable.$inferSelect;
