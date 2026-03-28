import { pgTable, serial, integer, timestamp, unique } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { statusesTable } from "./statuses";

export const statusViewsTable = pgTable("status_views", {
  id: serial("id").primaryKey(),
  statusId: integer("status_id").notNull().references(() => statusesTable.id, { onDelete: "cascade" }),
  viewerId: integer("viewer_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  uniq: unique().on(t.statusId, t.viewerId),
}));

export type StatusView = typeof statusViewsTable.$inferSelect;
