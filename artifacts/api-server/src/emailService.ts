// Resend email service — connected via Replit integrations (resend connector)
import { Resend } from "resend";

async function getResendClient(): Promise<{ client: Resend; from: string } | null> {
  try {
    const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
    const xReplitToken = process.env.REPL_IDENTITY
      ? "repl " + process.env.REPL_IDENTITY
      : process.env.WEB_REPL_RENEWAL
      ? "depl " + process.env.WEB_REPL_RENEWAL
      : null;

    if (!hostname || !xReplitToken) return null;

    const data = await fetch(
      `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=resend`,
      {
        headers: {
          Accept: "application/json",
          "X-Replit-Token": xReplitToken,
        },
      }
    ).then((r) => r.json());

    const settings = data?.items?.[0]?.settings;
    if (!settings?.api_key) return null;

    const from = settings.from_email ?? "M Chat <noreply@allanmatttech.com>";
    return { client: new Resend(settings.api_key), from };
  } catch {
    return null;
  }
}

const APP_NAME = "M Chat";
const BRAND_COLOR = "#25D366";

function baseHtml(title: string, body: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#0a0a0a;color:#e0e0e0;margin:0;padding:24px 0;}
  .container{max-width:520px;margin:0 auto;background:#111;border-radius:20px;border:1px solid #222;overflow:hidden;}
  .header{background:linear-gradient(135deg,#0d2a1a 0%,#0a1a0f 100%);padding:32px 40px;text-align:center;border-bottom:1px solid #1a3320;}
  .logo{font-size:28px;font-weight:800;color:${BRAND_COLOR};letter-spacing:-0.5px;}
  .tagline{font-size:12px;color:#4d8a5e;margin-top:4px;letter-spacing:1px;text-transform:uppercase;}
  .body{padding:36px 40px;}
  h1{font-size:22px;font-weight:700;color:#f0f0f0;margin:0 0 12px;}
  p{font-size:15px;color:#aaa;line-height:1.6;margin:0 0 16px;}
  .btn{display:inline-block;background:${BRAND_COLOR};color:#000;font-weight:700;font-size:15px;padding:14px 32px;border-radius:12px;text-decoration:none;margin:8px 0 20px;}
  .code{font-size:28px;font-weight:800;letter-spacing:8px;color:${BRAND_COLOR};background:#0d2a1a;border:1px solid #1a4028;border-radius:12px;padding:18px 24px;text-align:center;margin:16px 0;}
  .note{font-size:12px;color:#555;line-height:1.5;}
  .footer{padding:20px 40px;border-top:1px solid #1a1a1a;text-align:center;}
  .footer p{font-size:11px;color:#444;margin:0;}
</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">💬 ${APP_NAME}</div>
      <div class="tagline">Allan Matt Tech</div>
    </div>
    <div class="body">${body}</div>
    <div class="footer">
      <p>© 2026 Allan Matt Tech · ${APP_NAME}</p>
      <p style="margin-top:4px;">If you didn't request this, you can safely ignore this email.</p>
    </div>
  </div>
</body>
</html>`;
}

export async function sendVerificationEmail(opts: {
  to: string;
  displayName: string;
  token: string;
  verifyUrl: string;
}): Promise<boolean> {
  const svc = await getResendClient();
  if (!svc) { console.warn("[email] Resend not configured — skip verification"); return false; }

  const body = `
    <h1>Verify your email</h1>
    <p>Hi <strong>${opts.displayName}</strong>, welcome to ${APP_NAME}! Click below to verify your email address and secure your account.</p>
    <div style="text-align:center;">
      <a href="${opts.verifyUrl}" class="btn">Verify Email</a>
    </div>
    <p>Or use this code if prompted:</p>
    <div class="code">${opts.token.toUpperCase()}</div>
    <p class="note">This link expires in <strong>24 hours</strong>.</p>
  `;

  try {
    await svc.client.emails.send({
      from: svc.from,
      to: opts.to,
      subject: `Verify your ${APP_NAME} email`,
      html: baseHtml("Email Verification", body),
    });
    return true;
  } catch (e) {
    console.error("[email] sendVerificationEmail failed:", e);
    return false;
  }
}

export async function sendPasswordResetEmail(opts: {
  to: string;
  displayName: string;
  token: string;
  resetUrl: string;
}): Promise<boolean> {
  const svc = await getResendClient();
  if (!svc) { console.warn("[email] Resend not configured — skip reset"); return false; }

  const body = `
    <h1>Reset your password</h1>
    <p>Hi <strong>${opts.displayName}</strong>, we received a request to reset your ${APP_NAME} password. Click the button below to set a new password.</p>
    <div style="text-align:center;">
      <a href="${opts.resetUrl}" class="btn">Reset Password</a>
    </div>
    <p>Or enter this code in the app:</p>
    <div class="code">${opts.token.toUpperCase()}</div>
    <p class="note">This link expires in <strong>1 hour</strong>. If you didn't request a password reset, please ignore this email — your account is safe.</p>
  `;

  try {
    await svc.client.emails.send({
      from: svc.from,
      to: opts.to,
      subject: `Reset your ${APP_NAME} password`,
      html: baseHtml("Password Reset", body),
    });
    return true;
  } catch (e) {
    console.error("[email] sendPasswordResetEmail failed:", e);
    return false;
  }
}

export async function sendLoginAlertEmail(opts: {
  to: string;
  displayName: string;
  device?: string;
}): Promise<boolean> {
  const svc = await getResendClient();
  if (!svc) return false;

  const body = `
    <h1>New login detected</h1>
    <p>Hi <strong>${opts.displayName}</strong>, your ${APP_NAME} account was just logged into${opts.device ? ` from <strong>${opts.device}</strong>` : ""}.</p>
    <p>If this was you, no action is needed. If you didn't log in, please reset your password immediately to protect your account.</p>
    <div style="text-align:center;">
      <a href="https://allanmatttech.com" class="btn">Secure My Account</a>
    </div>
  `;

  try {
    await svc.client.emails.send({
      from: svc.from,
      to: opts.to,
      subject: `New login to your ${APP_NAME} account`,
      html: baseHtml("Security Alert", body),
    });
    return true;
  } catch (e) {
    console.error("[email] sendLoginAlertEmail failed:", e);
    return false;
  }
}
