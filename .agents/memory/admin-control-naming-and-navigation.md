---
name: Explicit admin-control naming and navigation
description: Requires scope-specific admin-control labels and prevents administration navigation from appearing for unauthorized roles.
---

Always name administration destinations by their exact scope: use `<Tenant> Admin Controls` for tenant scope and `Module <letter> Admin Controls` for module scope. Never shorten these labels to generic terms such as “Admin Controls” or “Administration.”

**Why:** Generic administration labels create uncertainty about which authority and data scope the destination controls. Attractive presentation must never come at the cost of precise meaning.

**How to apply:** Every navigation link, page heading, return link, loading state, and access-denied message must identify the tenant or module scope. Hide any navigation leading to module admin controls from everyone except that exact module admin and the tenant admin for that tenant; also enforce the same rule at the destination route.