# Browser-first OrgChart Studio: approach and implementation plan

Date: November 19, 2026
Status: Implementation authorized in the conversation. The 0.4.0 local candidate and companion plugin are implemented and undergoing qualification. Main, public releases, installer pins and the shared plugin release have not been changed.

Implementation decision: keep the existing SQLite schema, guards, triggers and atomic batches in a Web Worker using sql.js. Commit the SQL snapshot and retained source blobs atomically to IndexedDB. This preserves the shared business rules without maintaining a second database implementation. Library files remain validated JSON packages, never user-supplied SQLite binaries. See BROWSER-WORKSPACES.md for the implemented behavior and release limits.

## 1. Product direction

Make the static web app the primary way to use OrgChart Studio. Retain the Mac and Windows desktop app as an alternative, using one codebase, shared chart behavior, and compatible library files. Ordinary web use requires no OrgChart Studio account or local installation.

The companion plugin asks which experience the user wants: **Open the web app** or **Install/open the desktop app**. Honor an explicit choice immediately; ask once when the choice is unknown, reuse it for subsequent work, and provide a way to change it. Offer to remember the preference locally where the host supports that. Do not silently install desktop software when web tools are unavailable.

The web app includes browser-agent tools from its first release. Agent workflows are a core feature, not a desktop-only add-on. Browser-specific controls follow detected capabilities. Keep the same chart layouts, source appearance, and editing experience wherever the underlying capability is available.

### Agreed requirements

| ID | Requirement |
| --- | --- |
| R1 | One source repository and shared application logic for the web and desktop experiences. |
| R2 | A generated public website folder that GitHub Pages can deploy; no server runtime required for ordinary web use. |
| R3 | No Studio login for the initial file-based web app. |
| R4 | Complete portable library files, unencrypted by default, with optional encryption. |
| R5 | Automatic browser recovery plus clear file-save state and timely save reminders. |
| R6 | Support a user-selected file in a locally synced OneDrive/Dropbox folder where browser file access is supported; retain import/download fallback. |
| R7 | Preserve monthly checkpoints, durable user/agent undo and redo, source checks, layouts, Current/Draft state, and historical evidence across both experiences. |
| R8 | Built-in WebMCP/browser tools, plus the existing desktop MCP path, calling the same application operations. |
| R9 | Plugin asks web versus desktop, adapts its instructions and tool routing, and helps save, import, export, and switch safely. |
| R10 | Hide unsupported controls; explain how to enable supported controls awaiting permission or connection. |
| R11 | Keep personnel libraries and retained source documents outside the public repository and deployment output. |

Direct cloud APIs, shared online databases, unattended remote agents, and simultaneous multi-user editing are later options. They are not requirements for the initial static version.

## 2. Current implementation and work to preserve

Source inspected on November 19, 2026:

- The React workspace in app/orgchart-studio.tsx calls 14 server route modules under app/api. This is not currently a standalone static browser application.
- db/index.ts requires database and source-file bindings. Existing handlers combine application rules with persistence. Desktop starts a local service through electron/main.cjs.
- lib/backup-format.ts and docs/DATABASE-FORMAT.md define schema 7 full-library packages, including charts, named versions, source bytes, monthly checkpoints and edit journals. Versions 1–6 remain readable.
- Current restore is a validated **merge into copies** with remapped IDs. It must remain separate from opening a working library for continued editing.
- Durable edit capture currently depends partly on SQL triggers and transactional handlers. Preserve atomic chart/history/checkpoint writes when moving rules into shared commands; avoid duplicate journal entries from both triggers and application code.
- Existing source extraction, encryption, import parsing, layout, and exports contain reusable code. Verify their complete browser dependency graphs before claiming browser compatibility.
- mcp/server.mjs and its tool modules expose the desktop connection. The plugin source is the sibling ORNL-OrgChart-Studio-Plugin/orgchart-studio package, not an installed cache. Its inspected manifest is 0.3.3; its references contain older format/version descriptions that need reconciliation during the plugin phase.

