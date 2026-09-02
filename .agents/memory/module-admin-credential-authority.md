---
name: Module admin credential authority
description: Defines the tenant admin boundary for managing module admin access.
---

Tenant admins manage module admin access through sign-in credentials: account creation, initial temporary passwords, and later password resets. They must not receive a separate active/inactive control for module admin accounts.

**Why:** The user confirmed the password-reset key may remain because it performs a real credential reset. A separate status switch is still unwanted because module activation, suspension, and deactivation belong exclusively to Platform Administration.

**How to apply:** Keep module admin account creation and password reset available to tenant admins, but do not expose module admin status mutations. Preserve Platform Administrator module lifecycle authority and the module admin's controls over module staff and clients.