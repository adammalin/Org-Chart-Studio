# ORNL OrgChart Studio

Working technical prototype for the data-first, governed organizational chart platform summarized in the [public product overview](docs/PUBLIC-PRODUCT-OVERVIEW.md).

This repository is a public technical preview. Public visibility does not resolve the remaining distribution, software-release, draft branding, or unreachable-object purge items in the [public-release checklist](docs/PUBLIC-RELEASE-CHECKLIST.md). See the [security policy](SECURITY.md) and [notice](NOTICE.md) for the source-only data boundary. The package remains deliberately marked `UNLICENSED`; public visibility alone does not grant reuse rights.

This repository implements a coherent local Phase 1 human-test slice:

- a persistent chart library for creating, switching, renaming, describing, status-tracking, duplicating, archiving, and deleting multiple independent charts;
- a renderer-neutral organizational unit model with expanded unit levels, positions, assignments, status, effective labels, provenance, audience visibility, and presentation state;
- an interactive React Flow editor with unit add/edit/delete/reparent, search, branch collapse, pan, zoom, animated box selection, Control/Command-click multi-selection, Adobe-style alignment and distribution, reliable card-only or whole-branch dragging at every hierarchy level, obstacle-aware connector routing, optional same-parent sibling combs, manually pinned orthogonal connector corners with per-route reset, card pinning, undo, and redo;
- ELK-powered full, branch, and pin-aware layout modes;
- deterministic client and server structural validation for missing endpoints, duplicate IDs, multiple parents, invalid roots, self-reporting, and cycles;
- validated canonical CSV, workforce-roster CSV, JSON, source-manifest, and first-sheet Excel imports with a required human preview;
- optional retained multi-file PowerPoint, Word, PDF, PNG, or JPEG source evidence for AI-assisted normalization workflows;
- downloadable originals in R2, SHA-256 fingerprints, per-chart source records in D1, CSV templates, source manifests, and a two-pass AI normalization brief;
- autosaved working drafts, named immutable versions, comparison, stale-save protection, and non-destructive restore;
- a dedicated Backup & restore workspace for encrypted-by-default or explicitly unencrypted single-file backups of the full library or selected charts, including named versions and retained AI review decisions, with merge-only restore;
- separate, user-selected desktop locations for the local live database and encrypted recovery packages, with checksum-verified restart migration and cloud-sync permitted only for backups;
- an accessible table and downloadable accessible CSV generated from the same chart data;
- one shared scene model for internal/public SVG, configurable-resolution PNG, vector PDF, and editable PowerPoint output, including proportional typography and strokes that match editor zoom;
- natural-bounds, 16:9, 11 × 17 landscape, and 11 × 17 portrait output profiles with version and generation metadata;
- a local-only Electron wrapper, checksum-verified setup/update scripts, automated desktop smoke checks, a one-page macOS PDF guide, and an optional installer-managed local STDIO MCP companion for ChatGPT Desktop and Codex.

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

## Connector routing and branch movement

**Select area** changes background dragging from pan to a partial-overlap selection box with animated marching ants. Every card touched by the box becomes part of the selection; Control-click and Command-click can add individual cards. Dragging any selected card moves and pins the group without changing reporting lines. When **Move branch** is on, every descendant below each selected card travels with the group; when it is off, only the selected cards move. Hold Space to pan while the tool is on. A contextual arrange bar aligns selected cards left, center, right, top, middle, or bottom and distributes three or more cards horizontally or vertically. Arrangement acts on selected cards only, pins their presentation positions, and is undoable. **Move branch** uses the position snapshot from the beginning of a drag, so moving an L2, L3, or lower card moves every descendant by the same amount without changing reporting relationships. The **Connectors** control is a device-local editor preference with two modes: **Separate lanes** prevents positive-length line sharing and routes around cards; **Sibling combs** allows only nearby same-row relationships from the same parent to share an aligned trunk. Different parents and substantially different rows remain independently routed.

Click a connector to select it. Its automatic corner handles appear as hollow controls. Drag a handle to pin the current route and move its horizontal or vertical lane, or choose **Pin current route** before editing. Manual movement is axis-constrained and the router inserts orthogonal reconnection segments after cards move, so diagonal segments are never produced. **Reset connector** removes only that relationship's saved corner positions and returns it to obstacle-aware automatic routing. These changes are autosaved and undoable, and the selected routing mode plus saved pins are used by SVG, PNG, PDF, and PowerPoint exports.

