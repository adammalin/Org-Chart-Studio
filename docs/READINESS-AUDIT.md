# Human-test readiness audit

Audit date: 2026-08-04

Target: local macOS desktop source test using synthetic or approved sanitized data.

## Implemented test surface

| Capability | Implementation evidence | Automated evidence |
|---|---|---|
| Multiple independent charts | Empty-by-default persistent library with create, open, rename, describe, working status, duplicate, archive, and delete | Electron empty-start and create/delete round trip |
| Safe organizational editing | Unit add/edit/delete/reparent, controlled types, current/planned state, status/effective/visibility, source locator/certainty/review note, undo/redo | Hierarchy, governance-quality, import-provenance, and server-side save validation tests |
| Presentation editing | Animated partial-overlap box selection, Control/Command-click multi-selection, branch-aware grouped dragging, selected-card alignment and distribution, snapshot-stable card-only or whole-branch drag at every level without reparenting, pin state, branch/full/pin-aware ELK layout, obstacle-aware separate lanes or same-parent sibling combs, manually pinned orthogonal connector lanes with per-route reset, collapse, search, fit view | L2-through-L4 branch-movement tests, selection arrangement tests, obstacle/bundle/overlap/manual-route routing tests, export-coordinate test, ELK pin test, rendered-bundle test, live GUI route-pin/reset exercise, and manual selection/movement procedure |
| Structural validation | Duplicate IDs, missing endpoints, self-reporting, multiple parents, root count, and cycles | Focused validator tests, including 500 units |
| Legacy chart intake | Canonical CSV, workforce-roster CSV, canonical JSON, source-manifest JSON, and first-sheet Excel normalization; reusable local PowerPoint/Word/PDF/image intake bundles; source locator/certainty/review-note fields; mandatory preview confirmation; advisory import-quality report | CSV/JSON/roster/provenance and generated-XLSX tests; governance audit tests; Electron assisted-intake/source-download round trip |
| AI boundary | Downloadable two-pass normalization brief, reviewed file handoff, optional installer-managed local STDIO MCP companion, global pause and per-chart scope controls, bounded session receipts, color-independent activity UI, staged new-chart import review, in-memory chart-edit proposals, field-level Before/After review, explicit accept/reject, retained accepted/rejected edit timeline linked to named versions, and stale-write protection; no live endpoint or background AI connection | Source-boundary, diff/import validation, MCP control/configuration/STDIO/activity tests, desktop runtime-token smoke check, rendered-bundle tests, proposal API tests, and live staged-import/MCP-control GUI exercise |
| Planning, quality, and chart reconciliation | Per-unit current/planned state, accessible filters, advisory ambiguity/duplicate/depth/span/cross-chart findings, chart-to-chart comparison, and proposal-gated structural merge | Governance audit/compare/merge tests, rendered-bundle tests, and normal proposal validation |
| Versions and recovery | Autosaved working draft, named immutable snapshots, comparison, non-destructive restore, stale-save conflict protection | Electron v1/v2/v3 restore and stale-autosave checks |
| Publishing | Common scene graph drives SVG, PNG, vector PDF, editable PPTX; internal/public audience filters; four size profiles; editor-proportional fit-to-slide typography; accessible CSV | SVG content test, PDF page-size test, PPTX OOXML/editable-shape and wide-chart proportional-scaling tests, rendered-slide overflow test |
| Accessibility baseline | Accessible hierarchy table, semantic controls, search shortcut, dialog focus trap/Escape, notices, captions and labels | Static/type/lint checks; human VoiceOver test remains required |
| Backup and restore | AES-256-GCM encryption by default or explicitly confirmed unencrypted backup of charts, sources, versions, and retained AI review decisions; cloud-sync destinations restricted to encrypted packages; merge-only restore; device-local last-backup/restore health and configurable reminders without passphrase storage | Crypto tamper/wrong-password tests, encrypted cloud-folder and unencrypted local-folder tests, schema compatibility tests, and merge-only Electron persistence smoke; reminder timing remains a human UI check |
| Desktop safety | Loopback-only service, random per-launch token, isolated/sandboxed Electron renderer, external-request blocking, user-selectable local live-data path outside the repository/cloud sync, checksum-verified migration with retained source, and Git data guards | Network-policy, storage-location, migration, Git-guard tests, tracked-data scan, and Electron smoke |
| Install/update/start | Public unauthenticated GitHub bootstrap, exact commit resolution and install record, archive checksum record, checksum-verified pinned Node runtime, exact lockfile install, build, smoke test, reusable launch script, refreshed two-page setup and local AI workflow PDF | Bootstrap regression tests and local fresh-install/update simulation; fresh-Mac human test remains required |

## Automated gate

The required automated gate is:

```bash
npm run lint
npm test
npm run desktop:smoke
npm audit --audit-level=high
```

The gate is complete only when all commands exit successfully. The production build currently emits a size advisory for dynamically loaded ELK/PDF code; these are not part of the initial editor bundle and the advisory is not a functional test failure.

## Required human evidence before broader pilot use

- Fresh installation and update on a managed test Mac.
- Real opening/editing of generated PowerPoint, SVG, PDF, and PNG files in the intended tools.
- VoiceOver and 200% zoom checks.
- Designer review of representative small and large chart layouts.
- Data-steward review of normalization accuracy for representative cleared legacy charts.
- Backup recovery using a copy of representative cleared test data.

## Not claimed by this audit

This audit does not qualify a production MVP. Authentication, production roles, authoritative source integration, live governed AI, official approvals/publication, relational people/position/assignment entities, enterprise audit identity, retention, hosting, and formal security/accessibility/brand review remain governance-dependent work. The current result is a local technical build ready to begin human testing within the boundary above.
