---
name: Public workspace placement
description: Defines where platform, tenant, and module public workspace links may appear.
---

Public workspace discovery must remain plane-local in the interface: platform entries appear on the platform surface, tenant entries on the tenant portal, and module entries only on that module's surface.

**Why:** Flattening all public records into a tenant portal destroys the platform → tenant → module hierarchy even when the API and databases remain isolated.

**How to apply:** Filter public workspace records by scope before rendering. For module scope, also match the exact module key and intersect results with the modules currently enabled in the master registry. Preserve the selected development tenant plane in preview links.