## macOS desktop source test

The Electron source test wraps the same local application in a desktop window. It starts a private service bound to `127.0.0.1`, gives each launch a new secret token, and blocks the window from making non-loopback network requests. Electron runs with context isolation and sandboxing enabled and without Node.js access in the page.

For a first install or a later update, run:

```bash
/usr/bin/curl --fail --location --show-error \
  --output "$HOME/Downloads/orgchart-studio-install.zsh" \
  "https://raw.githubusercontent.com/adammalin/Org-Chart-Studio/refs/heads/main/scripts/bootstrap-mac-source-test.zsh"

/bin/zsh "$HOME/Downloads/orgchart-studio-install.zsh" \
  "$HOME/OrgChart-Studio-source-test"
```

Later, start the verified copy with:

```bash
/bin/zsh "$HOME/OrgChart-Studio-source-test/scripts/start-mac-source-test.zsh"
```

The first command needs only the `curl` included with macOS; GitHub CLI and GitHub authentication are not used. The bootstrap resolves `main` to one exact commit through GitHub's public API, downloads that commit, and records the commit and archive SHA-256 in `INSTALL-REVISION.txt` before running setup. Setup uses a compatible installed Node.js 22 runtime or downloads a private, pinned Node.js 22 runtime after checking its official SHA-256 checksum, installs exact package-lock versions, builds the local Worker, and runs a hidden Electron smoke test before opening the app. It then offers to register the bundled local MCP companion in `~/.codex/config.toml`; the installer backs up an existing configuration, marks its managed block, and updates that block on later installs. Restart ChatGPT Desktop or Codex once after accepting. This source-test method does not create a signed application under `/Applications` and does not bypass macOS Gatekeeper.

Working chart data is stored separately from the source at `~/Library/Application Support/ORNL OrgChart Studio/local-worker-data` by default. In **Backup & restore**, staff can choose another empty local folder for the live chart library and a different folder for backups. A live-folder change takes effect only after restart: the app copies every file, compares SHA-256 checksums, switches only after verification, and retains the prior folder as a recovery copy. Live data locations inside the source repository, OneDrive, Dropbox, iCloud, or another recognized cloud-sync root are rejected. A backup folder in OneDrive or Dropbox accepts encrypted packages only; explicitly unencrypted backups must use a separate local folder. Updating the source-test folder preserves the application-data directory, plus any `.runtime`, `node_modules`, local output, and local tool state inside the source folder; the bundled quick-start PDF alone is refreshed to the tested copy.

## Local data and Git protection

The desktop renderer is prevented from making non-loopback network requests, so the application itself has no upload path to GitHub or another remote service. The working D1/R2 data folder remains outside the repository. `.gitignore`, a tracked-file scanner, and repository `pre-commit`/`pre-push` hooks reject database files, Worker data folders, backup packages, source-evidence documents, chart-shaped structured data, credentials, known personnel examples, and user-specific filesystem paths before normal Git operations. The push hook checks both the current index and reachable Git history, so data committed by bypassing the commit hook is still caught before a normal push. `scripts/setup-mac-source-test.zsh` enables those hooks, and `npm run security:scan` checks the complete tracked index.

These controls protect the normal application and Git workflow; they cannot stop a person from deliberately bypassing hooks with Git override flags or manually copying/decrypting data into another application. Approved handling and access controls still apply. A cloud provider selected as the backup location will sync the encrypted package, so keep the passphrase separately in an approved password manager.

Run `npm run test:desktop` when developing the desktop wrapper. The one-page installation guide is generated at [docs/ORNL-OrgChart-Studio-macOS-Quick-Start.pdf](docs/ORNL-OrgChart-Studio-macOS-Quick-Start.pdf).

The human-test sequence and boundaries are documented in [docs/HUMAN-TEST-GUIDE.md](docs/HUMAN-TEST-GUIDE.md). The requirement-by-requirement local readiness record is [docs/READINESS-AUDIT.md](docs/READINESS-AUDIT.md).

## Import and source-document workflow

The ready path is structured data:

1. Download the CSV template from **Sources & imports**, or prepare a first-sheet Excel workbook, and place one organizational unit on each row.
2. Keep stable `id` values, and use `parentId` to define the primary hierarchy.
3. Validate the normalized CSV, workforce roster, JSON, or Excel file and inspect the preview. A workforce roster with `Full Name`, `Position Title`, and `Supervisor Full Name` is mapped into a supervisory chart automatically; unique middle-initial differences are tolerated. Blocking findings prevent chart creation, and a human-confirmation checkbox is required.
4. Review the new draft chart and its source register; an import creates a new chart and never overwrites the active chart.
5. Download the retained original or source manifest when needed. The manifest can be imported again as JSON.