Door Sign Studio supplies a useful local pattern: its src/browser-tools.js registers page tools; its separate local companion supplies conventional stdio MCP and persistent workspace operations. Reuse the architecture, not its smaller data model or save assumptions. See the sibling ORNL-Door-Signs/docs/MCP.md.

## 3. Shared architecture

Use a shared application command layer between the user interface/agent adapters and persistence:

    React UI / browser tools / desktop MCP
                      |
       Shared queries, commands, validation, history,
       source-review rules and portable-file codecs
                      |
         Desktop adapter       Browser adapter
         existing service      local browser storage
         database/source files IndexedDB + source blobs
                      |
         Shared portable library file contract

Proposed module boundaries, to finalize in the first prototype:

| Area | Responsibility |
| --- | --- |
| lib/ | Shared chart model, validation, layout, evidence, lifecycle and file codecs. |
| runtime/contracts.ts | Typed queries/commands, transaction boundaries, capabilities, revisions and save receipts. |
| runtime/desktop/ | Existing local-service adapter; maintain current API compatibility during migration. |
| runtime/browser/ | IndexedDB transactions, retained source blobs, browser recovery and file handles. |
| agent/ | Common operation definitions and result contracts; browser/stdio adapters apply their own scope and transport checks. |
| web/ | Static entry point and isolated build configuration, mounting the shared workspace. |
| public/ | Generated deployable HTML/JS/CSS/assets only; no user data and no manually maintained second app. |

The exact filenames are proposed. A second independent UI or a second set of chart/history business rules is not the intended result. Do not introduce a fake fetch interceptor as the permanent browser persistence architecture.

Keep web and desktop build outputs isolated. If public/ is the generated web output, configure it explicitly so the existing desktop/Vite build does not treat that output as its source asset directory or recursively copy it. Add output exclusions and clean rules that cannot reach user files.

Deploy public/ as a GitHub Actions Pages artifact. GitHub's branch publishing directly accepts root or docs; Actions supports a custom build output. Test the actual repository subpath and direct reloads. [GitHub Pages publishing](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)

## 4. Library files and browser recovery

### Open, import, save and recover are separate operations

| Action | Required behavior |
| --- | --- |
| Open library | Validate a full library, then open it as its own workspace. Preserve internal IDs, journal identity, history and recorded timestamps. Resolve existing unsaved work before switching. |
| Import/merge | Copy selected content into an existing workspace using the current validated remapping behavior. Preserve originals. |
| Save | Serialize the full library to its selected destination. Track the exact workspace revision written. |
| Save a copy / Download library | Create a full portable copy without implying that a different linked file is current. |
| Recover browser work | Offer the newer local recovery state after a crash/reload, with its file-save status intact. Never silently replace a newer external file. |
| Export diagram/table | Produce a selected view. This does not satisfy the requirement to save the complete library. |

Opening a library resumes its saved unfinished monthly batch and proposal state after validation. Merge/restore retains the existing interrupted-copy semantics. Add an isolated file-workspace path on desktop so opening a transferred library can preserve identity without replacing the existing desktop database.

Start from the current schema 7 contract. Add durable workspace identity and revision metadata through a documented backward-compatible extension where possible; introduce a new version only if the actual compatibility contract requires it. Test older desktop versions explicitly. A reader must reject an unsupported version or retain supported extension data, never silently discard history or unknown required fields.

The full file must retain chart and directory IDs, support panels, captured card/connector geometry, Current/Draft evidence, source checks, named versions, historical snapshots, edit operations/branches/receipts, monthly updates, and checksum-verified source bytes. Pending proposals and unfinished monthly work also need portable continuity: inventory what schema 7 currently omits and add an explicit migration/extension rather than assuming it is already transported. Session tokens, active agent grants, absolute device paths, file handles and passphrases are never portable library content.

Continue opening existing unencrypted and encrypted backups. Unencrypted remains the default for new files. Opening an encrypted library must not silently save an unencrypted replacement over it; changing protection is explicit. Passphrases remain in memory only for the chosen session and are never sent to an agent or written into recovery preferences. Define encrypted-recovery behavior and locking before shipping that mode.

