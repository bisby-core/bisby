---
name: BisBy route matching
description: Frontend direct workspace URLs use complete path segments before normalization.
---

BisBy workspace routes should capture `ws-1` through `ws-10` as a complete URL segment and normalize the `ws-` prefix in application code; do not rely on a router parameter embedded after a literal hyphen.

**Why:** The router did not match the intended `/a/ws-1` shape when the parameter was declared as `ws-:workspaceNumber`, causing valid workspace URLs to fall into the invalid-route state.

**How to apply:** Keep the route pattern as `/:moduleLetter/:workspaceKey`, then validate and normalize the captured workspace key against `ws-1` through `ws-10`.