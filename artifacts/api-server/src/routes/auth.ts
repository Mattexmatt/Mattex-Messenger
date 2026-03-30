import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomBytes } from "crypto";
import { db } from "@workspace/db";
import { usersTable, userSessionsTable } from "@workspace/db/schema";
import { eq, or } from "drizzle-orm";
import { parseDevice } from "../utils/parseDevice";
import {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendLoginAlertEmail,
} from "../emailService";
import { requireAuth, type AuthRequest } from "../middlewares/auth";
import { recordNewAccount } from "../lib/sentinel";

const router: IRouter = Router();

const JWT_SECRET = process.env.JWT_SECRET ?? "mchat-secret-key-2024";
const APP_DOMAIN = process.env.EXPO_PUBLIC_DOMAIN ?? "localhost:8080";

function makeJti() {
  return randomBytes(32).toString("hex");
}

function makeToken(len = 6) {
  return randomBytes(3).toString("hex").toUpperCase(); // e.g. "A3F7C2"
}

async function recordSession(
  userId: number,
  jti: string,
  req: { headers: Record<string, string | string[] | undefined>; ip?: string }
) {
  const ua = (req.headers["user-agent"] as string) ?? "";
  const { deviceName, platform } = parseDevice(ua);
  const ip =
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ??
    req.ip ??
    null;
  await db
    .insert(userSessionsTable)
    .values({ userId, jti, deviceName, platform, ipAddress: ip })
    .onConflictDoNothing();
}

// POST /auth/register
router.post("/register", async (req, res) => {
  const { username, password, displayName, avatarUrl, email, deviceId } = req.body as {
    username?: string;
    password?: string;
    displayName?: string;
    avatarUrl?: string;
    email?: string;
    deviceId?: string;
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
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: "Invalid email address" });
    return;
  }

  const existing = await db.select().from(usersTable).where(eq(usersTable.username, username));
  if (existing.length > 0) {
    res.status(400).json({ error: "Username already taken" });
    return;
  }

  if (email) {
    const emailExists = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email));
    if (emailExists.length > 0) {
      res.status(400).json({ error: "An account with this email already exists" });
      return;
    }
  }

  const passwordHash = await bcrypt.hash(password, 10);

  // Set up email verification token if email provided
  const emailVerifyToken = email ? makeToken() : null;
  const emailVerifyExpiry = email ? new Date(Date.now() + 24 * 60 * 60 * 1000) : null;

  const [user] = await db.insert(usersTable).values({
    username,
    passwordHash,
    displayName,
    avatarUrl: avatarUrl ?? null,
    isOwner: false,
    ...(email ? {
      email,
      emailVerified: false,
      emailVerifyToken,
      emailVerifyExpiry,
    } : {}),
  } as any).returning();

  // Send verification email (non-blocking)
  if (email && emailVerifyToken) {
    const verifyUrl = `https://${APP_DOMAIN}/api/auth/verify-email?token=${emailVerifyToken}&userId=${user.id}`;
    sendVerificationEmail({
      to: email,
      displayName,
      token: emailVerifyToken,
      verifyUrl,
    }).catch(() => {});
  }

  const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ?? req.ip ?? undefined;
  recordNewAccount(ip ?? "unknown");

  const jti = makeJti();
  const resolvedDeviceId = deviceId ?? (req.headers["x-device-id"] as string | undefined);
  const token = jwt.sign({ userId: user.id, jti, ...(resolvedDeviceId ? { deviceId: resolvedDeviceId } : {}) }, JWT_SECRET, { expiresIn: "30d" });
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
      email: (user as any).email ?? null,
      emailVerified: (user as any).emailVerified ?? false,
      createdAt: user.createdAt,
    },
    emailSent: !!email,
  });
});

// POST /auth/login
router.post("/login", async (req, res) => {
  const { username, password, deviceId } = req.body as {
    username?: string;
    password?: string;
    deviceId?: string;
  };

  if (!username || !password) {
    res.status(400).json({ error: "username and password are required" });
    return;
  }

  // Allow login with username OR email
  const isEmail = username.includes("@");
  const [user] = await db.select().from(usersTable).where(
    isEmail ? eq(usersTable.email, username) : eq(usersTable.username, username)
  );

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
  const resolvedDeviceId = deviceId ?? (req.headers["x-device-id"] as string | undefined);
  const token = jwt.sign({ userId: user.id, jti, ...(resolvedDeviceId ? { deviceId: resolvedDeviceId } : {}) }, JWT_SECRET, { expiresIn: "30d" });
  await recordSession(user.id, jti, req as any);

  // Send login alert if email on file (non-blocking)
  if ((user as any).email && (user as any).emailVerified) {
    const ua = (req.headers["user-agent"] as string) ?? "";
    const { deviceName } = parseDevice(ua);
    sendLoginAlertEmail({
      to: (user as any).email,
      displayName: user.displayName,
      device: deviceName,
    }).catch(() => {});
  }

  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      isOwner: user.isOwner,
      role: (user as any).role ?? "user",
      email: (user as any).email ?? null,
      emailVerified: (user as any).emailVerified ?? false,
      createdAt: user.createdAt,
    },
  });
});

