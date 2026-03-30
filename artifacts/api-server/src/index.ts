import http from "http";
import app from "./app";
import { setupWS } from "./ws";
import { logger } from "./lib/logger";
import { deliverDueMessages } from "./routes/scheduled";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = http.createServer(app);
setupWS(server);

server.listen(port, (err?: Error) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }
  logger.info({ port }, "Server listening");
});

// Run the time-capsule delivery worker every 30 seconds
setInterval(deliverDueMessages, 30_000);
deliverDueMessages(); // run once on startup too
