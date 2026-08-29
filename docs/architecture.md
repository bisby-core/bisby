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

## Hostname rules

- Production tenant hosts use `<subdomain>.bisby.com`.
- `bisby.com`, `www.bisby.com`, localhost, and local IP hosts do not identify a
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

The authentication implementation is not part of this skeleton.

## Migrations

The API package contains two Knex migration tracks:

- `migrate:master` creates the global platform routing tables and registers the
  eight canonical modules in the master database.
- `migrate:tenant` creates `core_admin` plus `module_a` through `module_h` in a
  tenant database. The reusable blueprint creates
  `core_admin.client_accounts`, `core_admin.tab_permissions`, and one
  `visitor_submissions` table inside each module schema.

The master connection is read from `BISBY_MASTER_DATABASE_URL`. A tenant
blueprint migration targets `BISBY_TENANT_DATABASE_URL`; tenant credentials are
not hard-coded or exposed to clients.