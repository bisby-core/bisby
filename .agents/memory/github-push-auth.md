---
name: GitHub push authentication
description: Non-secret workflow for pushing BisBy to its GitHub repository when extension authentication is unavailable.
---

Use the configured secret through shell expansion rather than displaying or copying its value. Set the authenticated remote only for the push, verify the resulting branch ref, and restore the credential-free remote URL immediately afterward.

**Why:** The repository's GitHub integration API path was rate-limited during large Git object uploads, while a manual PAT-backed Git push completed successfully. Leaving a token in `.git/config` would unnecessarily expose a credential to later local commands.

**How to apply:** Confirm the intended local commit and clean working tree, use the actual repository URL including its owner and repository path, force-update only when the remote contains an agent-created bootstrap history, verify `refs/heads/main`, and remove embedded credentials from the remote after verification.