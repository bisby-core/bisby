import { Router, type IRouter } from "express";
import accessRouter from "./access";
import tenantAdministrationRouter from "./tenant-administration";
import workspaceControlRouter from "./workspace-control";
import publicWorkspacesRouter from "./public-workspaces";

const router: IRouter = Router();

router.use(accessRouter);
router.use(tenantAdministrationRouter);
router.use(workspaceControlRouter);
router.use(publicWorkspacesRouter);

export default router;
