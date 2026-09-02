---
name: Migration entrypoint boundaries
description: Keep reusable migration configuration separate from command-line execution.
---

Migration modules imported by provisioning or tests must not execute migrations at module load; expose reusable configuration/functions and guard CLI startup explicitly. Registering a tenant migration covers new provisioning only, so existing tenants need a registry-driven rollout across every physical tenant database.

**Why:** Provisioning needs to reuse migration configuration for several physical databases, while import-time or request-time DDL can trigger unintended production work. A migration applied to only one tenant leaves other physical databases on an incompatible schema.

**How to apply:** Keep database creation and `migrate.latest` inside an exported runner or an explicit CLI-only branch. For existing tenants, use an explicit confirmed command that reads the master registry, migrates each database independently, reports every result, and fails the rollout if any tenant fails.