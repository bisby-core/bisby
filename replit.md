# BisBy

Core infrastructure skeleton for a database-per-tenant SaaS application.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required server env: `PORT`
- Required global routing database secret: `BISBY_MASTER_DATABASE_URL`
- Tenant blueprint migration env: `BISBY_TENANT_DATABASE_URL` (when migrating a specific tenant database)
- Local session secret: `SESSION_SECRET`
- Initial seed tenant databases: `BISBY_DESIGN_TENANT_DATABASE_URL`, `BISBY_CLIENTALPHA_TENANT_DATABASE_URL`
- Optional seed password: `BISBY_DEFAULT_ADMIN_PASSWORD` (required in production; development/test default is intentionally `password123`)
- `pnpm --filter @workspace/api-server run seed:tenants` — migrate and idempotently seed both initial tenants
- `pnpm --filter @workspace/api-server run test:auth` — run password and signed-session tests

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

## Product

BisBy will provide tenant-isolated SaaS modules behind wildcard subdomains such as `tenant.bisby.com`.

## User preferences

- Preserve the database-per-tenant isolation model; do not replace it with shared-database tenant filtering.

## Gotchas

- Do not connect to a tenant database until the master registry has resolved and validated the tenant context.
- Do not accept a client-provided database URL or tenant identifier as an authority for routing.
- Keep module boundaries explicit; module activation in the master registry controls future module access.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
