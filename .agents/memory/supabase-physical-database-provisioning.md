---
name: Supabase physical database provisioning
description: Physical database creation and database-name configuration constraints for BisBy's Supabase setup.
---

Supabase physical databases can be provisioned with a direct node-pg client connected to an existing administrative database, issuing each `CREATE DATABASE` statement as an independent query without an explicit transaction. Database-name settings must remain plain PostgreSQL identifiers; a `?search_path=...` suffix is not a database name.

**Why:** The provider's visual editor did not support the required creation flow, while direct PostgreSQL queries succeeded and preserved the database-per-tenant architecture.

**How to apply:** Use raw PostgreSQL connection parameters for the administrative connection, create each physical database outside a transaction, and keep schema search-path configuration separate from the database-name variable.