### Saving and recovery model

- Use transactional browser storage for the working state, edit history and source references; keep large source blobs out of small preferences storage. Request persistent storage when supported and handle refusal, quota exhaustion, private browsing and manual clearing. Browser recovery is not the independent library file. [Browser storage limits](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)
- Offer Open/Save file access where supported, storing the handle locally only with permission. Recheck permission after restart. Support ordinary file selection and downloads everywhere else. [File access and permissions](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access)
- A user may choose a file inside an already synced OneDrive/Dropbox folder. Studio reports the local file write; the sync client controls cloud upload. Initial web saving requires no provider API or Studio account.
- After initial permission, offer an explicit autosave-to-file preference while the app is open. Debounce writes, serialize them, retain the previous good state where supported, and keep edits marked outstanding if a newer revision appears during serialization. Do not promise background writes after the page closes.
- Track the last opened/written file fingerprint and revision. Before overwriting, detect external changes and offer reopening, comparison or Save a copy. This is best-effort conflict detection, not an atomic lock across cloud clients or multiple computers.
- Coordinate tabs for the same workspace where supported, with one writer or a visible conflict state. Concurrent devices sharing a synced file are not a real-time collaborative session.
- Validate before replacing a destination, await file close/write completion, and use readback/checksums where available. Cancellation, permission loss, disk errors and failed downloads must leave recoverable work intact.
- Do not silently trim monthly history, edit journals or sources to fit browser limits. Offer explicit archive/export choices and explain any limit before accepting more data.

### Save status and reminders

Display recovery and portable-file status separately, including workspace/file name, current revision, last file-write timestamp and outstanding changes. Suggested user text: **Recovery copy saved in this browser**, **Library file needs saving**, **Library file saved**, **Download ready**, **File access needs permission**.

Choose final reminder defaults in usability testing. Proposed initial behavior: prompt for a library file after the first meaningful edit; remind after 15 minutes of unsaved file changes; always show a save action after completing a monthly update; resolve save state before switching libraries or experiences. Respect reminder dismissal and user preferences. Unload warnings are a secondary aid, not the recovery mechanism.

A generated download is not proof of a completed disk save. Browser tools return a prepared/download-requested result until the host can verify completion or the user confirms it. Never label a local write **Synced to OneDrive/Dropbox** without provider confirmation. Completing a monthly checkpoint and saving the latest portable file are separately reported outcomes.

## 5. Capability-driven interface

Maintain one capability model used by the UI, plugin and agent adapters. It reports runtime, build/contract version, supported operation, current permission/connection, workspace identity/revision, and reason or next action. Metadata-only readiness checks must not read chart contents.

| Capability | Initial web behavior | Desktop behavior |
| --- | --- | --- |
| Library/editor/tree/search; source-style layout; Current/Draft | Shared behavior. | Shared behavior. |
| Monthly timeline, review queue, durable undo/redo | Required browser transaction parity. | Preserve current behavior. |
| Browser recovery | Automatic local recovery with explicit file-save status. | Retain desktop recovery. |
| Open/Save linked library file | Feature-detected; permission-aware; download/import fallback. | Native supported file workflow. |
| Scheduled backup-folder writes | Hide desktop scheduling UI; offer in-page saving/reminders. | Retain existing supported behavior. |
| Local MCP registration and OS storage locations | Hide. | Show when locally supported. |
| Browser-agent tools | Expose when supported by the actual browser/agent connection. | Optional only if qualified; stdio remains available. |
| Desktop MCP/service restart controls | Hide. | Preserve current controls. |
| Retained-source extraction | Browser-safe parsers with explicit source scope and size limits. | Existing supported parsers and limits. |
| Live SharePoint source acquisition | Authenticated browser/agent access or user-supplied files; report access gaps. | Existing authorized workflow. |
| SVG/PNG/PDF/PPTX/CSV exports | Qualify each browser path; hide only unqualified formats and explain available alternatives in help. | Retain qualified formats. |

