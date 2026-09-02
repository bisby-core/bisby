import { Router, type IRouter } from "express";
import accessRouter from "./access";
import tenantAdministrationRouter from "./tenant-administration";
import workspaceControlRouter from "./workspace-control";
import publicWorkspacesRouter from "./public-workspaces";
import tenantAdminStaffRouter from "./tenant-admin-staff";
import customerContextRouter from "./customer-context";

const router: IRouter = Router();

router.use(accessRouter);
router.use(customerContextRouter);
router.use(tenantAdministrationRouter);
router.use(workspaceControlRouter);
router.use(publicWorkspacesRouter);
router.use(tenantAdminStaffRouter);

export default router;
