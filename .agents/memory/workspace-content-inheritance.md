---
name: Workspace content inheritance
description: Defines how BisBy page, tab, and card access levels combine through the content hierarchy.
---

Treat `active`, `sign_only`, `view_only`, and `not_available` as progressively narrower capabilities. Effective access is the narrowest level set on a resource or any of its ancestors.

**Why:** A card marked active must not bypass a parent page or tab that a module administrator has restricted.

**How to apply:** Resolve effective content access on the server before rendering or performing an operation. Page restrictions constrain tabs and cards; tab restrictions constrain cards.