Unsupported controls are hidden, including keyboard/menu/agent entry points that would bypass capability checks. Supported features waiting for permission or connection provide a clear enable/reconnect action. Never hide that imported content exists or omit it from later saves because its editing UI is unavailable. Preserve it or block a lossy save with an explanation.

The source of truth remains https://ornl.sharepoint.com/sites/orgchart. Opening the static app does not confer SharePoint access or bypass cross-origin restrictions. A cached source remains a snapshot; record source URL, checksum, locator and actual verification time separately from checkpoint/effective dates.

## 6. Browser tools and desktop MCP

Define common commands for search/read, source extraction, staged updates/imports, review decisions, validation, source checks, monthly updates, versions/history, undo/redo, Current designation and file preparation. Expose only operations actually implemented and authorized in each adapter. Extending desktop tools beyond their existing capabilities is a deliberate contract change, not an automatic side effect of browser parity.

Register browser tools through the supported WebMCP API, following the Door Sign pattern and current lifecycle API. Browser support and agent discovery must be tested on the intended host. The current browser documentation describes an experimental surface; tool registration alone does not prove a user's agent can discover or invoke it. [WebMCP browser guidance](https://developer.chrome.com/docs/modern-web-guidance/guides/webmcp/agentic-javascript-tools)

Tool requirements:

- Metadata-only capability/status entry point, with an explicit connected-tab/workspace identity. Do not attach to a similarly named stale library in another tab.
- Preserve pause, selected-chart scope, retained-source consent, stale-write guards, proposal review and user/agent attribution in both transports. No direct store/SQL bypass.
- Serialize mutations through shared transactions and preserve idempotent request/receipt identities. Confirmation/review policy is determined by the existing action and current user request, not relaxed because a tool is in a browser.
- Return the committed revision and clear result type: staged proposal, committed working state, prepared file, completed file write, download requested, or action requiring user interaction. Include pending save state.
- Browser file pickers may require a real user gesture. Prepare an Open/Save/download action and request the necessary click instead of faking completion or trying to bypass the browser.
- Keep extraction bounded and source-linked. Neither a successful structural validation nor a recorded AI check proves fresh official-site verification by itself.
- Tools operate while the page is open. A Pages URL is not an always-on conventional HTTP MCP endpoint. Keep the desktop/local companion for standard clients; a remote service would be a separate later deployment.

## 7. Plugin changes

Update the maintained source package only during the implementation phase. Preserve plugin identity, sharing audience, installer rollback/pin history, and current desktop workflows.

| Plugin area | Planned change |
| --- | --- |
| use-orgchart-studio router and default prompt | Ask web/desktop when unknown; respect explicit/remembered choice; route by actual capabilities. |
| open / setup / troubleshoot skills | Web opens the verified release URL and checks readiness; desktop reuses an existing install or performs the requested native install. Installation is not part of web launch. |
| content, source, layout, history and monthly skills | Share task rules while selecting browser tools, desktop MCP or supported visible UI. Check workspace and save status before/after mutations. |
| export/import/backup skill | Explain Open versus Merge; distinguish full-library files, chart exports, browser recovery and durable saves; support optional encryption and synced-folder guidance. |
| references and catalogues | Regenerate data-contract, workflows, MCP tools, source guide, UI guide, exports/backups and install/launch references from actual contracts. Remove stale schema/tool/version claims. |
| helper scripts | Keep desktop OS detection, install/inspect/launch behavior; avoid running desktop discovery or installers for web users. |
| release and sharing | Archive the current plugin baseline; version, validate, publish/install through the established plugin workflow when separately authorized. A source edit does not update recipients automatically. |

When a requested capability is absent, explain the available route. Offer desktop for a desktop-only task, but wait for a choice before installing or switching. If WebMCP is missing, supported browser UI operation may be a fallback; report it accurately and do not claim an MCP connection.

Switching experiences is a file handoff: save the intended complete library, verify the best evidence available, open that file in the destination, and compare its identity/revision/counts. An existing desktop database is not silently overwritten; use a separate workspace or the explicit merge path until multi-workspace desktop support is qualified.