Existing PowerPoint, Word, PDF, and image charts are evidence, not authoritative databases. Up to 10 unchanged reference files can accompany one structured import, with a 20 MB per-file and 25 MB combined intake limit. Download the AI normalization brief, use it only with an AI environment approved for the source material, resolve ambiguous text and connectors, then import the reviewed JSON while attaching the unchanged originals. From that point forward, the saved structured chart data is the editable source of truth and exports are derived artifacts.

## Codex-assisted handoff after installation

Codex can continue helping after the desktop source test is installed. The reviewed-file handoff remains available, and the installer can optionally register a local MCP companion:

1. For a new legacy chart, provide Codex with cleared PowerPoint, Word, PDF, image, roster, or spreadsheet files. Codex can normalize them into canonical JSON or CSV for review.
2. Import the reviewed structured file in **Sources & imports**, attach the unchanged originals as evidence, inspect the preview, and confirm it before creating the draft.
3. For an existing chart, download its **Source manifest**, provide that JSON to Codex with the requested structural or content changes, and import the revised manifest as a separate draft. The original chart is not overwritten. A manifest carries canonical units and relationships, not custom card positions or version history.
4. With the MCP companion installed, open OrgChart Studio first. ChatGPT Desktop or Codex can then list charts, read a user-selected chart, validate it, validate/import normalized CSV or JSON, create a blank draft, stage changes to an existing working draft for in-app review, and save the matching current draft as an immutable named version. Read tools are marked read-only; write tools use the `writes` approval mode. No delete, backup restore, source-file download, storage-location, or publication tool is exposed.
5. For visual layout changes, Codex can operate the local Electron interface when explicitly requested, while data changes can go through the validated local MCP tools. Neither path edits D1/R2 files directly.

The MCP server is an on-demand local STDIO process, not a hosted endpoint or a background database service. Each Electron launch writes a mode-`0600` loopback connection file containing a new random session token and removes it during normal shutdown. The MCP refuses non-loopback URLs and unsafe connection-file permissions. OrgChart Studio must be open for its tools to work. Chart fields returned by an MCP read become part of the AI conversation, so use it only with data approved for that ChatGPT/Codex environment. Remove the managed integration with `npm run mcp:remove`; reinstall it with `npm run mcp:configure`.

When an MCP write begins, the running interface shows a restrained green edge glow and a color-independent **AI preparing changes** receipt naming the operation. For `replace_chart_draft`, the AI-produced document is held only as a temporary in-memory proposal. **Review changes** opens a read-only proposed canvas, highlights added or changed cards and connectors, and lists every field as Before and After. The person must choose **Apply reviewed changes** or **Reject proposal**; the saved chart is untouched until Apply. Other completed writes use **AI edit saved** and **Review update**. Failed writes use an explicit warning state.

Apply and Reject decisions create a bounded local AI-assisted activity record containing the change summary and affected IDs, never the prompt. An accepted record initially shows **Awaiting the next named version** and is linked automatically when staff save the next named checkpoint. The Version history workspace shows this timeline. Temporary proposal documents and live activity signals remain Worker-memory-only and expire; retained review decisions are included in whole-library and selected-chart backups. If a local editor save collides with a newer accepted update, the stale editor copy is stopped instead of being silently retried over it.

This keeps human confirmation, structural validation, stale-write protection, autosave, named versions, and backups in the normal workflow. See [docs/CODEX-HANDOFF.md](docs/CODEX-HANDOFF.md) for the exact exchange pattern and boundaries.

## Backup protection and recovery

The dedicated **Backup & restore** workspace creates one portable recovery file. Choose **Entire library** to include every chart, layout, named version, retained AI review decision, source record, and available original imported file, or choose **Selected charts** to package only the checked charts and their related data. **Encrypted (recommended)** protects the package with AES-256-GCM using a key derived from a PBKDF2-SHA-256 passphrase. **Unencrypted** creates a readable JSON package only after an explicit warning is acknowledged. The desktop app refuses to write an unencrypted package directly to a recognized OneDrive, Dropbox, iCloud, or other cloud-sync folder. The passphrase for an encrypted package is not stored or recoverable by the application; keep it in an approved password manager, separate from the backup file.

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
