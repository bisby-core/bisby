---
name: Vercel API release validation
description: Packaging and live-verification rules for the Knex-based serverless API on Vercel.
---

Prebundle the Knex-based serverless API before Vercel packages the function, and verify a known API route returns JSON after every entrypoint or rewrite change.

**Why:** Vercel source packaging can follow Knex's unused optional database drivers and fail the build. A stale function rewrite can also return the SPA HTML with HTTP 200, so deployment success and status-only checks are insufficient.

**How to apply:** Deploy the prebundled handler to a preview branch first. After promotion, check the response content type and body for health, public workspace, and authenticated routes on the root and tenant hosts.