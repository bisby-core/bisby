# BisBy core architecture

## Scope of this foundation

This repository contains the BisBy tenant-routing service, tenant-local
authentication, root-host owner control plane, and live physical database
provisioning workflow. Business functionality inside modules remains outside
this foundation.

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

## Tenant administration hierarchy

Tenant-local administration follows a strict delegation boundary:

- a `tenant_admin` has complete access to every workspace in every active
  module for that tenant;
- a tenant administrator creates, activates, deactivates, and resets the
  credentials of `module_admin` accounts, with each module administrator bound
  to one active module;
- a `module_admin` has complete access to every workspace in its assigned
  module and cannot cross into another module;
- a module administrator creates and manages that module's `module_staff` and
  `client` accounts, including first passwords, password resets, account
  activation, role changes between Staff and Client, and workspace assignment;
- Staff and Client credentials authorize only their assigned module and
  workspaces. A tenant administrator is the only tenant-local role whose
  authenticated session spans all active modules.

Fine-grained module access will follow the content hierarchy
workspace → page → tab → card. Each resource created by a module must register
itself in that hierarchy in natural display order. Module administrators will
assign one of four access levels at each node: `active`, `sign_only`,
`view_only`, or `not_available`. Child controls inherit the nearest explicit
parent setting unless overridden. The module-content creation transaction must
register the corresponding control node so new pages, tabs, and cards appear
automatically in the module's staff access controls.

Platform-owner authentication is a separate root-host boundary:

- owner credentials come from `BISBY_OWNER_USERNAME` and
  `BISBY_OWNER_PASSWORD`;
- the owner session is a separate HMAC-signed, HTTP-only cookie;
- `/api/owner/*` returns 404 on tenant subdomains;
- tenant-local sessions do not authorize owner routes;
- control-plane browser responses never include physical database names or
  connection parameters.
- every owner mutation requires a root-host `Origin`/`Referer` and a custom
  owner-request header, preventing tenant subdomains and plain HTML forms from
  triggering owner actions with an existing cookie.

## Migrations

The API package contains two Knex migration tracks:

- `migrate:master` creates the global platform routing tables and registers the
  eight canonical modules in the master database. It also creates the
  append-only `platform_audit_log`.
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

## Live tenant provisioning

An authenticated owner can provision a tenant from the root control plane. The
server validates the tenant and database names, then:

1. takes a master-database advisory lock for the tenant subdomain;
2. verifies the subdomain and physical database name are unused;
3. connects to `BISBY_ADMIN_DB_NAME` (or `BISBY_MASTER_DB_NAME`, then
   `postgres`) and
   issues `CREATE DATABASE` outside a transaction;
4. applies the tenant blueprint to the new physical database;
5. creates the initial tenant-local administrator and workspace permissions;
6. registers the tenant and activates all eight modules in the master database;
7. records a sanitized owner audit event.

If migration, seeding, or registration fails after database creation, BisBy
attempts to remove the new physical database. A cleanup refusal is reported
explicitly and audited as requiring manual cleanup; provider errors and
credentials are not returned to the browser.

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

## Replit development previews

The BisBy web development workflow opens three Vite ports for direct local
testing:

- Platform Plane: `25321`
- Design: `3001`
- Clientalpha: `3002`

Each tenant preview proxies `/api` server-side with fixed `Host` and
`X-Forwarded-Host` values for its plane. Conflicting browser-supplied forwarded
host headers are replaced before the request reaches Express. The API still
resolves the physical tenant database from `req.hostname`; the browser cannot
submit a database name or connection override. In the path-routed development
artifact, the Platform preview menu uses `?plane=design` and
`?plane=clientalpha`. Tenant pages send API requests through explicit
development-only prefixes; the Vite proxy removes the prefix and applies the
corresponding fixed tenant hostname before forwarding the API request.
Production builds do not enable this development proxy.