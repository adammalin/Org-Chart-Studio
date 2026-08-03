# Security policy

## Data boundary

This repository is source code only. Do not commit, attach, paste, or publish real organizational charts, personnel rosters, imported source files, local databases, encrypted backup packages, credentials, access tokens, private keys, or user-specific filesystem paths.

Keep live chart libraries in a local folder outside the source checkout. Keep recovery packages in the separately configured backup folder. A backup folder may be synchronized by an approved cloud-storage provider because the application writes only the passphrase-encrypted `.orgchart-backup` package there; keep its passphrase separately.

Examples in source and tests must be clearly fictional and use names such as `Example` or `Synthetic`.

## Reporting a vulnerability

Do not open a public issue containing a vulnerability, credential, chart, roster, or source document. Report security problems through a private GitHub Security Advisory for this repository. If that channel is unavailable, contact the repository owner through a previously approved private method without attaching operational data until a secure exchange method is agreed.

## If data enters Git

Stop pushing and keep the repository private. Revoke or rotate exposed credentials, remove the material from the working tree, rewrite every affected reachable reference, and coordinate removal of cached views or forks as needed. Treat copies, clones, and downloaded archives as separate disclosure locations; rewriting the main branch does not retract them.

Repository hooks and scanners reduce accidental disclosure but can be bypassed and are not a substitute for data classification, access control, code review, or approved incident response.
