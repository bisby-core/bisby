---
name: Path-routed tenant previews
description: Reliable tenant-host selection for development previews served through one externally routed web path.
---

For a path-routed development preview, select tenant API routing through an explicit development-only same-origin prefix that the server proxy maps to a fixed tenant hostname. Strip the prefix before forwarding. Do not infer tenant selection from the browser `Referer`.

**Why:** Browser requests can arrive without the page query in the referrer, causing the proxy to fall back to the platform host and tenant middleware to reject an otherwise valid login payload. Secondary local ports may also be running without being externally routed.

**How to apply:** Keep production hostname routing unchanged. In development only, map each allowed preview prefix to an allowlisted tenant host and overwrite both `Host` and `X-Forwarded-Host` before the API receives the request.