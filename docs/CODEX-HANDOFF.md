# Codex handoff for installed OrgChart Studio

OrgChart Studio remains usable with Codex after the desktop source test is installed. Staff can deliberately exchange cleared files through the app's import/export controls, and the installer can optionally register a bounded local MCP companion for ChatGPT Desktop and Codex.

## Use the optional local MCP companion

1. Accept **Install the local MCP integration?** during setup, or later run `npm run mcp:configure` from the installed source folder.
2. Restart ChatGPT Desktop or Codex once after registration.
3. Open OrgChart Studio before asking the AI to use an OrgChart Studio tool. The MCP process connects only to the running app's loopback service with its per-launch token.
4. Ask it to call `list_charts` before naming the stable chart ID. A complete `get_chart` result enters the AI conversation, so use that tool only for a chart approved for the AI environment in use.
5. For a new legacy chart, have the AI prepare canonical CSV or JSON, call `validate_normalized_import`, review the findings, and approve `import_normalized_chart`. Import always creates a new draft.
6. For an existing chart, read the current chart, review the exact proposed change, and approve `replace_chart_draft` only while its `id`, `version`, and `updatedAt` still match. Use `save_chart_version` with a meaningful label after review.

The initial MCP intentionally excludes deletion, backup restore, source-file download, storage-location changes, passphrases, and publication. Read tools are marked read-only and the installer configures write tools to request approval. Run `npm run mcp:remove` to remove only the installer-managed configuration block; the script preserves unrelated Codex settings and writes a backup before changing an existing config.

## Bring in a new legacy chart

1. Collect the cleared PowerPoint, Word, PDF, image, roster, CSV, or Excel sources without modifying the originals.
2. Ask Codex to identify readable facts and list ambiguity before producing import data. Resolve uncertain connectors, names, titles, and reporting relationships with a human source owner.
3. Ask Codex for canonical JSON or CSV that follows the app's downloaded template or AI normalization brief.
4. In **Sources & imports**, select that structured file and attach the unchanged originals as evidence.
5. Validate the preview, resolve all blocking findings, check the human-confirmation box, and create a new draft.

## Ask Codex to revise an existing chart

1. Open the chart and download **Source manifest** from **Sources & imports**.
2. Give the manifest to Codex with a precise list of approved changes. Do not include material that is not cleared for the AI environment in use.
3. Review the revised JSON, then import it. The import creates a separate draft and does not overwrite the existing chart. The manifest carries canonical units and relationships, but not custom card positions, named-version history, or original source-file bytes.
4. Compare the two charts, continue editing the approved draft, and save a named version.
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
