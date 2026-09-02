# BisBy

Core infrastructure skeleton for a database-per-tenant SaaS application.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required server env: `PORT`
- Required PostgreSQL secrets: `PGUSER`, `PGPASSWORD`, `PGHOST`, `PGPORT`, `PGSSLMODE`
- Required global routing database name: `BISBY_MASTER_DB_NAME`
- Tenant blueprint migration env: `BISBY_TENANT_DB_NAME` (when migrating a specific tenant database)
- Local session secret: `SESSION_SECRET`
- Root owner credentials: `BISBY_OWNER_USERNAME`, `BISBY_OWNER_PASSWORD`
- Optional PostgreSQL maintenance database used to create physical tenant databases: `BISBY_ADMIN_DB_NAME` (falls back to `BISBY_MASTER_DB_NAME`, then `postgres`)
- Optional root hostname override: `BISBY_ROOT_DOMAIN` (defaults to `bisby.pro`)
- Frontend root hostname: `VITE_BISBY_ROOT_DOMAIN` (defaults to `bisby.pro`; keep it aligned with `BISBY_ROOT_DOMAIN`)
- Initial seed tenant databases: `BISBY_DESIGN_DB_NAME`, `BISBY_CLIENTALPHA_DB_NAME`
- Optional seed password: `BISBY_DEFAULT_ADMIN_PASSWORD` (required in production; development/test default is intentionally `password123`)
- `pnpm --filter @workspace/api-server run seed:tenants` — migrate and idempotently seed both initial tenants
- `pnpm --filter @workspace/api-server run test:auth` — run password and signed-session tests
- `pnpm --filter @workspace/api-server run test:owner` — run owner-session, root-host, and provisioning-input tests

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Knex.js for master and tenant routing
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/api-server/src/config` — typed runtime configuration boundaries
- `artifacts/api-server/src/tenancy` — subdomain parsing, tenant context, and resolver contracts
- `artifacts/api-server/src/modules` — bounded module identifiers and future module entry points
- `docs/architecture.md` — source of truth for the database-per-tenant architecture
- `lib/db` — shared database package reserved for the master and tenant connection implementations
- `lib/api-spec` — OpenAPI source of truth for API contracts

## Architecture decisions

- BisBy uses a physically separate PostgreSQL database for every tenant; shared `tenant_id` rows are not considered tenant isolation.
- The global master database stores tenant registry data, subdomains, database connection references, and module activation state.
- Tenant selection is request-scoped and derived from the incoming wildcard hostname before tenant-bound handlers run.
- Tenant database credentials are never intended for browser exposure; the server resolves and owns tenant connections.
- Authentication uses tenant-local database-backed username/password authentication with signed, tenant-bound sessions and no OAuth provider dependency.
- Platform-owner authentication is separate, restricted to the root host, and controls live physical database provisioning.

## Product

BisBy provides tenant-isolated SaaS modules behind wildcard subdomains such as `tenant.bisby.pro`.

## Frozen production baseline

- The verified production baseline is Git commit `3b65771519adf8975dbca260507a34f6bed7ec9a`.
- Treat the platform control plane, tenant routing, authentication, database-per-tenant architecture, administration surfaces, workspace hierarchy, and public workspace behavior as frozen.
- New development must remain inside Modules A–H and must be performed and validated in development only.
- Do not modify frozen platform or tenant infrastructure unless the user explicitly expands the scope.
- Do not push, deploy, migrate production data, or otherwise change production unless the user explicitly instructs it for that occasion.

## User preferences

- Preserve the database-per-tenant isolation model; do not replace it with shared-database tenant filtering.

## Gotchas

- Do not connect to a tenant database until the master registry has resolved and validated the tenant context.
- Do not accept a client-provided database URL or tenant identifier as an authority for routing.
- Keep module boundaries explicit; module activation in the master registry controls future module access.
- The PostgreSQL role used for live provisioning must have `CREATEDB` on the configured server; provisioning never accepts connection details from the browser.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details

## Owner control center

- `bisby.pro` is the public platform homepage. `bisby.pro/owner/login` is the protected owner sign-in route and `/owner/dashboard` is the initial owner-control surface.
- Set `BISBY_OWNER_USERNAME` and `BISBY_OWNER_PASSWORD` as production-only Vercel environment variables. Do not commit either value. Owner sessions use the existing `SESSION_SECRET` and are host-only, HTTP-only, `SameSite=Strict` cookies.
- Tenant provisioning, administrator assignment, and module management need the next master-registry API phase; the dashboard deliberately does not expose these actions before server-side authorization and audit handling exist.
