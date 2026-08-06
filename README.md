# ORNL OrgChart Studio

Working technical prototype for the data-first, governed organizational chart platform summarized in the [public product overview](docs/PUBLIC-PRODUCT-OVERVIEW.md).

This repository is a public technical preview. Public visibility does not resolve the remaining distribution, software-release, draft branding, or unreachable-object purge items in the [public-release checklist](docs/PUBLIC-RELEASE-CHECKLIST.md). See the [security policy](SECURITY.md) and [notice](NOTICE.md) for the source-only data boundary. The package remains deliberately marked `UNLICENSED`; public visibility alone does not grant reuse rights.

This repository implements a coherent local Phase 1 human-test slice:

- a persistent chart library for creating, switching, renaming, describing, status-tracking, duplicating, archiving, and deleting multiple independent charts;
- a renderer-neutral organizational unit model with expanded unit levels, positions, assignments, status, current/planned state, effective labels, source locator, source certainty, provenance, audience visibility, and presentation state;
- an interactive React Flow editor with unit add/edit/delete/reparent, search, branch collapse, pan, zoom, animated box selection, Control/Command-click multi-selection, Adobe-style alignment and distribution, reliable card-only or whole-branch dragging at every hierarchy level, obstacle-aware connector routing, optional same-parent sibling combs, manually pinned orthogonal connector corners with per-route reset, card pinning, undo, and redo;
- ELK-powered full, branch, and pin-aware layout modes;
- deterministic client and server structural validation for missing endpoints, duplicate IDs, multiple parents, invalid roots, self-reporting, and cycles;
- validated canonical CSV, workforce-roster CSV, JSON, source-manifest, and first-sheet Excel imports with a required human preview;
- reusable local source-intake bundles for retained multi-file PowerPoint, Word, PDF, PNG, JPEG, CSV, or Excel evidence before AI-assisted normalization;
- downloadable originals in R2, SHA-256 fingerprints, per-chart source records in D1, CSV templates, source manifests, and a two-pass AI normalization brief;
- autosaved working drafts, named immutable versions, working-versus-version comparison, chart-to-chart comparison and reviewed structural merge, stale-save protection, and non-destructive restore;
- an import-quality report for ambiguity, missing provenance, planned units, duplicate unit names, structural depth/span, and possible cross-chart matches;
- a dedicated Backup & restore workspace for encrypted-by-default or explicitly unencrypted single-file backups of the full library or selected charts, including named versions and retained AI review decisions, with merge-only restore, local backup-health status, and configurable reminders;
- separate, user-selected desktop locations for the local live database and encrypted recovery packages, with checksum-verified restart migration and cloud-sync permitted only for backups;
- an accessible table and downloadable accessible CSV generated from the same chart data;
- one shared scene model for internal/public SVG, configurable-resolution PNG, vector PDF, and editable PowerPoint output, including proportional typography and strokes that match editor zoom;
- natural-bounds, 16:9, 11 × 17 landscape, and 11 × 17 portrait output profiles with version and generation metadata;
- a local-only Electron desktop app with public command-line installation, update, start, and repair scripts for macOS and Windows, checksum and exact-revision records, cross-platform runtime smoke checks, a three-page setup guide, and an optional app-managed local STDIO MCP companion with pause, chart-scope, source-permission, and session-receipt controls for ChatGPT Desktop and Codex.

The user chart library starts empty and never inserts example charts. Synthetic fixtures remain test-only and are not shown or saved as user data. The prototype does not connect to personnel systems, authentication, a live AI endpoint, or a publication destination.

Fit-to-slide PowerPoint scales card geometry, typography, letter spacing, status markers, and connector strokes together. This preserves the editor's zoomed appearance instead of forcing minimum font sizes that collide inside small cards. Card names use the editor's compact single-line treatment. A very wide hierarchy can still be small on one 16:9 slide, so the export workspace warns when the selected profile crosses that threshold. Saved connector pins are translated into each export's page coordinate system, so SVG, PNG, PDF, and PowerPoint retain the same manual orthogonal route.

