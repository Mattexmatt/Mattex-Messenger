import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import usersRouter from "./users";
import conversationsRouter from "./conversations";
import podcastsRouter from "./podcasts";
import callsRouter from "./calls";
import memesRouter from "./memes";
import statusesRouter from "./statuses";
import presenceRouter from "./presence";
import typingRouter from "./typing";
import blocksRouter from "./blocks";
import mattexRouter from "./mattex";
import sessionsRouter from "./sessions";
import adminRouter from "./admin";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/users", usersRouter);
router.use("/conversations", conversationsRouter);
router.use("/podcasts", podcastsRouter);
router.use("/calls", callsRouter);
router.use("/memes", memesRouter);
router.use("/statuses", statusesRouter);
router.use(presenceRouter);
router.use(typingRouter);
router.use(blocksRouter);
router.use("/mattex", mattexRouter);
router.use("/sessions", sessionsRouter);
router.use("/admin", adminRouter);

export default router;
