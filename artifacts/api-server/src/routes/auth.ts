import { Router, type IRouter } from "express";
import {
  LoginBody,
  LoginResponse,
  GetCurrentUserResponse,
  LogoutResponse,
} from "./schemas";
import { verifyPassword } from "../auth/password";
import {
  clearSessionCookie,
  serializeSessionCookie,
} from "../auth/local-auth-middleware";
import {
  createSessionToken,
  getSessionSecret,
} from "../auth/session";

interface AccountRow {
  id: string;
  password_hash: string;
  account_type: string;
  is_active: boolean;
}

const router: IRouter = Router();

function toRole(value: string): "staff" | "client" {
  return value === "staff" ? "staff" : "client";
}

router.post("/auth/login", async (req, res, next) => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_credentials_payload" });
    return;
  }

  if (!req.tenantContext || !req.tenantDatabase) {
    res.status(500).json({ error: "tenant_context_unavailable" });
    return;
  }

  try {
    const account = await req.tenantDatabase<AccountRow>(
      "core_admin.client_accounts",
    )
      .select("id", "password_hash", "account_type", "is_active")
      .where("username", parsed.data.username)
      .first();

    const validAccount =
      account?.is_active &&
      (await verifyPassword(parsed.data.password, account.password_hash));

    if (!validAccount || !account) {
      res.status(401).json({ error: "invalid_credentials" });
      return;
    }

    const role = toRole(account.account_type);
    req.authenticatedUser = {
      accountId: account.id,
      tenantId: req.tenantContext.tenantId,
      role,
    };

    const token = createSessionToken(
      {
        accountId: account.id,
        tenantId: req.tenantContext.tenantId,
        role,
      },
      getSessionSecret(),
    );
    res.setHeader(
      "Set-Cookie",
      serializeSessionCookie(token, process.env["NODE_ENV"] === "production" || req.secure),
    );
    res.json(
      LoginResponse.parse({
        accountId: account.id,
        tenantId: req.tenantContext.tenantId,
        role,
      }),
    );
  } catch (error) {
    next(error);
  }
});

router.get("/auth/me", (req, res) => {
  if (!req.authenticatedUser) {
    res.status(401).json({ error: "authentication_required" });
    return;
  }
  res.json(GetCurrentUserResponse.parse(req.authenticatedUser));
});

router.post("/auth/logout", (req, res) => {
  res.setHeader(
    "Set-Cookie",
    clearSessionCookie(process.env["NODE_ENV"] === "production" || req.secure),
  );
  res.json(LogoutResponse.parse({ authenticated: false }));
});

export default router;