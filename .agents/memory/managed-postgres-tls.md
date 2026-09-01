---
name: Managed PostgreSQL TLS
description: Records the verified TLS constraint of the current managed PostgreSQL pooler.
---

Use encrypted PostgreSQL connections with the managed pooler's documented self-signed-certificate behavior unless a trusted project-specific CA certificate is explicitly supplied. Do not claim certificate verification is active without that CA.

**Why:** Full certificate verification against the current pooler fails because its private chain is not in the system trust store. The platform's official guidance permits `rejectUnauthorized: false` for this connection class; the database provider requires its dashboard-issued root certificate for `verify-full`.

**How to apply:** Keep `require` as encrypted transport for the current managed connection. Use `verify-ca` or `verify-full` only together with an authoritative CA, never a certificate copied from an unauthenticated live handshake.