import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomBytes } from "crypto";
import { db } from "@workspace/db";
import { usersTable, userSessionsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { parseDevice } from "../utils/parseDevice";

const router: IRouter = Router();

const JWT_SECRET = process.env.JWT_SECRET ?? "mchat-secret-key-2024";

function makeJti() {
  return randomBytes(32).toString("hex");
}

async function recordSession(userId: number, jti: string, req: { headers: Record<string, string | string[] | undefined>; ip?: string }) {
  const ua = (req.headers["user-agent"] as string) ?? "";
  const { deviceName, platform } = parseDevice(ua);
  const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ?? req.ip ?? null;
  await db.insert(userSessionsTable).values({ userId, jti, deviceName, platform, ipAddress: ip }).onConflictDoNothing();
}

router.post("/register", async (req, res) => {
  const { username, password, displayName, avatarUrl } = req.body as {
    username?: string; password?: string; displayName?: string; avatarUrl?: string;
  };

  if (!username || !password || !displayName) {
    res.status(400).json({ error: "username, password, and displayName are required" });
    return;
  }
  if (username.length < 3 || !/^[a-zA-Z0-9_]+$/.test(username)) {
    res.status(400).json({ error: "Username must be 3+ chars, letters/numbers/underscores only" });
    return;
  }
  if (password.length < 6) {
    res.status(400).json({ error: "Password must be at least 6 characters" });
    return;
  }

  const existing = await db.select().from(usersTable).where(eq(usersTable.username, username));
  if (existing.length > 0) {
    res.status(400).json({ error: "Username already taken" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const [user] = await db.insert(usersTable).values({
    username,
    passwordHash,
    displayName,
    avatarUrl: avatarUrl ?? null,
    isOwner: false,
  }).returning();

  const jti = makeJti();
  const token = jwt.sign({ userId: user.id, jti }, JWT_SECRET, { expiresIn: "30d" });
  await recordSession(user.id, jti, req as any);

  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      isOwner: user.isOwner,
      role: (user as any).role ?? "user",
      createdAt: user.createdAt,
    },
  });
});

router.post("/login", async (req, res) => {
  const { username, password } = req.body as { username?: string; password?: string };

  if (!username || !password) {
    res.status(400).json({ error: "username and password are required" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.username, username));
  if (!user) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const jti = makeJti();
  const token = jwt.sign({ userId: user.id, jti }, JWT_SECRET, { expiresIn: "30d" });
  await recordSession(user.id, jti, req as any);

  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      isOwner: user.isOwner,
      role: (user as any).role ?? "user",
      createdAt: user.createdAt,
    },
  });
});

export default router;
export { JWT_SECRET };
