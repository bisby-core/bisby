import { Router, type IRouter } from "express";
import accessRouter from "./access";

const router: IRouter = Router();

router.use(accessRouter);

export default router;
