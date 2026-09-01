---
name: Owner password reset reconciliation
description: Cross-database consistency rule for tenant credential changes and master audit records.
---

Owner-managed tenant password resets must assign a unique master-audit identifier and distinguish three outcomes after an ambiguous audit write: recorded, confirmed absent, or unknown. Compensate the tenant credential only when the audit identifier is confirmed absent; preserve the changed credential and require reconciliation when audit state is unknown.

**Why:** Tenant credentials and platform audit records live in physically separate databases, so a failed audit call can still represent a committed insert. Treating an unavailable audit lookup as absence can restore the password while leaving a durable audit event that claims the reset occurred.

**How to apply:** Use the same three-way reconciliation for future owner operations that mutate a tenant database and then record a master-database audit. Conditional compensation must not overwrite a later concurrent change.