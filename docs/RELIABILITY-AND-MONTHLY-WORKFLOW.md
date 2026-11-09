# Reliable monthly work in OrgChart Studio 0.2.0

## Running and recovering

Each launch copies generated app code, migrations and preload code into a verified private runtime snapshot. A development rebuild cannot change that open snapshot. Live chart data stays in the configured data folder and is never copied into the application package.

An unexpected local-service exit preserves the app window and attempts up to three reconnects with a bounded retry budget. The runtime connection is withdrawn while unavailable and republished only after the local library responds. The recovery screen shows the last saved state and offers an explicit retry or local diagnostics if automatic attempts fail. Normal Quit cancels recovery and closes the owned server.

The editor keeps a private, atomically replaced recovery copy after a short debounce. This supplements database autosave; it is not a guarantee that the last keystroke survived a power loss. After a window failure, reopen the workspace. Unsaved recovery data is offered only against a matching saved version and timestamp. If the saved chart has changed, download the copy for comparison instead of overwriting newer data. An unavailable or malformed copy does not replace saved charts.

The bounded recovery journal contains timestamps, event categories, failure reasons, exit codes and app version. It omits chart contents, raw stderr, credentials and session tokens. Nothing is uploaded automatically. Recovery files remain inside the user's local app-support folder with restricted permissions.

## Consistency and source review

**Consistency & priorities** compares active, in-effect chart appearances. It highlights different assignments, position titles and immediate reporting parents for candidate matching organizations. Generic team-lead labels, planned positions and ambiguous repeated identities are treated separately. Similar names are not proof of shared identity, and the app never chooses a winning source or automatically merges organizations.

Review related occurrences beside their source locations and provenance notes. Source facts and reporting authority remain separate review decisions. The prioritized queue separates cross-chart disagreements, reporting questions, missing effective dates, source questions and uncertain tree placement. An absent effective date is not inferred from a source-file or save timestamp.

## Monthly workspace

1. Open **Monthly updates**. Choose the included active charts, month, label, original change list and optional documented update effective date. Starting saves previous states before updates.
2. Copy the AI handoff into the approved agent session. The MCP connection can read progress and related records and stage normal proposals. It does not accept those proposals on its own.
3. Open each proposal's Before/After review and select the proposals you have checked. Apply or Reject the selected group. Up to ten decisions commit atomically with their before/after checkpoints and decision receipts. Larger selections proceed in groups and show progress. If a later group fails, completed groups remain saved; the pending queue is reconciled before retry.
4. Newly created or otherwise excluded active charts can be included explicitly. Their first state in this update is labeled `monthly_joined`; this is not a claim that their creation preceded the update.
5. Resolve remaining pending proposals and structural blockers. Designate individual charts Current when appropriate, identifying the accountable person and acknowledging source notes that remain. Current is not an automatic certification of unresolved source facts.
6. Write a completion summary and save the final monthly checkpoint. Charts may remain Draft where that is the intended state. An interrupted open update resumes with its original change list and saved decisions.

The monthly JSON report is a progress/change report. Use the full v5 **Backup & restore** package to transport all current charts, archived charts, versions, sources and history.

## Questions about saved history

**Ask saved history** accepts supported questions such as:

- Who led Physics in October 2026?
- Who was the director of Physics on 2026-10-31?
- What changed since 2026-10-01?
- What changed since last month?

Explicit chart, organization, person/role and date filters are also available. The interpretation is displayed before the results. Dates select recorded UTC checkpoints. Month questions can return multiple recorded holders and conflicting appearances. Each result links to its supporting checkpoint and retains source certainty and documented effective dates.

This feature reads saved evidence locally; it does not send a prompt to an external model. It cannot establish an earlier appointment or organizational state when the library has no checkpoint covering that date. Comparisons report missing baseline coverage rather than presenting first recording as creation of a new organization. A broad month query is limited to 500 checkpoints; narrow the chart or date when that limit is reached.

## MCP additions

- `check_chart_consistency`: related appearances and disagreements within the enabled chart scope.
- `get_monthly_update_status`: saved progress, pending summaries and remaining questions. Every included chart must be enabled.
- `answer_saved_history`: a dated evidence-linked answer for one explicitly selected chart.

Pause, chart scope and retained-source controls still apply. No raw retained files are returned by these tools. Existing hosts may need to reconnect after upgrading to discover added tools.

## Qualification

The synthetic integration journey covers an interrupted atomic decision, database reopen, resumed monthly progress, explicit Current designation, source notes retained, dated answers and full export/import. The isolated Electron journey also stops the actual local service and verifies automatic reconnection, durable monthly progress, private editor recovery, and a desktop backup/restore round trip.

The same packaged smoke entry point is wired into the existing macOS and Windows workflows. Actual platform results must be recorded separately. Passing on macOS does not establish Windows compatibility; running the Windows workflow requires making the candidate code available to that runner.