## Run locally

Requires Node.js 22.13 or later.

```bash
npm install
npm run dev
```

Use `npm test` for type checks, the deployment build, and the complete automated suite; use `npm run lint` for static analysis and `npm run desktop:smoke` for the local Electron integration check.

Local D1 and R2 bindings are configured in `.openai/hosting.json`. The first chart-library request creates the prototype schema and leaves the library empty until staff create or import a chart. Import files are limited to 5 MB.

## Command-line installation on macOS and Windows

The current distribution path deliberately does not use a DMG, PKG, MSI, or Setup executable, so it does not require Apple or Microsoft code-signing accounts. The public scripts install the Electron desktop app into a normal user folder without administrator access or GitHub authentication. They resolve public `main` to one exact commit, verify and record the downloaded archive SHA-256, use a compatible Node.js 22 runtime or download a private pinned runtime after checking the official Node checksum, install exact lockfile dependencies, build the app, and run the real Electron/GUI/storage/AI smoke test.

On macOS, paste these commands into Terminal:

```bash
/usr/bin/curl --fail --location --show-error \
  --output "$HOME/Downloads/orgchart-studio-install.zsh" \
  "https://raw.githubusercontent.com/adammalin/Org-Chart-Studio/main/scripts/bootstrap-mac-source-test.zsh"

/bin/zsh "$HOME/Downloads/orgchart-studio-install.zsh" \
  "$HOME/OrgChart-Studio-source-test"
```

On Windows 10 or 11, paste these commands into a normal, non-administrator PowerShell window:

```powershell
Invoke-WebRequest -UseBasicParsing `
  -Uri "https://raw.githubusercontent.com/adammalin/Org-Chart-Studio/main/scripts/bootstrap-windows-source-test.ps1" `
  -OutFile "$env:TEMP\orgchart-studio-install.ps1"

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass `
  -File "$env:TEMP\orgchart-studio-install.ps1" `
  -TargetDirectory "$env:USERPROFILE\OrgChart-Studio-source-test"
```

The `ExecutionPolicy Bypass` option applies only to that one setup process; the script does not permanently change PowerShell policy. During either setup, type `y` at `Install the local MCP integration? [y/N]` to connect ChatGPT Desktop or Codex, or press Return to skip it. Restart that AI client once after installation. The app must be open for AI tools to work.

Repeat the same two commands later to update or repair the installed copy. The update preserves `.runtime`, exact installed dependencies until they are refreshed, local tool state, and output folders. Working chart data is stored under the current user's normal Application Support or AppData location, not in the application folder, and is not replaced by an application update.

See the [cross-platform desktop quick-start guide](docs/ORNL-OrgChart-Studio-Desktop-Quick-Start.pdf) for installation, updates, start commands, storage, recovery, and the reviewed AI workflow. Unsigned native packages remain developer experiments only and are not the current distribution path.

## Connector routing and branch movement

**Select area** changes background dragging from pan to a partial-overlap selection box with animated marching ants. Every card touched by the box becomes part of the selection; Control-click and Command-click can add individual cards. Dragging any selected card moves and pins the group without changing reporting lines. When **Move branch** is on, every descendant below each selected card travels with the group; when it is off, only the selected cards move. Hold Space to pan while the tool is on. A contextual arrange bar aligns selected cards left, center, right, top, middle, or bottom and distributes three or more cards horizontally or vertically. Arrangement acts on selected cards only, pins their presentation positions, and is undoable. **Move branch** uses the position snapshot from the beginning of a drag, so moving an L2, L3, or lower card moves every descendant by the same amount without changing reporting relationships. The **Connectors** control is a device-local editor preference with two modes: **Separate lanes** prevents positive-length line sharing and routes around cards; **Sibling combs** allows only nearby same-row relationships from the same parent to share an aligned trunk. Different parents and substantially different rows remain independently routed.

