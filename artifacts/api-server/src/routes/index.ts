import { Router, type IRouter } from "express";
import healthRouter from "./health";
import webauthnRouter from "./webauthn";
import mockRouter from "./mock";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/webauthn", mockRouter);
router.use(webauthnRouter);

export default router;
