# Durable user and agent edit history

The local history candidate replaces the 40-entry in-memory editor stack with a durable per-chart journal. Open **History / Timeline → Undo, redo and recover** to inspect saved actions, original field differences, attribution, branches and receipts. The editor toolbar and Cmd/Ctrl+Z, Shift+Cmd/Ctrl+Z and Ctrl+Y use the same history. Text fields retain their normal text-editing shortcuts.

## What is recoverable

Saved changes to organization/person/role fields, cards, reporting lines, positions, dimensions, connector routes/pins, support assignments/panels, captured source layout, chart name/description, directory parent and archive state. The stack survives chart switching, a renderer reload and a local-service/database restart. There is no 40-operation truncation; metadata is paginated 50 operations at a time. Typing is grouped by the existing autosave interval, and a drag is saved at gesture completion. Undo is available after **Saved**; an unsaved input's native undo remains separate.

SQLite captures complete old/new chart rows in the same transaction as every chart UPDATE, including updates from older clients. The journal records user/app or agent origin, labels and proposal/group references. New edits after undo start a new branch: abandoned redo actions become **superseded**, and their original snapshots and recovery receipts remain inspectable. No history is synthesized for actions made before this feature: their named versions and timeline checkpoints remain available below the new panel.

Creation/import, downloaded/exported files, settings, external files and permanent deletion are not reversible chart edits. Imports and full restores create copies. Archive is reversible; explicitly permanent deletion removes the chart, sources and its history. Keep full backups for independent disaster recovery. Durable history shares the local database and is not an off-device backup.

## Concurrency and crash recovery

Undo/redo require the exact next operation ID, current journal revision, saved chart version and updated timestamp. A single atomic transaction verifies these guards, saves before/after checkpoints, changes the chart and cursor, and appends a recovery receipt. Pending chart proposals block replay. Directory-parent recovery also validates and transactionally guards ancestor links to prevent cycles or missing parents introduced by another chart.

Duplicate/retried requests reuse `history-request-<unique ID>`. A committed request returns its original receipt and the **current** saved chart without applying again. A duplicate ID for another operation is rejected. On a lost response the desktop reconciles the current state and receipt; an unresolved request retains its identity for **Retry recovery request**. Editor mutations and chart switching are locked while replay is in flight. A failed transaction rolls back the chart, stack, receipt and checkpoints together.

D1's update change count includes trigger writes. Guarded primary-key updates treat zero affected writes as stale; a count greater than one is expected when history is captured. Synthetic SQLite integration fixtures mirror that D1 behavior.

## Reviews and older-operation reverts

Recovery preserves append-only source checks and lifecycle approval evidence. Restored active content becomes Draft; it never silently grants a new Current designation. Original Current checkpoints remain intact. Review and source-check-only changes appear as audit records rather than reversible content operations.

**Prepare reviewed revert of this operation** computes a three-way inverse. Fields that still equal the chosen operation's output can be reversed; later changes to other fields survive. A conflicting subsequent edit or incompatible array order blocks the entire proposal. The result uses the normal Before/After proposal queue and does not Apply. Archived charts and directory-parent changes use the normal chart controls or in-order undo instead of an AI content proposal. Structural validation runs before recovery.

## Agent tools

- `list_edit_history({chartId,before?})`: metadata, undo/redo targets, journal revision and saved chart guard.
- `preview_edit_operation({chartId,operationId})`: original field-level changes.
- `undo_chart_edit` / `redo_chart_edit`: exact operation/revision/chart guards plus stable `requestId`; only for an explicit user request.
- `stage_history_revert({chartId,operationId,expectedRevision})`: a reviewed inverse; blocks conflicts and stale previews.

Read/list the requested chart first. All tools honor Local AI control pause and selected-chart scope. Preview results contain scoped chart facts; do not read unrelated chart history to test connectivity. Write activity reports saved/review-ready/failure receipts so the desktop refreshes after agent recovery. Missing tools on older installations require the supported UI/version path, never a hidden database write or an automatic downgrade.

## Backups and verification

Schema 7 full-library/selected-chart backups retain operation snapshots, branches, ordering, attribution, group references and receipts alongside named versions, monthly history, support panels and retained source files. Import validates operation IDs, sequences, chart linkage, receipt references and snapshot structure before a merge. Copies receive remapped chart/operation/receipt IDs, and their undo/redo remains usable. Schemas 1–6 remain supported without invented older edit journals. Limits: 100,000 edit operations and 300,000 receipts per imported package, subject to existing file/package limits. Optional encryption protects the same complete package.

Focused synthetic tests cover complete support/geometry/metadata recovery; database reopening; more than 40 edits and pagination; isolated chart stacks; agent/user edits; branches; stale/double requests; pending reviews; lost-response receipts; transaction failure; conflict-aware reverts; retained source checks; Draft restoration; archive replay; navigation cycles; backup merge/redo; malformed receipt links; MCP scope/pause and review-only reversions. The native disposable-library journey exercises actual desktop Undo/Redo, switching charts, a real service restart, retry receipts, field previews and portable journal backup. Record macOS and Windows native results separately; a passing Mac run does not establish a Windows run.