Click a connector to select it. Its automatic corner handles appear as hollow controls. Drag a handle to pin the current route and move its horizontal or vertical lane, or choose **Pin current route** before editing. Manual movement is axis-constrained and the router inserts orthogonal reconnection segments after cards move, so diagonal segments are never produced. **Reset connector** removes only that relationship's saved corner positions and returns it to obstacle-aware automatic routing. These changes are autosaved and undoable, and the selected routing mode plus saved pins are used by SVG, PNG, PDF, and PowerPoint exports.

## Desktop runtime and data separation

The command-line copy wraps the local application in an Electron window. It starts a private service bound to `127.0.0.1`, gives each launch a new secret token, blocks the window from making non-loopback network requests, and runs the renderer with context isolation and sandboxing enabled and without Node.js access in the page.

Start the Mac copy by double-clicking `Start-OrgChart-Studio.command` in the installed folder or running `/bin/zsh "$HOME/OrgChart-Studio-source-test/scripts/start-mac-source-test.zsh"`. On Windows, double-click `Start-OrgChart-Studio.cmd` in the installed folder or run its PowerShell start script. The red X in the app stops both the interface and its private local service.

Working chart data is stored separately from the downloaded application at `~/Library/Application Support/ORNL OrgChart Studio/local-worker-data` on macOS or the corresponding per-user AppData location on Windows. In **Backup & restore**, staff can choose another empty local folder for the live chart library and a different folder for backups. A live-folder change takes effect only after restart: the app copies every file, compares SHA-256 checksums, switches only after verification, and retains the prior folder as a recovery copy. Live data locations inside the application source, OneDrive, Dropbox, iCloud, or another recognized cloud-sync root are rejected. A backup folder in OneDrive or Dropbox accepts encrypted packages only; explicitly unencrypted backups must use a separate local folder.

## Local data and Git protection

The desktop renderer is prevented from making non-loopback network requests, so the application itself has no upload path to GitHub or another remote service. The working D1/R2 data folder remains outside the repository. `.gitignore`, a tracked-file scanner, and repository `pre-commit`/`pre-push` hooks reject database files, Worker data folders, backup packages, source-evidence documents, chart-shaped structured data, credentials, known personnel examples, and user-specific filesystem paths before normal Git operations. The push hook checks both the current index and reachable Git history, so data committed by bypassing the commit hook is still caught before a normal push. `scripts/setup-mac-source-test.zsh` enables those hooks, and `npm run security:scan` checks the complete tracked index.

These controls protect the normal application and Git workflow; they cannot stop a person from deliberately bypassing hooks with Git override flags or manually copying/decrypting data into another application. Approved handling and access controls still apply. A cloud provider selected as the backup location will sync the encrypted package, so keep the passphrase separately in an approved password manager.

Run `npm run test:desktop` when developing the desktop wrapper. The older Mac-only source-test guide remains at [docs/ORNL-OrgChart-Studio-macOS-Quick-Start.pdf](docs/ORNL-OrgChart-Studio-macOS-Quick-Start.pdf); users should follow the current [Mac and Windows command-line guide](docs/ORNL-OrgChart-Studio-Desktop-Quick-Start.pdf).

The human-test sequence and boundaries are documented in [docs/HUMAN-TEST-GUIDE.md](docs/HUMAN-TEST-GUIDE.md). The requirement-by-requirement local readiness record is [docs/READINESS-AUDIT.md](docs/READINESS-AUDIT.md).

## Import and source-document workflow

The ready path is structured data:

1. Download the CSV template from **Sources & imports**, or prepare a first-sheet Excel workbook, and place one organizational unit on each row.
2. Keep stable `id` values, and use `parentId` to define the primary hierarchy.
3. Validate the normalized CSV, workforce roster, JSON, or Excel file and inspect the preview. A workforce roster with `Full Name`, `Position Title`, and `Supervisor Full Name` is mapped into a supervisory chart automatically; unique middle-initial differences are tolerated. Blocking findings prevent chart creation, and a human-confirmation checkbox is required.
4. Review the new draft chart and its source register; an import creates a new chart and never overwrites the active chart.
5. Download the retained original or source manifest when needed. The manifest can be imported again as JSON.

