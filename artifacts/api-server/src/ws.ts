import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "http";
import type { Server } from "http";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "./routes/auth";

// ── Call clients ──────────────────────────────────────────────────────────────
interface CallClient {
  ws: WebSocket;
  userId: number;
}

const clients = new Map<number, CallClient>();

function send(targetUserId: number, data: object) {
  const client = clients.get(targetUserId);
  if (client && client.ws.readyState === WebSocket.OPEN) {
    client.ws.send(JSON.stringify(data));
  }
}

// ── Session clients ───────────────────────────────────────────────────────────
interface SessionClient {
  ws: WebSocket;
  userId: number;
  jti: string;
}

const sessionClients = new Map<string, SessionClient>(); // jti → client

export function pushForceLogout(jti: string) {
  const client = sessionClients.get(jti);
  if (client?.ws.readyState === WebSocket.OPEN) {
    client.ws.send(JSON.stringify({ type: "force_logout" }));
    setTimeout(() => { try { client.ws.close(1000, "Session revoked"); } catch {} }, 600);
  }
}

export function broadcastSessionsChanged(userId: number) {
  for (const client of sessionClients.values()) {
    if (client.userId === userId && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify({ type: "sessions_changed" }));
    }
  }
}

export function isSessionConnected(jti: string): boolean {
  const c = sessionClients.get(jti);
  return !!(c && c.ws.readyState === WebSocket.OPEN);
}

export function setupWS(server: Server) {
  // ── /ws/calls ────────────────────────────────────────────────────────────
  const wss = new WebSocketServer({ server, path: "/ws/calls" });

  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    const url = new URL(req.url!, `http://localhost`);
    const token = url.searchParams.get("token");

    if (!token) { ws.close(1008, "Missing token"); return; }

    let userId: number;
    try {
      const payload = jwt.verify(token, JWT_SECRET) as { userId: number };
      userId = payload.userId;
    } catch {
      ws.close(1008, "Invalid token");
      return;
    }

    const existing = clients.get(userId);
    if (existing) existing.ws.close(1000, "Replaced");
    clients.set(userId, { ws, userId });

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        const { to, ...rest } = msg;
        const toId = Number(to);
        if (!toId) return;
        send(toId, { ...rest, from: userId });
      } catch {}
    });

    ws.on("close", () => { const c = clients.get(userId); if (c?.ws === ws) clients.delete(userId); });
    ws.on("error", () => { const c = clients.get(userId); if (c?.ws === ws) clients.delete(userId); });
  });

  // ── /ws/sessions ─────────────────────────────────────────────────────────
  const wss2 = new WebSocketServer({ server, path: "/ws/sessions" });

  wss2.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    const url = new URL(req.url!, `http://localhost`);
    const token = url.searchParams.get("token");

    if (!token) { ws.close(1008, "Missing token"); return; }

    let userId: number, jti: string;
    try {
      const payload = jwt.verify(token, JWT_SECRET) as { userId: number; jti?: string };
      userId = payload.userId;
      jti = payload.jti ?? "";
    } catch {
      ws.close(1008, "Invalid token");
      return;
    }

    if (!jti) { ws.close(1008, "No session JTI"); return; }

    const existing = sessionClients.get(jti);
    if (existing) { try { existing.ws.close(1000, "Replaced"); } catch {} }
    sessionClients.set(jti, { ws, userId, jti });

    ws.send(JSON.stringify({ type: "connected" }));

    ws.on("close", () => { const c = sessionClients.get(jti); if (c?.ws === ws) sessionClients.delete(jti); });
    ws.on("error", () => { const c = sessionClients.get(jti); if (c?.ws === ws) sessionClients.delete(jti); });
  });
}