// GET /auth/verify-email?token=XXX&userId=1
router.get("/verify-email", async (req, res) => {
  const { token, userId } = req.query as { token?: string; userId?: string };
  if (!token || !userId) {
    res.status(400).send("Invalid verification link.");
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, parseInt(userId)));
  if (!user || (user as any).emailVerifyToken !== token.toUpperCase()) {
    res.status(400).send("Invalid or expired verification link.");
    return;
  }

  const expiry = (user as any).emailVerifyExpiry as Date | null;
  if (expiry && new Date() > expiry) {
    res.status(400).send("Verification link has expired. Please request a new one.");
    return;
  }

  await (db as any).update(usersTable).set({
    emailVerified: true,
    emailVerifyToken: null,
    emailVerifyExpiry: null,
  }).where(eq(usersTable.id, user.id));

  res.send(`
    <!DOCTYPE html><html><head><meta charset="utf-8"><title>Email Verified</title>
    <style>body{font-family:system-ui;background:#0a0a0a;color:#e0e0e0;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;}
    .box{background:#111;border:1px solid #222;border-radius:20px;padding:48px 40px;text-align:center;max-width:420px;}
    h1{color:#25D366;font-size:28px;} p{color:#aaa;} .emoji{font-size:52px;margin-bottom:16px;}</style></head>
    <body><div class="box"><div class="emoji">✅</div><h1>Email Verified!</h1>
    <p>Your M Chat email has been verified. You can now close this tab and return to the app.</p></div></body></html>
  `);
});

// POST /auth/forgot-password — send reset email
router.post("/forgot-password", async (req, res) => {
  const { email } = req.body as { email?: string };
  if (!email) {
    res.status(400).json({ error: "email is required" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));

  // Always return success to prevent user enumeration
  res.json({ ok: true, message: "If an account with that email exists, a reset link has been sent." });

  if (!user) return;

  const resetToken = makeToken(8); // longer token for reset
  const resetExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await (db as any).update(usersTable).set({
    passwordResetToken: resetToken,
    passwordResetExpiry: resetExpiry,
  }).where(eq(usersTable.id, user.id));

  const resetUrl = `https://${APP_DOMAIN}/api/auth/reset-password?token=${resetToken}&userId=${user.id}`;

  sendPasswordResetEmail({
    to: email,
    displayName: user.displayName,
    token: resetToken,
    resetUrl,
  }).catch(() => {});
});

// POST /auth/reset-password — set a new password
router.post("/reset-password", async (req, res) => {
  const { token, userId, newPassword } = req.body as {
    token?: string;
    userId?: string | number;
    newPassword?: string;
  };

  if (!token || !userId || !newPassword) {
    res.status(400).json({ error: "token, userId, and newPassword are required" });
    return;
  }
  if ((newPassword as string).length < 6) {
    res.status(400).json({ error: "Password must be at least 6 characters" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, parseInt(String(userId))));
  if (!user || (user as any).passwordResetToken !== token.toUpperCase()) {
    res.status(400).json({ error: "Invalid or expired reset token" });
    return;
  }

  const expiry = (user as any).passwordResetExpiry as Date | null;
  if (expiry && new Date() > expiry) {
    res.status(400).json({ error: "Reset token has expired. Please request a new one." });
    return;
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await (db as any).update(usersTable).set({
    passwordHash,
    passwordResetToken: null,
    passwordResetExpiry: null,
  }).where(eq(usersTable.id, user.id));

  res.json({ ok: true, message: "Password updated successfully. You can now log in." });
});

// POST /auth/add-email — add/update email for existing account (authenticated)
router.post("/add-email", requireAuth, async (req: AuthRequest, res) => {
  const { email } = req.body as { email?: string };
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: "Valid email address required" });
    return;
  }

  const emailExists = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email));
  if (emailExists.length > 0 && emailExists[0].id !== req.userId) {
    res.status(400).json({ error: "This email is already linked to another account" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const emailVerifyToken = makeToken();
  const emailVerifyExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await (db as any).update(usersTable).set({
    email,
    emailVerified: false,
    emailVerifyToken,
    emailVerifyExpiry,
  }).where(eq(usersTable.id, req.userId!));

  const verifyUrl = `https://${APP_DOMAIN}/api/auth/verify-email?token=${emailVerifyToken}&userId=${req.userId}`;
  const sent = await sendVerificationEmail({
    to: email,
    displayName: user.displayName,
    token: emailVerifyToken,
    verifyUrl,
  });

  res.json({ ok: true, emailSent: sent });
});

// POST /auth/resend-verification
router.post("/resend-verification", requireAuth, async (req: AuthRequest, res) => {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!));
  if (!user || !(user as any).email) {
    res.status(400).json({ error: "No email on file" });
    return;
  }
  if ((user as any).emailVerified) {
    res.status(400).json({ error: "Email is already verified" });
    return;
  }

  const emailVerifyToken = makeToken();
  const emailVerifyExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await (db as any).update(usersTable).set({ emailVerifyToken, emailVerifyExpiry })
    .where(eq(usersTable.id, req.userId!));

  const verifyUrl = `https://${APP_DOMAIN}/api/auth/verify-email?token=${emailVerifyToken}&userId=${req.userId}`;
  const sent = await sendVerificationEmail({
    to: (user as any).email,
    displayName: user.displayName,
    token: emailVerifyToken,
    verifyUrl,
  });

  res.json({ ok: true, emailSent: sent });
});

export default router;
export { JWT_SECRET };
