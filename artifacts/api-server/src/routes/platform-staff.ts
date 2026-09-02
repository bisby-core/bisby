import { Router, type IRouter, type Request, type Response } from "express";
import type { Knex } from "knex";
import { ChangePasswordBody, LoginBody, OwnerWorkspaceParams } from "./schemas";
import { isRootHost, usesSecureCookie } from "../owner/auth";
import {
  changePlatformStaffPassword,
  getAssignedPlatformStaffWorkspace,
  getAssignedPlatformStaffWorkspaces,
  getPlatformStaffAccount,
  verifyPlatformStaffCredentials,
} from "../owner/platform-staff";
import {
  clearPlatformStaffSessionCookie,
  createPlatformStaffSessionToken,
  readPlatformStaffSessionCookie,
  serializePlatformStaffSessionCookie,
  verifyPlatformStaffSessionToken,
} from "../platform-staff/session";

function platformStaffRouter(database: Knex, rootDomain: string): IRouter {
  const router: IRouter = Router();
  router.use((req, res, next) => {
    if (!isRootHost(req.hostname, rootDomain)) { res.status(404).json({ error: "not_found" }); return; }
    next();
  });

  async function accountFromSession(req: Request, res: Response, permitPasswordChange = false) {
    const token = readPlatformStaffSessionCookie(req.headers.cookie);
    const session = token ? verifyPlatformStaffSessionToken(token) : null;
    if (!session) { res.status(401).json({ error: "platform_staff_authentication_required" }); return null; }
    const account = await getPlatformStaffAccount(database, session.accountId);
    if (!account || !account.isActive) {
      res.setHeader("Set-Cookie", clearPlatformStaffSessionCookie(usesSecureCookie(req)));
      res.status(401).json({ error: "platform_staff_authentication_required" });
      return null;
    }
    if (!permitPasswordChange && account.requiresPasswordChange) {
      res.status(403).json({ error: "platform_staff_password_change_required" });
      return null;
    }
    return account;
  }

  router.post("/login", async (req, res, next) => {
    const body = LoginBody.safeParse(req.body);
    if (!body.success) { res.status(400).json({ error: "invalid_platform_staff_credentials_payload" }); return; }
    try {
      const account = await verifyPlatformStaffCredentials(database, body.data.username, body.data.password);
      if (!account) { res.status(401).json({ error: "invalid_platform_staff_credentials" }); return; }
      res.setHeader("Set-Cookie", serializePlatformStaffSessionCookie(createPlatformStaffSessionToken(account.id), usesSecureCookie(req)));
      res.json({ authenticated: true, accountId: account.id, username: account.username, displayName: account.displayName, requiresPasswordChange: account.requiresPasswordChange });
    } catch (error) { next(error); }
  });
  router.post("/logout", (req, res) => {
    res.setHeader("Set-Cookie", clearPlatformStaffSessionCookie(usesSecureCookie(req)));
    res.json({ authenticated: false });
  });
  router.get("/me", async (req, res, next) => {
    try {
      const account = await accountFromSession(req, res, true);
      if (!account) return;
      res.json({ authenticated: true, accountId: account.id, username: account.username, displayName: account.displayName, requiresPasswordChange: account.requiresPasswordChange });
    } catch (error) { next(error); }
  });
  router.post("/change-password", async (req, res, next) => {
    const body = ChangePasswordBody.safeParse(req.body);
    if (!body.success) { res.status(400).json({ error: "invalid_platform_staff_password_change_payload" }); return; }
    try {
      const account = await accountFromSession(req, res, true);
      if (!account) return;
      if (!await changePlatformStaffPassword(database, account.id, body.data.currentPassword, body.data.newPassword)) {
        res.status(401).json({ error: "invalid_current_password" }); return;
      }
      res.json({ status: "password_changed", requiresPasswordChange: false });
    } catch (error) { next(error); }
  });
  router.get("/workspaces", async (req, res, next) => {
    try {
      const account = await accountFromSession(req, res);
      if (!account) return;
      res.json({ workspaces: await getAssignedPlatformStaffWorkspaces(database, account.id) });
    } catch (error) { next(error); }
  });
  router.get("/workspaces/:workspaceKey", async (req, res, next) => {
    const params = OwnerWorkspaceParams.safeParse(req.params);
    if (!params.success) { res.status(404).json({ error: "workspace_not_found" }); return; }
    try {
      const account = await accountFromSession(req, res);
      if (!account) return;
      const workspace = await getAssignedPlatformStaffWorkspace(database, account.id, params.data.workspaceKey);
      if (!workspace) { res.status(404).json({ error: "workspace_not_found" }); return; }
      res.json(workspace);
    } catch (error) { next(error); }
  });
  return router;
}

export default platformStaffRouter;