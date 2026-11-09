# Portable database and historical timeline

Full-library and selected-chart exports use `orgchart-studio-library-backup`, schema version **5**. Unencrypted JSON is the default. Optional AES-256-GCM protection wraps the same complete data; passphrases are not retained. Diagram/table exports describe a selected view; use **Backup & restore → Entire library** to transport the database and its history.

The v5 package contains:

- `charts`: working ChartDocuments, lifecycle records, navigation parent overrides, source provenance, layout and connector pins.
- `chartVersions`: immutable named versions, including existing legacy versions.
- `aiActivities`: accepted/rejected AI review decisions and version references.
- `checkpoints`: immutable full ChartDocuments with stable chart linkage, chart name, recorded timestamp, source-state timestamp, kind, label, batch link and supplied effective date.
- `monthlyUpdates`: month, label, original change list, completion summary, start/completion timestamps, state, included chart IDs and optional effective date.
- `sourceFiles`: checksum-verified retained source content. Device-specific storage paths are removed from current and historical exported source records.

Checkpoint kinds include `baseline`, `before`, `after`, `monthly_before`, `monthly_joined` and `monthly_after`. Recorded timestamps indicate when Studio captured a state. A source modification date, import date or checkpoint date must not be treated as an appointment or reorganization effective date. Monthly batches are grouped by their selected month; standalone checkpoints are grouped by recorded UTC month. Displayed timestamps use the device's local time zone.

Begin a monthly update before staging changes. The previous states and change list are committed together. Every applied mutation preserves before/after evidence atomically. Completion blocks while included charts have pending proposals or structural blockers. Reviewed groups of up to ten decisions commit atomically with before/after checkpoints and receipts. Charts added to an open batch receive a `monthly_joined` checkpoint at inclusion time. Completed workspace reports read final checkpoints and only decisions made within that batch’s recorded interval; later edits do not change that report. A crash leaves the prior checkpoints and the open batch durable; reopen it to continue. The completed monthly checkpoint records saved data and does not automatically designate Current or resolve source notes.

Imports remain merge-only: original charts are not overwritten. Restored charts receive new IDs and “— Restored” names. Archived status and Current designation metadata are preserved. Parent overrides, version/activity links, monthly chart lists and historical source/chart references are remapped to the restored copies. Historical names, content and timestamps remain recorded as originally exported. An imported unfinished batch is retained with its change list, an interrupted status and an explicit unfinished-update note; it is not made the live open batch. Start a new update to resume work on the restored charts.

Schema versions 1–4 remain supported. Files without timeline records restore their original named versions and begin timeline recording with a new baseline. Import validates chart structure, timeline references, source checksums, duplicate IDs and supported size limits before committing restored records. The current limits are 200 charts, 25,000 current cards, 50,000 named versions, 50,000 historical checkpoints, 5,000 monthly batches, and 250 MB of retained source content (512 MB maximum desktop package). The timeline displays up to 2,000 filtered checkpoints per query; narrow filters when needed.

An unencrypted export is readable by anyone who can access its file. Choose encryption when needed. Neither export mode changes the app's loopback-only connection, local access controls or chart-review protections.
