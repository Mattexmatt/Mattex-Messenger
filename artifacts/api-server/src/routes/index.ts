import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import usersRouter from "./users";
import conversationsRouter from "./conversations";
import podcastsRouter from "./podcasts";
import memesRouter from "./memes";
import statusesRouter from "./statuses";
import presenceRouter from "./presence";
import typingRouter from "./typing";
import blocksRouter from "./blocks";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/users", usersRouter);
router.use("/conversations", conversationsRouter);
router.use("/podcasts", podcastsRouter);
router.use("/memes", memesRouter);
router.use("/statuses", statusesRouter);
router.use(presenceRouter);
router.use(typingRouter);
router.use(blocksRouter);

export default router;