## 8. Implementation sequence and completion criteria

Execute each phase in an isolated branch/checkpoint, with synthetic fixtures and existing data left intact. Check off the phase only after its exit criteria pass. No phase is marked implemented by this planning document.

| Phase | Work and deliverable | Exit criteria | Depends on |
| --- | --- | --- | --- |
| 0 — Baseline and feasibility | Preserve the reviewed desktop candidate and plugin baseline. Inventory all 14 routes, their commands/transactions, file formats and dependencies. Prototype a static page with browser tool discovery, one atomic history transaction, and Open/Save in target hosts. Measure realistic synthetic library/source sizes. | Actual target agent discovers and calls a harmless browser tool; desktop baseline is reproducible; browser storage/file feasibility and first-release support matrix are recorded. Stop and revise the affected design if host support is absent. | Planning |
| 1 — Shared command contracts | Introduce typed commands/queries, runtime adapter, capabilities and result/save receipts. Move rules out of UI/handlers incrementally; retain route compatibility. Centralize journal ownership without double capture. | Existing desktop/API/MCP suites pass; the same command fixtures exercise desktop and a test adapter; atomic history and review behavior remain unchanged. | 0 |
| 2 — Browser workspace persistence | Implement IndexedDB stores/transactions for charts, sources, journals, checkpoints, proposals and monthly batches. Add recovery, schema migrations, quota handling and tab coordination. Mount the shared UI without required server calls. | Reload/crash recovery preserves the complete synthetic workspace; failed transactions leave no partial chart/history state; no hidden call to a missing API server. | 1 |
| 3 — Portable working libraries | Implement Open versus Merge, full serialization, identity/revision extension/migrations, isolated desktop file workspaces, file handle and download adapters, conflict detection, encryption and protection-preserving recovery. Add linked-file autosave as an explicit preference. | Desktop-to-web-to-desktop round trips preserve all required fields and usable undo/redo; legacy imports work; canceled/failed/externally changed saves leave recoverable work and truthful status. | 2 |
| 4 — Web UI and save guidance | Wire capability visibility, permission/reconnect actions, current file/revision display, reminders, library switching and full-save prompts after monthly completion. Preserve visual layout and source appearance. | No unsupported controls/shortcuts remain actionable; available features stay discoverable; user can distinguish recovery, checkpoint completion and library-file saving. | 2–3 |
| 5 — Imports, evidence and exports | Qualify browser parsers, source blobs/extraction, official layout fidelity, fonts, SVG/PNG/PDF/PPTX/CSV and retained evidence. Move heavy work to workers where needed; preserve existing expansion/size limits. | Open exact exported files and compare data/rendering; retained source checksums and support geometry survive; unsupported data is preserved without lossy saves. | 2–3 |
| 6 — Production browser-agent tools | Implement common tool adapters, lifecycle registration, actual connection status, source/chart scopes, guarded commands and gesture-aware save actions. Retain desktop MCP. | A real target agent completes a synthetic monthly update, source check, undo/redo and save handoff against the open page; denial, stale revisions and missing capabilities fail accurately. | 1–5; discovery prototype in 0 |
| 7 — Plugin dual-mode workflows | Update the router, launch/setup, task skills, catalogues, helpers and mode-switch/save guidance. Reconcile old format references, archive prior package and prepare the new version. | Fresh-chat tests cover web, existing desktop, missing desktop, missing browser tools, denied file permission and switching modes without reading the wrong library or forcing installation. | 3–6 |
| 8 — Cross-platform qualification | Run common fixtures, browser journeys, exact file round trips, native desktop regressions, public-output scans and dependency review. Record actual browser/agent/OS versions and residual limits. | The acceptance matrix below passes for the advertised release capabilities; desktop still passes native Mac and Windows CI; no public artifact contains user libraries or sources. | 4–7 |
| 9 — Preview and release handoff | Produce Pages artifact/preview, revised quick-start PDF and web/desktop/plugin support matrix. Prepare website/plugin listing updates, release notes and rollback instructions. Publish only within the subsequent release authorization. | Exact deployed preview verified; plugin targets the actual URL and compatible release; save/restore smoke test passes; rollout and rollback evidence retained. | 8 |

