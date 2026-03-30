import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { globalLimiter, authLimiter, registrationLimiter } from "./middlewares/rateLimiter";
import { sanitizeBody } from "./middlewares/sanitize";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.set("trust proxy", 1);
app.use(cors());
app.use(globalLimiter);
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(sanitizeBody);

app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", registrationLimiter);

app.use("/api", router);

export default app;
