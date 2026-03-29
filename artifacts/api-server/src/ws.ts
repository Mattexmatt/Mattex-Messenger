import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "http";
import type { Server } from "http";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "./routes/auth";

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

export function setupWS(server: Server) {
  const wss = new WebSocketServer({ server, path: "/ws/calls" });

  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    const url = new URL(req.url!, `http://localhost`);
    const token = url.searchParams.get("token");

    if (!token) {
      ws.close(1008, "Missing token");
      return;
    }

    let userId: number;
    try {
      const payload = jwt.verify(token, JWT_SECRET) as { userId: number };
      userId = payload.userId;
    } catch {
      ws.close(1008, "Invalid token");
      return;
    }

    const existing = clients.get(userId);
    if (existing) {
      existing.ws.close(1000, "Replaced");
    }
    clients.set(userId, { ws, userId });

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        const { to, ...rest } = msg;
        const toId = Number(to);
        if (!toId) return;
        send(toId, { ...rest, from: userId });
      } catch {
        // ignore bad messages
      }
    });

    ws.on("close", () => {
      const current = clients.get(userId);
      if (current?.ws === ws) clients.delete(userId);
    });

    ws.on("error", () => {
      const current = clients.get(userId);
      if (current?.ws === ws) clients.delete(userId);
    });
  });
}
