import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { createMasterDatabase } from "./db/knex";
import { KnexTenantRegistry } from "./db/master-registry";
import { createDatabaseRouter } from "./tenancy/database-router";
import { TenantConnectionManager } from "./tenancy/tenant-connection-manager";
import healthRouter from "./routes/health";
import authRouter from "./routes/auth";
import ownerRouter from "./routes/owner";
import { createLocalAuthMiddleware } from "./auth/local-auth-middleware";
import { createOwnerAuthMiddleware } from "./owner/auth";

const app: Express = express();
const masterDatabase = createMasterDatabase();
const tenantRegistry = new KnexTenantRegistry(masterDatabase);
const tenantConnections = new TenantConnectionManager();
const rootDomain = process.env["BISBY_ROOT_DOMAIN"] ?? "bisby.pro";

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
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.set("trust proxy", 1);

// Health is intentionally available without tenant resolution.
app.use("/api", healthRouter);
app.use("/api", createOwnerAuthMiddleware(rootDomain));
app.use("/api/owner", ownerRouter(masterDatabase, rootDomain));
app.use(
  "/api",
  createDatabaseRouter({
    registry: tenantRegistry,
    connections: tenantConnections,
    rootDomain,
  }),
);
app.use("/api", createLocalAuthMiddleware());
app.use("/api", router);
app.use("/api", authRouter(masterDatabase));

app.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {
  logger.error({ err: error, requestId: req.id }, "Unhandled API error");

  if (res.headersSent) {
    return;
  }

  res.status(503).json({ error: "service_unavailable" });
});

export default app;
