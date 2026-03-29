import { pgTable, text, serial, boolean, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name").notNull(),
  avatarUrl: text("avatar_url"),
  bio: text("bio"),
  hobbies: text("hobbies").default("[]"),
  status: text("status").default("🟢 Available"),
  statusUpdatedAt: timestamp("status_updated_at").defaultNow(),
  isOwner: boolean("is_owner").notNull().default(false),
  role: text("role", { enum: ["user", "vip"] }).notNull().default("user"),
  warnCount: integer("warn_count").notNull().default(0),
  isBanned: boolean("is_banned").notNull().default(false),
  isOnline: boolean("is_online").notNull().default(false),
  lastSeenAt: timestamp("last_seen_at").defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  // Email & security
  email: text("email").unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  emailVerifyToken: text("email_verify_token"),
  emailVerifyExpiry: timestamp("email_verify_expiry"),
  passwordResetToken: text("password_reset_token"),
  passwordResetExpiry: timestamp("password_reset_expiry"),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
