# Browser-first implementation status

November 19, 2026. Version 0.4.0 is a local release candidate, not a published web or plugin release.

| Area | Implemented and checked |
| --- | --- |
| Shared codebase | Existing route logic extracted into shared commands; desktop keeps thin route adapters. |
| Static editor | Generated public assets; relative URLs; worker-based SQLite and atomic IndexedDB recovery. |
| Portable libraries | Full identity-preserving Open, separate legacy Merge, sources, pending reviews/imports, history and unfinished monthly work. |
| Saving | Verified linked-file writes, external-change checks, download fallback, optional encryption, save status/reminders. |
| Desktop handoff | Full continuation export; separate sandboxed file workspace; original database/MCP target preserved. |
| Agent access | Shared 30 operations, 32 browser tools with workspace/connection guards, Pause and existing source/scope controls. |
| UI and outputs | Desktop-only controls hidden; accessible compact navigation; actual browser SVG/PNG/PDF/PPTX downloads checked. |
| Companion plugin | Staged 0.4.0 package, ten routed skills, generated tool schemas, unchanged desktop installer pin/helpers. |
| Guide | Four-page selectable-text guide with original Mac/Windows commands and browser file workflow. |
| Publication | Manual Pages artifact/deployment workflow added. No production deployment, main merge or shared plugin publication yet. |

Validation: 266 automated tests passed, one Windows-only installer test skipped on Mac. Typecheck and lint passed. The source and packaged Mac app each passed 76 native checks in disposable profiles. Mac DMG/ZIP packaging and package contents passed. Actual browser host tests covered tool discovery, review/Apply, undo/redo, monthly work, recovery, file download/reopen and Pause denial. The plugin archive was reopened and compared with source; automatic selection in a fresh host chat remains untested.

A synthetic storage-engine round trip preserved 82 chart IDs and 3,280 cards in an approximately 8.25 MB portable file. This measurement used Node sql.js and fake IndexedDB, not a browser/device benchmark. Full-size limits, all browser/font combinations and concurrent cross-device editing are not qualified.

Production dependencies reported zero audit advisories. The full development audit retains four high advisories in the existing Mac DMG maker dependency chain. No additional advisories were introduced by the browser dependency additions.

Remaining release steps: publish the reviewed candidate branch and qualify native Windows CI; review/integrate the exact release revision; explicitly deploy Pages and verify its actual URL; then update the plugin release URL and publish/install the qualified package. Keep chart libraries and retained sources outside source and deployment artifacts. See BROWSER-WORKSPACES.md for operating limits and BROWSER-FIRST-IMPLEMENTATION-PLAN.md for the original requirements.
