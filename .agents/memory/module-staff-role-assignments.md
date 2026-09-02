---
name: Staff workspace assignment ownership
description: Defines the shared staff workspace-assignment pattern and the administrator responsible at each scope.
---

All staff workspace-assignment surfaces use the same assignment interaction, but their authorization dimensions remain separate. Platform staff is a first-class platform role backed only by the master database and root platform routes; it is never tenant staff and must not inherit tenant routing or restrictions. Platform Administrator assigns platform staff, tenant admin assigns tenant admin staff, and module admin assigns module staff. A module staff user's workspace assignment remains the user-role assignment; do not add a second role-assignment layer.

**Why:** The user requires one consistent assignment interaction without forcing distinct roles into the same authorization scope. Conflating platform staff with tenant staff breaks the platform boundary even when the cards look similar.

**How to apply:** Keep staff account management, staff workspace assignment, and workspace-content matrices separate. Use the shared assignment interaction at each scope and enforce mutations only for that scope's responsible administrator. Module Admin Controls still expose no general Accounts surface.