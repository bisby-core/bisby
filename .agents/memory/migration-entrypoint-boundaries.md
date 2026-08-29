---
name: Migration entrypoint boundaries
description: Keep reusable migration configuration separate from command-line execution.
---

Migration modules imported by provisioning or tests must not execute migrations at module load; expose reusable configuration/functions and guard CLI startup explicitly.

**Why:** Provisioning needs to reuse migration configuration for several physical databases, while import-time DDL can trigger unintended work or fail in non-ESM tooling.

**How to apply:** Keep database creation and `migrate.latest` inside an exported runner or an explicit CLI-only branch; importing the module should be side-effect free.