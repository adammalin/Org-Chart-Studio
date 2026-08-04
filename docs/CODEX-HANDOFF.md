# Codex handoff for installed OrgChart Studio

OrgChart Studio remains usable with Codex after the desktop source test is installed. Staff can deliberately exchange cleared files through the app's import/export controls, and the installer can optionally register a bounded local MCP companion for ChatGPT Desktop and Codex.

## Use the optional local MCP companion

1. At **Install the local MCP integration? [y/N]** during setup, type `y` and press Return. Pressing Return alone skips it; install it later with `npm run mcp:configure` from the installed source folder.
2. Restart ChatGPT Desktop or Codex once after registration.
3. Open OrgChart Studio before asking the AI to use an OrgChart Studio tool. The MCP process connects only to the running app's loopback service with its per-launch token.
4. Open **AI & MCP control**. Leave MCP paused until the intended session, then choose **All charts** or explicitly select the charts the AI may access. Session receipts show authorized operations without retaining prompts.
5. Ask the AI to call `list_charts` before naming a stable chart ID. A complete `get_chart` result enters the AI conversation, so use that tool only for an allowed chart approved for the AI environment in use.
6. For a new legacy chart, collect unchanged evidence in a local **Source intake bundle**. Have the AI call `list_import_intakes`, prepare canonical CSV or JSON, validate it, and prefer `stage_normalized_import` with the intake ID. The AI receives intake names and checksums, not source-file bytes through that tool.
7. In **AI import review**, inspect the proposed units, relationships, provenance, planned/current labels, evidence list, and quality findings. Choose **Create reviewed chart** or **Reject import**. No chart exists before acceptance.
8. For an existing chart, read the current chart and ask for the exact intended change. Approving `replace_chart_draft` stages a temporary proposal only while its `id`, `version`, and `updatedAt` still match; it does not overwrite the database.
9. During preparation, the app shows **AI preparing changes** with a green edge cue. After success, choose **Review changes**. Inspect the highlighted proposed canvas and every Before/After field, then choose **Apply reviewed changes** or **Reject proposal**. The proposal expires if it is left unresolved.
10. After Apply, open **Version history**, enter a meaningful summary, and save a named version. The accepted AI activity is linked to that checkpoint. `save_chart_version` snapshots only the matching current database chart; it cannot smuggle an unreviewed document around the proposal screen. A stale editor or AI copy cannot overwrite newer work.

The initial MCP intentionally excludes deletion, backup restore, source-file download, storage-location changes, passphrases, and publication. Read tools are marked read-only and the installer configures write tools to request approval. Pause/scope controls are session-local and reset on app restart. Applied/rejected chart-edit summaries are local timeline records and are included in backups; prompts and rejected import documents are not stored. Run `npm run mcp:remove` to remove only the installer-managed configuration block; the script preserves unrelated Codex settings and writes a backup before changing an existing config.

## Bring in a new legacy chart

1. Collect the cleared PowerPoint, Word, PDF, or image evidence without modifying the originals, then create a named **Source intake bundle** in the app. CSV, JSON, roster, or Excel files remain the structured normalization input.
2. Ask Codex to identify readable facts and list ambiguity before producing import data. Resolve uncertain connectors, names, titles, and reporting relationships with a human source owner.
3. Ask Codex for canonical JSON or CSV that follows the app's downloaded template or AI normalization brief. Preserve `sourceLocator`, `sourceCertainty`, `reviewNote`, and `planningState` whenever those facts are available.
4. With MCP, stage the normalized result and intake ID for in-app review. Without MCP, choose the structured file and the pending intake bundle in **Sources & imports**.
5. Review the quality findings and evidence mapping, resolve all blocking findings, and explicitly create the draft. Uncertain but non-blocking facts must remain labeled `inferred` or `needs_review` rather than being silently promoted to confirmed.

## Ask Codex to revise an existing chart

1. Open the chart and download **Source manifest** from **Sources & imports**.
2. Give the manifest to Codex with a precise list of approved changes. Do not include material that is not cleared for the AI environment in use.
3. Review the revised JSON, then import it. The import creates a separate draft and does not overwrite the existing chart. The manifest carries canonical units and relationships, but not custom card positions, named-version history, or original source-file bytes.
4. Use **Compare charts** to inspect added, removed, and changed units. If the source structure should replace the target structure, stage **Apply source structure** and accept it through the normal proposal screen. Original source-file bytes are not copied by this structural merge.
5. Export an encrypted library backup before deleting or archiving an older chart.

For small edits or layout changes, staff can make the change directly in **Chart editor**. If the user explicitly asks, Codex can operate the running Electron interface locally. Data changes may use MCP, but connector-corner dragging and other visual judgment still benefit from the visible editor. In both cases, the app must be open.

## Safety boundary

- Use the app UI, source manifest, canonical import, version, and backup paths.
- Local MCP prevents Git or public hosting from becoming the chart store, but chart fields returned by a tool are processed in the AI conversation. Do not call it on material that is not approved for that ChatGPT/Codex environment.
- Do not directly edit files under `~/Library/Application Support/ORNL OrgChart Studio/local-worker-data`; that can bypass validation and history or damage the store.
- Keep original evidence unchanged and retain it with the structured import.
- Treat AI-produced structure as a proposal until a human verifies the preview.
- Keep backup passphrases outside the app in an approved password manager.

This workflow keeps the saved structured chart as the source of truth while allowing Codex to help with extraction, formatting, quality checks, and bounded revisions.