Suggested first implementation milestone: phases 0–3, demonstrating a static browser editor that opens a full synthetic library, edits it with durable undo, reloads safely, and saves/reopens the file with IDs and history intact. Browser-tool discovery is proven in phase 0; the full agent workflow remains required before the first advertised web/plugin release.

## 9. Acceptance matrix

| Area | Required evidence |
| --- | --- |
| Browsers | Edge and Chrome on Windows; Chrome and Safari on macOS; Firefox import/download fallback. Record the actual combinations qualified. File access and browser-agent support are separate capabilities; no unsupported combination inherits a pass. |
| Desktop | Native Mac/Windows install, update, launcher, packaged runtime, MCP, history and recovery regression checks. |
| Shared commands | Same expected results and errors across adapters; stale/retried writes; branch-after-undo; review/current rules; before/after checkpoints and receipts committed once. |
| Portable data | Compare current charts, IDs/references, versions, all history/checkpoints, monthly batches, source checks, proposals, support panels, geometry and source byte checksums. Verify semantics after import rather than relying on byte-identical JSON ordering. |
| Library operations | Open does not clone IDs; Merge does clone/remap; repeated Open does not duplicate records; schema 1–7 compatibility; interrupted monthly work; separate workspace handling; unknown-version/required-field rejection. |
| Real files | Fresh browser profile opens a file; full library round trip into an isolated desktop workspace and back; subsequent undo/redo works. No restore test against the real personnel database. |
| Save failures | Picker cancellation, denied/revoked permission, quota/disk errors, close during write, edits arriving during export, wrong encryption password, tampered/corrupt package, local recovery newer than file and external sync changes. |
| Browser tools/plugin | Real discovery/invocation by the intended agent; pause/chart/source gates; metadata-only readiness; wrong-tab protection; unavailable host fallback; user-gesture save handoff; no false saved/cloud-synced claim. |
| Source/visual fidelity | Compare representative official-style synthetic layouts and actual saved SVG/PNG/PDF/PPTX outputs, including fonts, card dimensions, text, connectors and advisory panels. Fresh official-site validation is a separate evidence task. |
| Performance | Small, representative and large synthetic libraries, with retained sources and long journals; responsive search/edit/history; graceful limits without dropped attachments. Select published browser limits from measurements. |
| Public build | Static dependency scan excludes Node-only/server modules and live data; no required API routes; retained source documents and secrets absent; repo subpath, refresh/deep links and production asset loading work. |
| Update/rollback | Browser schema upgrades retain old recovery/file data; app update never discards dirty work; old/new file-reader behavior documented; plugin/Desktop rollback does not silently downgrade a library. |

Pass criteria apply to the advertised capabilities, not a claim of testing every function or eliminating all vulnerabilities. Carry forward the existing desktop review's unresolved dependency findings and track their disposition separately.

## 10. Decisions to resolve during prototypes

- Which actual browser-agent hosts expose the page tools, and what origin-trial or host configuration is required? Qualify one installation-free target path before committing to the public support promise.
- Is IndexedDB adequate at measured source/journal sizes, or does the browser adapter need an OPFS/blob optimization? Keep that implementation detail behind the same contract.
- What is the minimum portable workspace-identity extension, and how do existing desktop readers handle it? Are pending reviews included or explicitly resolved before an older-format save?
- Which browser export formats can meet the current font/layout fidelity? Retain unsupported fields even if their editing controls are hidden.
- What protection does local recovery offer for an encrypted library, and how does session locking behave?
- What file-autosave/reminder defaults are understandable in usability testing? Which concurrent-tab strategy is supported?
- What verified preview/production Pages URL should the plugin use? No URL or published release exists merely because this plan proposes one.

These questions do not change the agreed browser-first direction. They determine the qualified support matrix and exact implementation choices. No real library migration, cloud connection, plugin publication, main merge, installer-pin update, or website deployment is part of this documentation task.
