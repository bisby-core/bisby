# BisBy core architecture

## Scope of this foundation

This repository currently contains the Node.js and TypeScript service skeleton for
BisBy. It defines the boundaries required for the next implementation phase
without creating tenant database connections, migrations, or business modules yet.

## Database-per-tenant model

BisBy has two database layers:

1. **Global master database**
   - tenant registry
   - canonical tenant identifier
   - wildcard subdomain
   - tenant database connection reference
   - module activation state
2. **Tenant database**
   - one physically separate PostgreSQL database per tenant
   - schemas `module_a` through `module_h`
   - tenant-local application data and local authentication records

Shared tables with a `tenant_id` discriminator are not a substitute for this
model. The master database is a routing and control plane, not a store for
tenant module data.

## Request routing lifecycle

The intended request lifecycle is:

1. Read the trusted host value from the incoming request.
2. Parse and normalize the tenant subdomain.
3. Query the master registry by subdomain.
4. Reject unknown, inactive, malformed, or unconfigured tenants.
5. Resolve the tenant database connection on the server.
6. Attach a request-scoped tenant context and tenant database handle.
7. Let downstream handlers access only the resolved tenant context.

The API now implements this lifecycle through a Knex master-registry adapter,
an in-memory tenant pool manager, and Express middleware. The middleware
attaches only the resolved tenant context and Knex handle to the request; raw
database credentials remain server-side.

Route access is enforced server-side through
`core_admin.tab_permissions`. The access endpoint requires an authenticated
local account and checks the normalized module schema plus workspace key before
returning a successful authorization response. Missing authentication returns
401; missing module or workspace assignment returns 403.

## Hostname rules

- Production tenant hosts use `<subdomain>.bisby.pro`.
- `bisby.pro`, `www.bisby.pro`, localhost, and local IP hosts do not identify a
  tenant.
- Host parsing must use the request's trusted host configuration and must not
  trust an arbitrary client-supplied database URL or tenant ID.
- Reverse-proxy deployments must configure trusted proxy behavior before using
  forwarded host headers in production.

## Authentication boundary

Authentication is intentionally local to the resolved tenant database:

- username/password records belong to the tenant database;
- password storage will use a strong one-way password hash;
- sessions and credentials must never be shared across tenant databases;
- no third-party OAuth provider is part of the BisBy authentication contract.

The API implements local authentication with:

- scrypt password hashes stored in `core_admin.client_accounts`;
- an eight-hour HMAC-signed, tenant-bound session cookie;
- account revalidation against the resolved tenant database on each request;
- `POST /api/auth/login`, `GET /api/auth/me`, and `POST /api/auth/logout`;
- no OAuth provider or shared cross-tenant session store.

The session cookie is host-only and never includes a tenant database connection
reference. A session presented to a different resolved tenant is rejected and
cleared.

## Migrations

The API package contains two Knex migration tracks:

- `migrate:master` creates the global platform routing tables and registers the
  eight canonical modules in the master database.
- `migrate:tenant` creates `core_admin` plus `module_a` through `module_h` in a
  tenant database. The reusable blueprint creates
  `core_admin.client_accounts`, `core_admin.tab_permissions`, and one
  `visitor_submissions` table inside each module schema.

All PostgreSQL connections use the server-side `PGUSER`, `PGPASSWORD`,
`PGHOST`, `PGPORT`, and `PGSSLMODE` parameters. The master connection targets
`BISBY_MASTER_DB_NAME`. A tenant blueprint migration targets
`BISBY_TENANT_DB_NAME` when migrating one database manually. The repeatable
initial provisioning command instead targets the two distinct physical
databases named by `BISBY_DESIGN_DB_NAME` and `BISBY_CLIENTALPHA_DB_NAME`.
Tenant credentials are not hard-coded or exposed to clients.

Run the initial seed with:

```sh
pnpm --filter @workspace/api-server run seed:tenants
```

The command runs master migrations, migrates each tenant database separately,
upserts `design` and `clientalpha`, activates all eight modules, and creates
the tenant-local `admin` account with view/edit access to `ws-1` through
`ws-10`. It verifies the two database names resolve to different PostgreSQL
server/database identities before applying any tenant migrations. Re-running it
is safe. Development/test runs use the test password
`password123` only when `BISBY_DEFAULT_ADMIN_PASSWORD` is absent; production
seeding requires that variable explicitly and the password value is never
logged.

## Vercel routing

`vercel.json` matches tenant hosts shaped like `<subdomain>.bisby.pro` and
rewrites their requests to the catch-all Express function at `/api/:path*`.
The catch-all entry imports the same Express app used by the local API
workflow, so hostname parsing and database routing remain centralized. The
wildcard domain still needs to be attached to the Vercel project and DNS must
point to Vercel.