Existing PowerPoint, Word, PDF, image, CSV, and Excel charts are evidence, not authoritative databases. Up to 10 unchanged reference files can be collected first as a reusable local **Source intake bundle**, with a 20 MB per-file and 25 MB combined intake limit. Download the AI normalization brief and use it only with an AI environment approved for the source material. Canonical rows retain card provenance in `sourceLocator`, `sourceCertainty`, and `reviewNote`; reporting-line provenance is separate in `relationshipSourceLocator`, `relationshipSourceCertainty`, and `relationshipReviewNote`. Blank certainty enters the Source review queue instead of becoming confirmed. Excel imports preserve these fields. Validate the reviewed structure and associate its intake bundle before creating a draft. From that point forward, the saved structured chart data is the editable source of truth and exports are derived artifacts.

The **Import quality report** is advisory: it identifies items that deserve data-owner attention without inventing missing facts. Along with source uncertainty, future units, duplicates, broad/deep structures, and cross-chart matches, deterministic checks flag person-looking vacant cards, descriptive labels that may have become units, reused locators, confirmed records without locators, and suspiciously linear hierarchies that may have chained siblings together. Blocking structure or enum failures still prevent creation. **Current / planned** filtering in the editor and accessible table makes a future-state unit explicit without duplicating the whole chart.

## Codex-assisted handoff after installation

Codex can continue helping after the command-line desktop app is installed. The reviewed-file handoff remains available, and the desktop app can register a local MCP companion:

1. For a new legacy chart, create a local **Source intake bundle** from cleared PowerPoint, Word, PDF, image, CSV, or Excel files. By default MCP sees only names, sizes, and checksums. For an approved session, staff may separately enable **Allow retained-source extraction for this session**; `extract_import_intake` then returns bounded local text, worksheet cells, PowerPoint shape geometry, and connector metadata, never raw file bytes. Images remain metadata-only unless a separate approved OCR workflow is used.
2. Prefer `stage_normalized_import`: it opens **AI import review** in OrgChart Studio with the proposed units, relationships, evidence names, source certainty, planned/current labels, and quality findings. The person must choose **Create reviewed chart** or **Reject import**; rejection creates no chart.
3. For an existing chart, download its **Source manifest**, provide that JSON to Codex with the requested structural or content changes, and import the revised manifest as a separate draft. The original chart is not overwritten. A manifest carries canonical units and relationships, not custom card positions or version history.
4. With the MCP companion installed, open OrgChart Studio first. ChatGPT Desktop or Codex can then list charts and pending intake metadata, read an allowed chart, validate data, stage normalized CSV or JSON as a reviewed new-chart proposal, create a blank draft, stage changes to an existing working draft, and save the matching current draft as an immutable named version. With the separate retained-source toggle enabled, it can extract bounded content from a pending intake or an allowed chart. `stage_source_recheck` is the narrow existing-chart audit path: it verifies the exact retained-source checksums, writes a private selected-chart rollback package under the app's local Application Support folder, preserves layout and relationships, marks every proposed correction `needs_review`, and opens the normal human proposal review. The older direct import tool remains for compatibility, but reviewed staging is preferred. Read tools are marked read-only; write tools use the `writes` approval mode. No delete, backup restore, raw source-file download, storage-location, or publication tool is exposed.
5. For visual layout changes, Codex can operate the local Electron interface when explicitly requested, while data changes can go through the validated local MCP tools. Neither path edits D1/R2 files directly.

The MCP server is an on-demand local STDIO process, not a hosted endpoint or a background database service. Each Electron launch writes a mode-`0600` loopback connection file containing a new random session token and removes it during normal shutdown. The MCP refuses non-loopback URLs and unsafe connection-file permissions. OrgChart Studio must be open for its tools to work. In **Local AI control**, staff can install or remove the desktop connection, pause all calls, allow all charts or only selected charts, separately allow retained-source extraction for the current app session, and inspect bounded session-only access receipts. The source toggle resets off on restart. Chart fields and extracted source content returned by an allowed MCP read become part of the AI conversation, so use these tools only with data approved for that ChatGPT/Codex environment. Source developers may still use `npm run mcp:configure` and `npm run mcp:remove`.

