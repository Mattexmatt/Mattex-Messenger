import { pgTable, serial, integer, varchar, timestamp, boolean } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const userSessionsTable = pgTable("user_sessions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  jti: varchar("jti", { length: 64 }).notNull().unique(),
  deviceName: varchar("device_name", { length: 200 }).notNull().default("Unknown Device"),
  platform: varchar("platform", { length: 50 }).notNull().default("unknown"),
  ipAddress: varchar("ip_address", { length: 100 }),
  lastActiveAt: timestamp("last_active_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  isActive: boolean("is_active").notNull().default(true),
});