When an MCP write begins, the running interface shows a restrained green edge glow and a color-independent **AI preparing changes** receipt naming the operation. For `replace_chart_draft`, the AI-produced document is held only as a temporary in-memory proposal. **Review changes** opens a read-only proposed canvas, highlights added or changed cards and connectors, and lists every field as Before and After. `stage_normalized_import` opens a separate new-chart review and creates nothing until **Create reviewed chart** is chosen. The person can reject either proposal; the saved library remains untouched. Other completed writes use **AI edit saved** and **Review update**. Failed writes use an explicit warning state.

Apply and Reject decisions create a bounded local AI-assisted activity record containing the change summary and affected IDs, never the prompt. An accepted record initially shows **Awaiting the next named version** and is linked automatically when staff save the next named checkpoint. The Version history workspace shows this timeline. Temporary proposal documents and live activity signals remain Worker-memory-only and expire; retained review decisions are included in whole-library and selected-chart backups. If a local editor save collides with a newer accepted update, the stale editor copy is stopped instead of being silently retried over it.

This keeps human confirmation, structural validation, stale-write protection, autosave, named versions, and backups in the normal workflow. See [docs/CODEX-HANDOFF.md](docs/CODEX-HANDOFF.md) for the exact exchange pattern and boundaries.

## Backup protection and recovery

The dedicated **Backup & restore** workspace creates one portable recovery file. Choose **Entire library** to include every chart, layout, named version, retained AI review decision, source record, and available original imported file, or choose **Selected charts** to package only the checked charts and their related data. **Encrypted (recommended)** protects the package with AES-256-GCM using a key derived from a PBKDF2-SHA-256 passphrase. **Unencrypted** creates a readable JSON package only after an explicit warning is acknowledged. The desktop app refuses to write an unencrypted package directly to a recognized OneDrive, Dropbox, iCloud, or other cloud-sync folder. The passphrase for an encrypted package is not stored or recoverable by the application; keep it in an approved password manager, separate from the backup file. A device-local health card records the last successful backup, encryption choice, chart count, last verified restore, and a 7/14/30/90-day reminder preference; it stores no passphrase and does not replace testing a real restore.

Restore is intentionally merge-only:

1. Choose the `.orgchart-backup` file; enter a passphrase only when the file is encrypted.
2. The app detects encrypted and unencrypted package formats; authenticated decryption detects a wrong password or modified ciphertext.
3. The server validates chart structure and rechecks every stored file against its SHA-256 checksum.
4. Each restored chart, saved version, and source record receives a remapped identifier and returns as a draft library copy.
5. Existing charts are not overwritten or deleted.

Backups are capped at 25 MB of original source-file content in this prototype. Export and restore responses use `no-store` cache controls. This recovery feature reduces accidental loss and protects a copied backup file at rest; it does not replace approved authentication, authorization, audit logging, retention rules, managed encryption keys, or infrastructure-level D1/R2 backups.

## Implementation boundary

This slice intentionally stops before the governance-dependent production capabilities described in the public overview: authoritative data ownership, approved identity integration, production role scopes, approved field classifications, retention policy, managed backup custody, a live approved AI endpoint, approved hosting, and publication authority. D1 stores each chart payload as JSON for rapid prototype iteration; this is not a production relational model. A production-oriented implementation should separate organizations, units, positions, people, assignments, relationships, layout views, publications, actor-aware audit events, and approval records into enforceable relational entities after the responsible owners approve those contracts.

## Brand implementation notes

The interface adapts the packaged ORNL design tokens with a balanced, application-focused expression. ORNL Green is the identity anchor; Hale Navy structures the workspace; Forge is limited to review and focus emphasis. Brand-created containers use square corners. Mulish is preferred with Aptos and Arial fallbacks. No ORNL logo artwork is included because approved production artwork was not supplied. Translucent UI surfaces are derived only from authorized palette colors.

This is a draft working prototype and is not an officially approved ORNL application or publication.
